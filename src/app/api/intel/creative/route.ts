// GET /api/intel/creative?brandId=…
//
// Everything the system has learned about this brand's creative, and what it
// intends to do next. Exists because the learning was real but invisible: the
// creative loop, the hook-shape steering and the reach data all worked while
// being observable only through one-off scripts.
//
// Deliberately reports NOT-YET-KNOWN as a first-class answer. A dimension with
// two samples is shown with its verdict of insufficient_data rather than a
// confident-looking average, because the whole discipline of this loop is
// refusing to act on noise — and that refusal should be visible, not silent.

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, posts, postAnalytics, creativeGenerations } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import {
  aggregateByDimension, rankDimension, classifyHookPattern,
  MIN_CONFIDENT_SAMPLES, type Dimension, type StatRow,
} from '@/lib/brain/creative-stats';
import { patternShare, pickUnderusedPattern, TARGETABLE_PATTERNS } from '@/lib/brain/hook-shape';

export const dynamic = 'force-dynamic';

const DIMENSIONS: Dimension[] = ['hookPattern', 'angle', 'imageProvider', 'contentType'];

export async function GET(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, userId)));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  const rows = await db
    .select({
      hookPattern: creativeGenerations.hookPattern,
      angle: creativeGenerations.angle,
      imageProvider: creativeGenerations.imageProvider,
      contentType: creativeGenerations.contentType,
      reach: postAnalytics.reach,
      views: postAnalytics.views,
      saves: postAnalytics.saves,
    })
    .from(creativeGenerations)
    .leftJoin(posts, eq(posts.id, creativeGenerations.postId))
    .leftJoin(postAnalytics, eq(postAnalytics.postId, posts.id))
    .where(eq(creativeGenerations.brandId, brand.id));

  const withOutcome = rows.filter(r => r.reach != null) as StatRow[];

  // Reach/views over the most recent posts, so the headline numbers are real
  // rather than inferred from the scoring formula.
  const recent = await db
    .select({ reach: postAnalytics.reach, views: postAnalytics.views, at: posts.scheduledAt })
    .from(postAnalytics)
    .innerJoin(posts, eq(posts.id, postAnalytics.postId))
    .where(eq(posts.brandId, brand.id))
    .orderBy(desc(posts.scheduledAt))
    .limit(12);

  // What the next hook will be steered toward, and why.
  const recentPatterns = rows.map(r => r.hookPattern ?? classifyHookPattern(null)).filter(Boolean) as string[];
  const share = patternShare(recentPatterns);

  return NextResponse.json({
    brand: brand.slug,
    generations: rows.length,
    withOutcome: withOutcome.length,
    minConfidentSamples: MIN_CONFIDENT_SAMPLES,
    reach: {
      recent: recent.map(r => ({ at: r.at, reach: r.reach ?? 0, views: r.views ?? 0 })),
      avgReach: recent.length ? Math.round(recent.reduce((s, r) => s + (r.reach ?? 0), 0) / recent.length) : 0,
      avgViews: recent.length ? Math.round(recent.reduce((s, r) => s + (r.views ?? 0), 0) / recent.length) : 0,
    },
    dimensions: DIMENSIONS.map(d => ({
      dimension: d,
      verdict: rankDimension(withOutcome, d).verdict,
      stats: aggregateByDimension(withOutcome, d),
    })).filter(d => d.stats.length > 0),
    hookShape: {
      share,
      // Shapes with zero history are the range actually missing.
      unused: TARGETABLE_PATTERNS.filter(p => !(share[p] ?? 0)),
      nextTarget: pickUnderusedPattern(recentPatterns),
    },
  });
}
