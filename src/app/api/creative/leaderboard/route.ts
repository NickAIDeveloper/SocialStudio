// GET /api/creative/leaderboard?surface=organic|ads&brandId=&limit=
//
// Ranks the actual POSTS and ADS that worked, which is what the genome page
// shows now. The ingredient scores it used to lead with live on at
// /api/creative/genome and are demoted to a section at the bottom.
//
// Read-only.

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, postAnalytics, metaAds, metaAdInsights } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { rankOrganicPosts, buildVerdict } from '@/lib/leaderboard/organic';
import { rankAds, buildAdsVerdict, type LeaderboardAdInput } from '@/lib/leaderboard/ads';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
/** Rows pulled before ranking. Well above any real post count for one account. */
const MAX_SCAN = 200;

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

async function organicPayload(userId: string, brandId: string | null, limit: number) {
  const rows = await db
    .select({
      postId: posts.id,
      caption: posts.caption,
      hookText: posts.hookText,
      angle: posts.angle,
      processedImageUrl: posts.processedImageUrl,
      sourceImageUrl: posts.sourceImageUrl,
      publishedAt: posts.publishedAt,
      reach: postAnalytics.reach,
      likes: postAnalytics.likes,
    })
    .from(posts)
    .innerJoin(postAnalytics, eq(postAnalytics.postId, posts.id))
    .where(
      and(eq(posts.userId, userId), brandId ? eq(posts.brandId, brandId) : undefined),
    )
    .orderBy(desc(postAnalytics.reach))
    .limit(MAX_SCAN);

  const ranked = rankOrganicPosts(
    rows.map((r) => ({
      postId: r.postId,
      caption: r.caption,
      hookText: r.hookText,
      angle: r.angle,
      imageUrl: r.processedImageUrl ?? r.sourceImageUrl,
      publishedAt: r.publishedAt,
      reach: r.reach,
      likes: r.likes,
    })),
  );

  return {
    surface: 'organic' as const,
    rows: ranked.slice(0, limit),
    totalAnalysed: ranked.length,
    verdict: buildVerdict(ranked, { topN: limit }),
  };
}

async function adsPayload(userId: string, brandId: string | null, limit: number) {
  const adRows = await db
    .select()
    .from(metaAds)
    .where(and(eq(metaAds.userId, userId), brandId ? eq(metaAds.brandId, brandId) : undefined))
    .orderBy(desc(metaAds.createdAt))
    .limit(MAX_LIMIT);

  // Each snapshot row is a ROLLING last_14d aggregate stamped with the sync
  // date, not a daily delta (see /api/ads/sync-insights). Summing snapshots
  // would multiply the same spend by the number of syncs, so the newest row is
  // the total and the only one to read.
  const inputs: LeaderboardAdInput[] = [];
  for (const ad of adRows) {
    const [snap] = await db
      .select()
      .from(metaAdInsights)
      .where(eq(metaAdInsights.metaAdsId, ad.id))
      .orderBy(desc(metaAdInsights.snapshotDate))
      .limit(1);
    if (!snap) continue;
    const draft = (ad.draft ?? {}) as { headline?: unknown };
    inputs.push({
      adId: ad.id,
      label:
        typeof draft.headline === 'string' && draft.headline.trim()
          ? draft.headline.trim()
          : ad.objective,
      spend: Number(snap.spend),
      impressions: snap.impressions,
      reach: snap.reach,
      clicks: snap.clicks,
      results: snap.results,
      resultType: snap.resultType,
    });
  }

  const ranked = rankAds(inputs);
  return {
    surface: 'ads' as const,
    rows: ranked.slice(0, limit),
    totalAnalysed: ranked.length,
    verdict: buildAdsVerdict(ranked),
  };
}

export async function GET(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const surface = params.get('surface') ?? 'organic';
  if (surface !== 'ads' && surface !== 'organic') {
    return NextResponse.json(
      { error: 'unknown_surface', supported: ['ads', 'organic'] },
      { status: 400 },
    );
  }

  const brandId = params.get('brandId') || null;
  const limit = parseLimit(params.get('limit'));

  try {
    const payload =
      surface === 'organic'
        ? await organicPayload(userId, brandId, limit)
        : await adsPayload(userId, brandId, limit);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'leaderboard_failed' }, { status: 500 });
  }
}
