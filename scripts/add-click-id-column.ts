// Adds meta_ads.click_id — the first-party click id embedded in an ad's
// destination URL as `gv_cid`, so a conversion reported by the marketed product
// can be joined back to the ad that produced it.
//
// Additive and idempotent (IF NOT EXISTS), nullable: existing ads simply have
// no click id. Applied directly rather than via `drizzle-kit push` so unrelated
// schema drift is left alone.
//
// Run: npx tsx scripts/add-click-id-column.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);

  await sql`ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS click_id uuid`;
  console.log('✓ meta_ads.click_id');

  // Conversions arrive keyed by gv_cid, so this lookup must be indexed.
  await sql`CREATE INDEX IF NOT EXISTS meta_ads_click_id_idx ON meta_ads (click_id)`;
  console.log('✓ meta_ads_click_id_idx');

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'meta_ads' AND column_name = 'click_id'`;
  console.log('\nVerified:');
  for (const c of cols) {
    console.log(`  meta_ads.${c.column_name}  ${c.data_type}  nullable=${c.is_nullable}`);
  }
})();
