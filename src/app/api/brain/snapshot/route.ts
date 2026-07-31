import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  instagramAccounts,
  metaAccounts,
  scrapedAccounts,
  scrapedPosts,
  brainSnapshots,
  metaInsightsCache,
  posts,
  postAnalytics,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { snapshotIg } from '@/lib/brain/snapshot-ig';
import { matchMediaToPosts } from '@/lib/brain/attribution';
import type { IgMediaItem, IgInsightRow } from '@/lib/meta/ig-analytics';
import { snapshotAds } from '@/lib/brain/snapshot-ads';
import { snapshotCompetitor } from '@/lib/brain/snapshot-competitor';
import { decrypt } from '@/lib/encryption';
import { getFreshIgToken } from '@/lib/meta/ig-token';

export const dynamic = 'force-dynamic';

/**
 * Attributes each recent published autopilot post's real Instagram performance
 * (reach/saves/engagement) back to its post row, so the angle leaderboard can
 * learn which angles win for THIS account. Matches OUR posts to IG media by
 * caption (no IG media id is stored anywhere). Upserts one postAnalytics row per
 * matched post. Returns the number attributed.
 */
async function attributePostPerformance(
  brand: { id: string; userId: string },
  payload: { media: unknown[]; insightsByMediaId: Record<string, unknown> },
): Promise<number> {
  const mediaItems: IgMediaItem[] = (payload.media as Array<Record<string, unknown>>).map((m) => ({
    id: String(m.id),
    caption: typeof m.caption === 'string' ? m.caption : undefined,
    media_type: typeof m.media_type === 'string' ? m.media_type : 'IMAGE',
    timestamp: typeof m.timestamp === 'string' ? m.timestamp : undefined,
    like_count: typeof m.like_count === 'number' ? m.like_count : undefined,
    comments_count: typeof m.comments_count === 'number' ? m.comments_count : undefined,
    insights:
      (payload.insightsByMediaId[String(m.id)] as { data?: IgInsightRow[] } | undefined)?.data ?? [],
  }));

  const ourPosts = await db
    .select({
      id: posts.id,
      caption: posts.caption,
      publishedAt: posts.publishedAt,
      scheduledAt: posts.scheduledAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(eq(posts.brandId, brand.id), eq(posts.source, 'autopilot')))
    .orderBy(desc(posts.createdAt))
    .limit(60);

  const forMatch = ourPosts.map((p) => ({
    id: p.id,
    caption: p.caption,
    // IG media timestamp ≈ when it actually posted; prefer publishedAt, then the
    // scheduled slot, then generation time as the disambiguation anchor.
    publishedAt: p.publishedAt ?? p.scheduledAt ?? p.createdAt ?? null,
  }));

  const attributions = matchMediaToPosts(mediaItems, forMatch);
  for (const a of attributions) {
    await db
      .insert(postAnalytics)
      .values({
        postId: a.postId,
        userId: brand.userId,
        reach: a.metrics.reach,
        views: a.metrics.views,
        saves: a.metrics.saves,
        likes: a.metrics.likes,
        comments: a.metrics.comments,
        shares: a.metrics.shares,
      })
      .onConflictDoUpdate({
        target: postAnalytics.postId,
        set: {
          reach: a.metrics.reach,
          views: a.metrics.views,
          saves: a.metrics.saves,
          likes: a.metrics.likes,
          comments: a.metrics.comments,
          shares: a.metrics.shares,
          fetchedAt: new Date(),
        },
      });
  }
  if (attributions.length === 0 && ourPosts.length > 0) {
    // A healthy run matches most posts; 0/N means the caption-match join almost
    // certainly regressed (captionMatchKey normalization, or IG payload shape).
    console.warn(
      `[snapshot/ig] attributed 0/${ourPosts.length} posts for brand ${brand.id} — caption match likely regressed`,
    );
  } else {
    console.log(
      `[snapshot/ig] attributed ${attributions.length}/${ourPosts.length} autopilot posts for brand ${brand.id}`,
    );
  }
  return attributions.length;
}

// Both optional: the HMAC signature covers the request BODY only, so a scheduler
// that can send just a static `{}` (cron-job.org, any plain URL pinger) can sign
// one constant and still call this route. When they're absent we generate them —
// a run id only needs to be unique, and the day is always "today" in practice.
interface Body {
  runId?: string;
  day?: string;
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  const source = searchParams.get('source');
  if (!brandId || !source) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  let parsed: Body = {};
  try {
    parsed = rawBody ? (JSON.parse(rawBody) as Body) : {};
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const body = {
    runId: parsed.runId ?? randomUUID(),
    day: parsed.day ?? new Date().toISOString().slice(0, 10),
  };
  const dayDate = new Date(`${body.day}T00:00:00Z`);
  if (isNaN(dayDate.getTime())) {
    return NextResponse.json({ error: 'bad_day' }, { status: 400 });
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  // --- IG ---
  if (source === 'ig') {
    if (!brand.instagramHandle) {
      return NextResponse.json({ status: 'skipped', reason: 'no_ig_handle' });
    }
    const [igAcct] = await db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.userId, brand.userId),
          eq(instagramAccounts.igUsername, brand.instagramHandle)
        )
      );
    if (!igAcct) {
      return NextResponse.json({ status: 'skipped', reason: 'no_connection' });
    }

    // Refresh-before-read so the daily snapshot also keeps the token alive.
    const { token: igToken } = await getFreshIgToken(igAcct);

    // Captured from persist() so we can attribute post performance after the
    // snapshot without re-fetching media. persist() fires on cache-hit, full
    // success, and the post-processing partial path; it is SKIPPED on media-fetch
    // failure and the pre-insights rate-limit bail — in which case igPayload stays
    // null and attribution is safely skipped by the `if (igPayload)` guard below.
    let igPayload: { media: unknown[]; insightsByMediaId: Record<string, unknown> } | null = null;

    const result = await snapshotIg({
      brandId,
      userId: brand.userId,
      igUserId: igAcct.igUserId,
      accessToken: igToken,
      day: body.day,
      cacheRead: async (key) => {
        const [row] = await db
          .select()
          .from(metaInsightsCache)
          .where(
            and(
              eq(metaInsightsCache.userId, brand.userId),
              eq(metaInsightsCache.cacheKey, key)
            )
          );
        if (!row) return null;
        if (row.expiresAt.getTime() < Date.now()) return null;
        return row.data as { media: unknown[]; insightsByMediaId: Record<string, unknown> };
      },
      cacheWrite: async (key, value) => {
        await db
          .insert(metaInsightsCache)
          .values({
            userId: brand.userId,
            adAccountId: 'ig',
            cacheKey: key,
            data: value as Record<string, unknown>,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          })
          .onConflictDoUpdate({
            target: [
              metaInsightsCache.userId,
              metaInsightsCache.adAccountId,
              metaInsightsCache.cacheKey,
            ],
            set: { data: value as Record<string, unknown>, fetchedAt: new Date() },
          });
      },
      persist: async (payload) => {
        igPayload = payload as { media: unknown[]; insightsByMediaId: Record<string, unknown> };
        await db
          .insert(brainSnapshots)
          .values({
            brandId,
            source: 'ig',
            capturedAt: dayDate,
            payload: payload as Record<string, unknown>,
            metricsSummary: { sampleSize: payload.media.length },
          })
          .onConflictDoNothing();
      },
    });

    // Close the feedback loop: attribute each published autopilot post's REAL
    // Instagram reach/saves back to the `angle` that produced it, so generation
    // can favour the angles that actually win. Non-fatal — attribution must
    // never break the snapshot.
    if (igPayload) {
      try {
        const attributed = await attributePostPerformance(
          { id: brand.id, userId: brand.userId },
          igPayload,
        );
        return NextResponse.json({ ...result, attributed });
      } catch (err) {
        console.error(
          '[snapshot/ig] attribution failed (non-fatal):',
          err instanceof Error ? err.message : err,
        );
      }
    }

    return NextResponse.json(result);
  }

  // --- ADS ---
  if (source === 'ads') {
    const [meta] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, brand.userId));
    if (!meta) return NextResponse.json({ status: 'skipped', reason: 'no_connection' });

    const result = await snapshotAds({
      brandId,
      adAccountId: meta.selectedAdAccountId,
      accessToken: decrypt(meta.accessToken),
      day: body.day,
      persist: async (payload) => {
        await db
          .insert(brainSnapshots)
          .values({
            brandId,
            source: 'ads',
            capturedAt: dayDate,
            payload: payload as Record<string, unknown>,
            metricsSummary: { hasCampaigns: payload.hasCampaigns },
          })
          .onConflictDoNothing();
      },
    });
    return NextResponse.json(result);
  }

  // --- COMPETITOR_ACCOUNT ---
  if (source === 'competitor_account') {
    const competitors = await db
      .select({
        id: scrapedAccounts.id,
        handle: scrapedAccounts.handle,
        followerCount: scrapedAccounts.followerCount,
        postCount: scrapedAccounts.postCount,
      })
      .from(scrapedAccounts)
      .where(
        and(
          eq(scrapedAccounts.brandId, brandId),
          eq(scrapedAccounts.isCompetitor, true)
        )
      );

    const sinceDate = new Date(Date.now() - 28 * 86_400_000);
    const competitorPosts = await db
      .select({
        handle: scrapedAccounts.handle,
        caption: scrapedPosts.caption,
        likes: scrapedPosts.likes,
        comments: scrapedPosts.comments,
        mediaType: scrapedPosts.mediaType,
        postedAt: scrapedPosts.postedAt,
      })
      .from(scrapedPosts)
      .innerJoin(scrapedAccounts, eq(scrapedPosts.accountId, scrapedAccounts.id))
      .where(
        and(
          eq(scrapedAccounts.brandId, brandId),
          eq(scrapedAccounts.isCompetitor, true),
          gte(scrapedPosts.postedAt, sinceDate)
        )
      )
      .orderBy(desc(scrapedPosts.likes))
      .limit(150);

    const result = await snapshotCompetitor({
      brandId,
      competitors,
      persist: async (payload) => {
        await db
          .insert(brainSnapshots)
          .values({
            brandId,
            source: 'competitor_account',
            capturedAt: dayDate,
            payload: { ...payload, posts: competitorPosts } as Record<string, unknown>,
            metricsSummary: { count: payload.competitors.length, postCount: competitorPosts.length },
          })
          .onConflictDoNothing();
      },
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'unknown_source' }, { status: 400 });
}
