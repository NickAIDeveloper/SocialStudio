// Adds post_analytics.views — Meta's replacement for media impressions.
//
// ig-analytics.ts has always FETCHED 'views' (it's in METRIC_KEYS) but nothing
// ever persisted it, so the one secondary signal that actually varies at this
// account size was thrown away. Meanwhile `impressions` is deprecated by Meta
// for media and reads 0 on every row.
//
// Verified live 2026-07-31: a real post returned reach=10 views=24.
// Additive and idempotent.
//
// Run: npx tsx scripts/add-views-column.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);
  await sql`ALTER TABLE post_analytics ADD COLUMN IF NOT EXISTS views integer DEFAULT 0`;
  console.log('✓ post_analytics.views');
  const rows = await sql`
    SELECT count(*)::int AS n,
           sum(CASE WHEN reach > 0 THEN 1 ELSE 0 END)::int AS with_reach,
           sum(CASE WHEN views > 0 THEN 1 ELSE 0 END)::int AS with_views
    FROM post_analytics`;
  console.log(`\n${rows[0].n} analytics rows — ${rows[0].with_reach} have reach, ${rows[0].with_views} have views.`);
  console.log('(views backfills on the next nightly snapshot)');
})();
