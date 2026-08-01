// Creates brand_pain_points — what a brand's audience actually complains about,
// mined from public community discussions and ranked by recurrence.
//
// Purely additive: a NEW table, no change to any existing one. A brand with no
// row generates exactly as it does today.
//
// Run: npx tsx scripts/add-pain-points-table.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);
  await sql`
    CREATE TABLE IF NOT EXISTS brand_pain_points (
      brand_id            uuid PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
      source              varchar(64) NOT NULL,
      queries             jsonb,
      discussions_scanned integer NOT NULL DEFAULT 0,
      ranked              jsonb,
      fetched_at          timestamp NOT NULL DEFAULT now()
    )`;
  console.log('✓ brand_pain_points');
  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'brand_pain_points' ORDER BY ordinal_position`;
  console.log(`\n${cols.length} columns:`);
  for (const c of cols) console.log(`  ${String(c.column_name).padEnd(20)} ${c.data_type}`);
})();
