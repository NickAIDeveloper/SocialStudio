// One-off backfill: fill posts.failure_reason for autopilot posts that are
// ALREADY status='failed' with no recorded reason.
//
// Needed because reconcileStatus treats 'failed' as terminal — it never revisits
// those rows — so the posts lost during the 2026-07-26 → 07-30 pacebrain channel
// outage would stay unexplained forever. Going forward, reconcile records the
// reason at the moment a post fails.
//
// Read-only unless --apply is passed.
// Run: npx tsx scripts/backfill-failure-reasons.ts --prod [--apply]
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { brands, posts, linkedAccounts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';
import { getPostById } from '../src/lib/buffer';

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));
  let updated = 0;

  for (const brand of await db.select().from(brands)) {
    const rows = await db
      .select({ id: posts.id, bufferPostId: posts.bufferPostId, scheduledAt: posts.scheduledAt })
      .from(posts)
      .where(
        and(
          eq(posts.brandId, brand.id),
          eq(posts.source, 'autopilot'),
          eq(posts.status, 'failed'),
          isNotNull(posts.bufferPostId),
          isNull(posts.failureReason),
        ),
      );
    if (rows.length === 0) continue;

    const [link] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, brand.userId), eq(linkedAccounts.provider, 'buffer')));
    if (!link?.accessToken) {
      console.log(`\n=== ${brand.slug} === Buffer not connected, skipping ${rows.length} row(s)`);
      continue;
    }
    const apiKey = decrypt(link.accessToken);

    console.log(`\n=== ${brand.slug} === ${rows.length} failed post(s) with no reason`);
    for (const row of rows) {
      const lookup = await getPostById(apiKey, row.bufferPostId!);
      const reason = !lookup.found
        ? 'Buffer no longer has this post — it was dropped after a failed publish.'
        : lookup.error?.message && lookup.error.rawError
          ? `${lookup.error.message} (${lookup.error.rawError})`
          : (lookup.error?.message ?? lookup.error?.rawError ?? null);

      const when = row.scheduledAt?.toISOString() ?? '?';
      if (!reason) {
        console.log(`  ${when}  (Buffer offers no reason — left as-is)`);
        continue;
      }
      console.log(`  ${when}  ${reason}`);
      if (apply) {
        await db.update(posts).set({ failureReason: reason }).where(eq(posts.id, row.id));
        updated++;
      }
    }
  }

  console.log(apply ? `\nApplied: ${updated} row(s) updated.` : '\nDry run — pass --apply to write.');
})();
