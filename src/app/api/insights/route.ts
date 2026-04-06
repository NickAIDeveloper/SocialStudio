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
const NICHE_AVG_ENGAGEMENT = 50; // sensible default until we have niche data

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
  // Fetch user posts with analytics
  const userPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt))
    .limit(200);

  const postIds = userPosts.map((p) => p.id);

  // Fetch analytics for those posts
  const analyticsRows =
    postIds.length > 0
      ? await db
          .select()
          .from(postAnalytics)
          .where(eq(postAnalytics.userId, userId))
      : [];

  const analyticsMap = new Map(analyticsRows.map((a) => [a.postId, a]));

  const postData: PostData[] = userPosts.map((row) =>
    mapRowToPostData(row, analyticsMap.get(row.id)),
  );

  const { insights, healthScore } = generateAnalyticsInsights(postData, NICHE_AVG_ENGAGEMENT);
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

  const userPosts: PostData[] = userPostRows.map((row) =>
    mapRowToPostData(row, analyticsMap.get(row.id)),
  );

  const insights = generateCompetitorInsights(userPosts, competitorPosts);
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
