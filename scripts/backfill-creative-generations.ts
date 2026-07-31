// Seeds creative_generations from existing autopilot posts, so the M2 loop
// starts with history instead of waiting weeks to accumulate rows.
//
// Only fields the posts table already holds can be recovered (angle, hook,
// content type, overlay style, and whether a composited image was used).
// Grade scores and model were never persisted per-post, so they stay null on
// backfilled rows — the aggregation ignores null dimensions rather than
// bucketing them, so this cannot skew results.
//
// Idempotent: skips posts that already have a generation row.
// Read-only unless --apply.
//
// Run: npx tsx scripts/backfill-creative-generations.ts --prod [--apply]
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
const apply = process.argv.includes('--apply');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq, isNull, sql as raw } from 'drizzle-orm';
import { brands, posts, creativeGenerations } from '../src/lib/db/schema';
import { classifyHookPattern } from '../src/lib/brain/creative-stats';

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));
  let inserted = 0;

  for (const brand of await db.select().from(brands)) {
    const rows = await db
      .select({
        id: posts.id,
        angle: posts.angle,
        hookText: posts.hookText,
        contentType: posts.contentType,
        overlayStyle: posts.overlayStyle,
        sourceImageUrl: posts.sourceImageUrl,
        processedImageUrl: posts.processedImageUrl,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(and(eq(posts.brandId, brand.id), eq(posts.source, 'autopilot')));
    if (rows.length === 0) continue;

    // Which of this brand's posts already have a row?
    const existing = await db
      .select({ postId: creativeGenerations.postId })
      .from(creativeGenerations)
      .where(eq(creativeGenerations.brandId, brand.id));
    const seen = new Set(existing.map(e => e.postId).filter(Boolean) as string[]);

    const todo = rows.filter(r => !seen.has(r.id));
    console.log(`\n=== ${brand.slug} === ${rows.length} autopilot posts, ${todo.length} to backfill`);
    if (todo.length === 0) continue;

    if (apply) {
      await db.insert(creativeGenerations).values(
        todo.map(r => ({
          brandId: brand.id,
          postId: r.id,
          surface: 'autopilot',
          angle: r.angle,
          hookPattern: classifyHookPattern(r.hookText),
          hookText: r.hookText,
          contentType: r.contentType,
          overlayStyle: r.overlayStyle,
          imageProvider: r.processedImageUrl ? 'god-mode' : (r.sourceImageUrl ? 'stock' : null),
          // createdAt preserved so time-based analysis reflects when the
          // creative was actually made, not when this script ran.
          createdAt: r.createdAt ?? new Date(),
        })),
      );
      inserted += todo.length;
    }
  }

  console.log(apply ? `\nApplied: ${inserted} row(s).` : '\nDry run — pass --apply to write.');

  if (apply) {
    const total = await db.select({ n: raw<number>`count(*)::int` }).from(creativeGenerations);
    const unlinked = await db
      .select({ n: raw<number>`count(*)::int` })
      .from(creativeGenerations)
      .where(isNull(creativeGenerations.postId));
    console.log(`creative_generations now holds ${total[0]?.n ?? 0} rows (${unlinked[0]?.n ?? 0} unlinked).`);
  }
})();
