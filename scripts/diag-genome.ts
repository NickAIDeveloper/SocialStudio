// Read-only: what has the genome actually learned?
//
// Prints ingredient/genome counts per surface, plus the current top 3
// ingredients per surface by shrunk_score (with n and the borrowed flag) so
// the leaderboard can be checked without the UI. Zero rows everywhere is
// expected until CREATIVE_GENOME_ENABLED is turned on and creatives start
// recording genomes — this script exists to make that state visible, not to
// prove the feature is broken.
//
// Run: npx tsx scripts/diag-genome.ts        (dev DB)
//      npx tsx scripts/diag-genome.ts --prod (prod DB)
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { creativeIngredients, creativeGenomes, creativeIngredientScores } from '../src/lib/db/schema';

const db = drizzle(neon(process.env.NEON_DB_URL!));

(async () => {
  const ingredients = await db.select().from(creativeIngredients);
  const genomes = await db.select().from(creativeGenomes);
  console.log(`ingredients: ${ingredients.length}`);
  console.log(`genomes: ${genomes.length}`);

  const bySurface = new Map<string, number>();
  for (const g of genomes) bySurface.set(g.surface, (bySurface.get(g.surface) ?? 0) + 1);
  for (const [s, n] of bySurface) console.log(`  ${s}: ${n}`);
  console.log(`wildcards: ${genomes.filter(g => g.wasWildcard).length}`);

  const scores = await db
    .select({
      surface: creativeIngredientScores.surface,
      n: creativeIngredientScores.n,
      meanReward: creativeIngredientScores.meanReward,
      shrunkScore: creativeIngredientScores.shrunkScore,
      borrowed: creativeIngredientScores.borrowed,
      dimension: creativeIngredients.dimension,
      value: creativeIngredients.value,
    })
    .from(creativeIngredientScores)
    .innerJoin(creativeIngredients, eq(creativeIngredients.id, creativeIngredientScores.ingredientId));

  console.log('\ningredient_scores:', scores.length);

  const scoresBySurface = new Map<string, typeof scores>();
  for (const s of scores) {
    const list = scoresBySurface.get(s.surface) ?? [];
    list.push(s);
    scoresBySurface.set(s.surface, list);
  }

  for (const surface of ['ads', 'organic']) {
    console.log(`\ntop 3 — ${surface}:`);
    const rows = scoresBySurface.get(surface) ?? [];
    if (rows.length === 0) {
      console.log('  (no scores yet)');
      continue;
    }
    const top3 = [...rows]
      .sort((a, b) => Number(b.shrunkScore ?? 0) - Number(a.shrunkScore ?? 0))
      .slice(0, 3);
    for (const r of top3) {
      const score = r.shrunkScore == null ? 'null' : Number(r.shrunkScore).toFixed(4);
      console.log(`  ${r.dimension}/${r.value}: shrunk_score=${score} n=${r.n} borrowed=${r.borrowed}`);
    }
  }
})();
