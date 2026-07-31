// Read-only end-to-end check of the channel-health guard against PROD Buffer,
// using the exact production code path (getChannelHealth → checkChannelPushable).
//
// Expected on 2026-07-30: pacebrain BLOCKED (isDisconnected), affectly ALLOWED.
//
// Run: npx tsx scripts/verify-channel-health.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { brands, autopilotSettings, linkedAccounts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';
import { getChannelHealth } from '../src/lib/buffer';
import { checkChannelPushable } from '../src/lib/autopilot/channel-health';

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));

  for (const brand of await db.select().from(brands)) {
    const [s] = await db
      .select()
      .from(autopilotSettings)
      .where(eq(autopilotSettings.brandId, brand.id));
    if (!s?.bufferChannelId || !s.bufferOrganizationId) {
      console.log(`\n=== ${brand.slug} === no Buffer channel configured`);
      continue;
    }

    const [link] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, brand.userId), eq(linkedAccounts.provider, 'buffer')));
    if (!link?.accessToken) {
      console.log(`\n=== ${brand.slug} === Buffer not connected`);
      continue;
    }

    const health = await getChannelHealth(decrypt(link.accessToken), s.bufferOrganizationId);
    const channel = health.get(s.bufferChannelId);
    const check = checkChannelPushable(channel);

    console.log(`\n=== ${brand.slug} (${s.bufferChannelName ?? s.bufferChannelId}) ===`);
    console.log(`  buffer flags: ${JSON.stringify({
      isDisconnected: channel?.isDisconnected,
      isLocked: channel?.isLocked,
      isQueuePaused: channel?.isQueuePaused,
    })}`);
    if (check.blocked) {
      console.log(`  → BLOCKED  ${check.code}`);
      console.log(`             ${check.message}`);
      console.log('  → autopilot would hold this post as a recoverable DRAFT');
    } else {
      console.log(`  → ALLOWED${check.warning ? `  (warning: ${check.warning})` : ''}`);
    }
  }
})();
