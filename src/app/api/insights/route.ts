import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  posts,
  postAnalytics,
  scrapedPosts,
  scrapedAccounts,
  insightsCache,
} from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { generateAnalyticsInsights } from '@/lib/insights-engine';
import { generateCompetitorInsights } from '@/lib/competitor-engine';
import { getHealthSummary } from '@/lib/health-score';
import type { InsightCard, PostData, CompetitorPostData } from '@/lib/health-score';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_NICHE_AVG_ENGAGEMENT = 50;

type InsightType = 'analytics' | 'competitors';

function isValidType(value: string | null): value is InsightType {
  return value === 'analytics' || value === 'competitors';
}

interface CachedPayload {
  insights: InsightCard[];
  healthScore?: number;
  summary?: string;
  computedAt: string;
}

function isCacheFresh(computedAt: Date): boolean {
  return Date.now() - computedAt.getTime() < ONE_HOUR_MS;
}

// ---------------------------------------------------------------------------
// Data mappers
// ---------------------------------------------------------------------------

function mapRowToPostData(
  row: typeof posts.$inferSelect,
  analytics: (typeof postAnalytics.$inferSelect) | undefined,
): PostData {
  return {
    id: row.id,
    caption: row.caption,
    likes: analytics?.likes ?? 0,
    comments: analytics?.comments ?? 0,
    saves: 0,
    shares: analytics?.shares ?? 0,
    reach: 0,
    impressions: analytics?.impressions ?? 0,
    hashtags: row.hashtags ? row.hashtags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    contentType: row.contentType ?? 'image',
    postedAt: row.publishedAt ?? row.createdAt ?? new Date(),
    brand: row.brandId,
  };
}

function mapScrapedToCompetitor(
  row: typeof scrapedPosts.$inferSelect,
  handle: string,
): CompetitorPostData {
  return {
    handle,
    caption: row.caption ?? '',
    likes: row.likes,
    comments: row.comments,
    hashtags: row.hashtags ? row.hashtags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    postedAt: row.postedAt ?? row.scrapedAt,
    isVideo: row.isVideo,
  };
}

// ---------------------------------------------------------------------------
// Compute functions
// ---------------------------------------------------------------------------

async function computeAnalytics(userId: string): Promise<CachedPayload> {
  // 1. Fetch Buffer-scheduled posts with analytics
  const userPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt))
    .limit(200);

  const postIds = userPosts.map((p) => p.id);

  const analyticsRows =
    postIds.length > 0
      ? await db
          .select()
          .from(postAnalytics)
          .where(eq(postAnalytics.userId, userId))
      : [];

  const analyticsMap = new Map(analyticsRows.map((a) => [a.postId, a]));

  const bufferPostData: PostData[] = userPosts.map((row) =>
    mapRowToPostData(row, analyticsMap.get(row.id)),
  );

  // 2. Fetch scraped Instagram posts (own accounts only — not competitors)
  const ownScrapedRows = await db
    .select({
      post: scrapedPosts,
      handle: scrapedAccounts.handle,
    })
    .from(scrapedPosts)
    .innerJoin(scrapedAccounts, eq(scrapedPosts.accountId, scrapedAccounts.id))
    .where(
      and(
        eq(scrapedPosts.userId, userId),
        eq(scrapedAccounts.isCompetitor, false),
      ),
    )
    .orderBy(desc(scrapedPosts.scrapedAt))
    .limit(200);

  const scrapedPostData: PostData[] = ownScrapedRows.map((r) => ({
    id: r.post.id,
    caption: r.post.caption ?? '',
    likes: r.post.likes,
    comments: r.post.comments,
    saves: 0,
    shares: 0,
    reach: 0,
    impressions: 0,
    hashtags: r.post.hashtags ? r.post.hashtags.split(',').map(t => t.trim()).filter(Boolean) : [],
    contentType: r.post.isVideo ? 'reel' : 'image',
    postedAt: r.post.postedAt ?? r.post.scrapedAt,
    brand: r.handle,
  }));

  // 3. Merge — scraped posts have real engagement, Buffer posts might not
  const postData = scrapedPostData.length > 0 ? scrapedPostData : bufferPostData;
  const allPostData = scrapedPostData.length > 0 && bufferPostData.length > 0
    ? [...scrapedPostData, ...bufferPostData.filter(bp => bp.likes > 0 || bp.comments > 0)]
    : postData;

  // 4. Get follower count for engagement rate benchmarking
  const ownAccounts = await db
    .select()
    .from(scrapedAccounts)
    .where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, false)));
  const followerCount = ownAccounts.reduce((max, a) => Math.max(max, a.followerCount ?? 0), 0);

  // 5. Calculate dynamic niche avg from competitor data
  const competitorAccountRows = await db
    .select()
    .from(scrapedAccounts)
    .where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, true)));

  let nicheAvg = DEFAULT_NICHE_AVG_ENGAGEMENT;
  if (competitorAccountRows.length > 0) {
    const compPostRows = await db
      .select()
      .from(scrapedPosts)
      .innerJoin(scrapedAccounts, eq(scrapedPosts.accountId, scrapedAccounts.id))
      .where(and(eq(scrapedPosts.userId, userId), eq(scrapedAccounts.isCompetitor, true)))
      .limit(200);

    if (compPostRows.length > 0) {
      const compAvgEng = compPostRows.reduce((s, r) => s + r.scraped_posts.likes + r.scraped_posts.comments, 0) / compPostRows.length;
      nicheAvg = Math.max(1, compAvgEng);
    }
  }

  const { insights, healthScore } = generateAnalyticsInsights(allPostData, nicheAvg, followerCount);
  const summary = getHealthSummary(healthScore, insights);
  const computedAt = new Date().toISOString();

  // Cache result (upsert)
  await db
    .insert(insightsCache)
    .values({
      userId,
      type: 'analytics',
      data: { insights, summary } as unknown as Record<string, unknown>,
      healthScore,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [insightsCache.userId, insightsCache.type],
      set: {
        data: { insights, summary } as unknown as Record<string, unknown>,
        healthScore,
        computedAt: new Date(),
      },
    });

  return { insights, healthScore, summary, computedAt };
}

