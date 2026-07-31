// Adds the two nullable columns the Buffer channel-health fix needs:
//   posts.failure_reason          — why a failed post failed, in Buffer's words
//   autopilot_settings.channel_alert_at — one-alert-per-outage latch
//
// Additive and idempotent (IF NOT EXISTS): safe to re-run, touches no existing
// data. Applied directly rather than via `drizzle-kit push` so unrelated schema
// drift is left alone.
//
// Run: npx tsx scripts/add-channel-health-columns.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);

  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS failure_reason text`;
  console.log('✓ posts.failure_reason');

  await sql`ALTER TABLE autopilot_settings ADD COLUMN IF NOT EXISTS channel_alert_at timestamp`;
  console.log('✓ autopilot_settings.channel_alert_at');

  const cols = await sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE (table_name = 'posts' AND column_name = 'failure_reason')
       OR (table_name = 'autopilot_settings' AND column_name = 'channel_alert_at')
    ORDER BY table_name`;
  console.log('\nVerified:');
  for (const c of cols) {
    console.log(`  ${c.table_name}.${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}`);
  }
})();
