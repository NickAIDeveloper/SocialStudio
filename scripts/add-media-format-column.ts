// Adds autopilot_settings.media_format — the opt-in Reels format (M3).
//
// Defaults to 'image' and backfills every existing row to 'image', so brands
// that never opt in behave exactly as they do today. Additive and idempotent.
//
// Run: npx tsx scripts/add-media-format-column.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);

  await sql`ALTER TABLE autopilot_settings
            ADD COLUMN IF NOT EXISTS media_format varchar(16) NOT NULL DEFAULT 'image'`;
  console.log("✓ autopilot_settings.media_format (default 'image')");

  const rows = await sql`
    SELECT media_format, count(*)::int AS n FROM autopilot_settings GROUP BY media_format`;
  console.log('\nFormat per brand:');
  for (const r of rows) console.log(`  ${r.media_format} → ${r.n}`);
})();