async function computeCompetitors(userId: string): Promise<CachedPayload> {
  // Fetch competitor accounts with follower data
  const competitorAccountRows = await db
    .select()
    .from(scrapedAccounts)
    .where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, true)));

  // Fetch competitor scraped posts joined with scraped accounts
  const competitorRows = await db
    .select({
      post: scrapedPosts,
      handle: scrapedAccounts.handle,
    })
    .from(scrapedPosts)
    .innerJoin(scrapedAccounts, eq(scrapedPosts.accountId, scrapedAccounts.id))
    .where(
      and(
        eq(scrapedPosts.userId, userId),
        eq(scrapedAccounts.isCompetitor, true),
      ),
    )
    .orderBy(desc(scrapedPosts.scrapedAt))
    .limit(500);

  const competitorPosts: CompetitorPostData[] = competitorRows.map((r) =>
    mapScrapedToCompetitor(r.post, r.handle),
  );

  // Fetch user's own account for comparison
  const ownAccountRows = await db
    .select()
    .from(scrapedAccounts)
    .where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, false)));
  const ownAccount = ownAccountRows[0] ?? null;
  const userAccountData = ownAccount ? {
    handle: ownAccount.handle,
    followerCount: ownAccount.followerCount ?? 0,
    followingCount: ownAccount.followingCount ?? 0,
    postCount: ownAccount.postCount ?? 0,
  } : null;

  const competitorAccountData = competitorAccountRows.map(a => ({
    handle: a.handle,
    followerCount: a.followerCount ?? 0,
    followingCount: a.followingCount ?? 0,
    postCount: a.postCount ?? 0,
  }));

  // Also fetch user posts for comparison
  const userPostRows = await db
    .select()
    .from(posts)
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt))
    .limit(200);

  const analyticsRows =
    userPostRows.length > 0
      ? await db
          .select()
          .from(postAnalytics)
          .where(eq(postAnalytics.userId, userId))
      : [];

  const analyticsMap = new Map(analyticsRows.map((a) => [a.postId, a]));

  // Also include scraped own posts (they have real engagement data)
  const ownScrapedRows = ownAccount
    ? await db.select().from(scrapedPosts).where(and(eq(scrapedPosts.userId, userId), eq(scrapedPosts.accountId, ownAccount.id))).orderBy(desc(scrapedPosts.scrapedAt)).limit(100)
    : [];

  const scrapedUserPosts: PostData[] = ownScrapedRows.map(r => ({
    id: r.id, caption: r.caption ?? '', likes: r.likes, comments: r.comments,
    saves: 0, shares: 0, reach: 0, impressions: 0,
    hashtags: r.hashtags ? r.hashtags.split(',').map(t => t.trim()).filter(Boolean) : [],
    contentType: r.isVideo ? 'reel' : 'image',
    postedAt: r.postedAt ?? r.scrapedAt, brand: ownAccount?.handle ?? '',
  }));

  const bufferUserPosts: PostData[] = userPostRows.map((row) =>
    mapRowToPostData(row, analyticsMap.get(row.id)),
  );

  const userPosts = scrapedUserPosts.length > 0 ? scrapedUserPosts : bufferUserPosts;

  const insights = generateCompetitorInsights(userPosts, competitorPosts, userAccountData, competitorAccountData);
  const computedAt = new Date().toISOString();

  // Cache result (upsert)
  await db
    .insert(insightsCache)
    .values({
      userId,
      type: 'competitors',
      data: { insights } as unknown as Record<string, unknown>,
      healthScore: null,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [insightsCache.userId, insightsCache.type],
      set: {
        data: { insights } as unknown as Record<string, unknown>,
        healthScore: null,
        computedAt: new Date(),
      },
    });

  return { insights, computedAt };
}

// ---------------------------------------------------------------------------
// GET — return cached or compute fresh
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!isValidType(type)) {
      return NextResponse.json(
        { error: 'Invalid type — use "analytics" or "competitors"' },
        { status: 400 },
      );
    }

    // Check cache
    const [cached] = await db
      .select()
      .from(insightsCache)
      .where(and(eq(insightsCache.userId, userId), eq(insightsCache.type, type)));

    if (cached && isCacheFresh(cached.computedAt)) {
      const data = cached.data as { insights: InsightCard[]; summary?: string } | null;
      return NextResponse.json({
        insights: data?.insights ?? [],
        healthScore: cached.healthScore ?? undefined,
        summary: data?.summary ?? undefined,
        computedAt: cached.computedAt.toISOString(),
      });
    }

    // Compute fresh
    const result =
      type === 'analytics'
        ? await computeAnalytics(userId)
        : await computeCompetitors(userId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — force refresh regardless of cache
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!isValidType(type)) {
      return NextResponse.json(
        { error: 'Invalid type — use "analytics" or "competitors"' },
        { status: 400 },
      );
    }

    const result =
      type === 'analytics'
        ? await computeAnalytics(userId)
        : await computeCompetitors(userId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to refresh insights' }, { status: 500 });
  }
}
