// One-time backfill: reconcile existing autopilot post statuses against Buffer.
// Mirrors src/lib/autopilot/reconcile.ts but uses relative imports so it runs
// under tsx without the @/ path alias.
//
//   npx tsx scripts/backfill-buffer-status.ts --prod          (dry run)
//   npx tsx scripts/backfill-buffer-status.ts --prod --apply  (writes)
import 'dotenv/config';
import { config } from 'dotenv';
const useProd = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq, isNotNull } from 'drizzle-orm';
import { brands, posts, autopilotSettings, linkedAccounts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';
import { getOrgPostStatusMap, getPostById, type BufferPostLookup } from '../src/lib/buffer';
import { reconcileStatus } from '../src/lib/autopilot/reconcile-status';

const sql = neon(process.env.NEON_DB_URL!);
const db = drizzle(sql);

(async () => {
  console.log(`\nENV=${useProd ? 'prod' : 'local'}  MODE=${apply ? 'APPLY' : 'DRY RUN'}\n`);
  const allBrands = await db.select().from(brands);

  for (const b of allBrands) {
    const [settings] = await db.select().from(autopilotSettings).where(eq(autopilotSettings.brandId, b.id));
    if (!settings?.bufferOrganizationId) continue;

    const scheduled = await db
      .select({ id: posts.id, status: posts.status, bufferPostId: posts.bufferPostId, hookText: posts.hookText })
      .from(posts)
      .where(and(eq(posts.brandId, b.id), eq(posts.source, 'autopilot'), eq(posts.status, 'scheduled'), isNotNull(posts.bufferPostId)));
    if (scheduled.length === 0) { console.log(`${b.slug}: nothing scheduled`); continue; }

    const [link] = await db.select().from(linkedAccounts).where(and(eq(linkedAccounts.userId, b.userId), eq(linkedAccounts.provider, 'buffer')));
    if (!link?.accessToken) { console.log(`${b.slug}: no buffer token`); continue; }
    const apiKey = decrypt(link.accessToken);

    const orgMap = await getOrgPostStatusMap(apiKey, settings.bufferOrganizationId);
    let published = 0, failed = 0, unchanged = 0;

    console.log(`=== ${b.slug} (${scheduled.length} scheduled) ===`);
    for (const row of scheduled) {
      const id = row.bufferPostId!;
      const fromFeed = orgMap.get(id);
      const lookup: BufferPostLookup = fromFeed ? { found: true, status: fromFeed.status, dueAt: fromFeed.dueAt } : await getPostById(apiKey, id);
      const patch = reconcileStatus(row.status, lookup);
      const hook = (row.hookText ?? '').slice(0, 32);
      if (!patch) { unchanged++; continue; }
      console.log(`  ${patch.status.toUpperCase().padEnd(9)} "${hook}"  (buffer=${lookup.found ? lookup.status : 'NOT_FOUND'})`);
      if (apply) {
        await db.update(posts).set({ status: patch.status, publishedAt: patch.publishedAt, updatedAt: new Date() }).where(eq(posts.id, row.id));
      }
      if (patch.status === 'published') published++; else failed++;
    }
    console.log(`  -> published=${published} failed=${failed} unchanged=${unchanged}\n`);
  }
  process.exit(0);
})();
