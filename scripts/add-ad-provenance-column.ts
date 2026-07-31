// Adds meta_ads.created_by — provenance, so the ads agent can only ever pause
// or promote ads it created itself.
//
// Existing rows are backfilled to 'human': everything published so far went
// through the /ads builder, and anything of unknown origin must be treated as
// off-limits rather than fair game. Additive and idempotent.
//
// Run: npx tsx scripts/add-ad-provenance-column.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);

  await sql`ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS created_by varchar(16)`;
  console.log('✓ meta_ads.created_by');

  // Everything that exists today was built by hand. Tag it explicitly so the
  // agent's "not agent-created" check is decided by data, not by a null.
  const res = await sql`UPDATE meta_ads SET created_by = 'human' WHERE created_by IS NULL`;
  console.log(`✓ backfilled ${res.length ?? 0} existing ads to 'human'`);

  const rows = await sql`
    SELECT created_by, count(*)::int AS n FROM meta_ads GROUP BY created_by ORDER BY created_by`;
  console.log('\nProvenance now:');
  for (const r of rows) console.log(`  ${r.created_by ?? '(null)'} → ${r.n}`);
})();
