// Upserts the builtin ingredient vocabulary. Idempotent: re-running refreshes
// prompt fragments without duplicating rows or disturbing externally-sourced
// ingredients (spec 2 inserts those with a different `source`).
//
// Run: npx tsx scripts/seed-creative-ingredients.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';
import { BUILTIN_INGREDIENTS } from '../src/lib/creative/vocabulary';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);
  for (const i of BUILTIN_INGREDIENTS) {
    await sql`
      INSERT INTO creative_ingredients (dimension, value, prompt_fragment, source)
      VALUES (${i.dimension}, ${i.value}, ${i.promptFragment}, 'builtin')
      ON CONFLICT (dimension, value)
      DO UPDATE SET prompt_fragment = EXCLUDED.prompt_fragment`;
  }
  const counts = await sql`
    SELECT dimension, count(*)::int AS n FROM creative_ingredients
    GROUP BY dimension ORDER BY dimension`;
  console.log(`Seeded ${BUILTIN_INGREDIENTS.length} ingredients:`);
  for (const c of counts) console.log(`  ${c.dimension}: ${c.n}`);
})();
