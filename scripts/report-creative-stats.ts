// Reports what the M2 creative loop currently knows, per brand.
//
// Joins creative_generations → post_analytics and ranks each dimension. The
// point of the output is as much the VERDICT as the numbers: at a few posts a
// week most dimensions should honestly read "insufficient_data", and this
// script exists to make that visible rather than letting a 2-sample average
// masquerade as a finding.
//
// Read-only. Run: npx tsx scripts/report-creative-stats.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { brands, posts, postAnalytics, creativeGenerations } from '../src/lib/db/schema';
import { aggregateByDimension, rankDimension, MIN_CONFIDENT_SAMPLES, type Dimension, type StatRow } from '../src/lib/brain/creative-stats';

const DIMENSIONS: Dimension[] = ['angle', 'hookPattern', 'imageProvider', 'contentType', 'overlayStyle'];

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));

  for (const brand of await db.select().from(brands)) {
    const rows = await db
      .select({
        angle: creativeGenerations.angle,
        hookPattern: creativeGenerations.hookPattern,
        imageProvider: creativeGenerations.imageProvider,
        contentType: creativeGenerations.contentType,
        overlayStyle: creativeGenerations.overlayStyle,
        reach: postAnalytics.reach,
        saves: postAnalytics.saves,
      })
      .from(creativeGenerations)
      .leftJoin(posts, eq(posts.id, creativeGenerations.postId))
      .leftJoin(postAnalytics, eq(postAnalytics.postId, posts.id))
      .where(eq(creativeGenerations.brandId, brand.id));
    if (rows.length === 0) continue;

    const withOutcome = rows.filter(r => r.reach != null || r.saves != null);
    console.log(`\n${'='.repeat(66)}\n${brand.slug}: ${rows.length} generations, ${withOutcome.length} with outcome data`);

    if (withOutcome.length === 0) {
      console.log('  → no attributed analytics yet; the loop has nothing to learn from.');
      continue;
    }

    for (const dim of DIMENSIONS) {
      const verdict = rankDimension(withOutcome as StatRow[], dim);
      const stats = aggregateByDimension(withOutcome as StatRow[], dim);
      if (stats.length === 0) continue;

      console.log(`\n  ${dim}  →  ${verdict.verdict.toUpperCase()}` +
        (verdict.leader ? ` (${verdict.leader.value})` : ''));
      for (const s of stats) {
        const flag = s.confident ? ' ' : '!';
        console.log(
          `   ${flag} ${String(s.value).padEnd(14)} n=${String(s.samples).padStart(3)}  mean=${s.meanScore.toFixed(1)}`,
        );
      }
    }
  }
  console.log(`\n(! = fewer than ${MIN_CONFIDENT_SAMPLES} samples — shown, but not to be acted on)`);
})();
