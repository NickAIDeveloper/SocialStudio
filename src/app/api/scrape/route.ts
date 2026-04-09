import { NextRequest, NextResponse } from 'next/server';
import {
  scrapeInstagramAccounts,
  scrapeCompetitorAccounts,
  saveScrapedData,
  loadScrapedData,
  saveCompetitorData,
  loadCompetitorData,
} from '@/lib/instagram-scraper';
import { generateIntelligenceReport } from '@/lib/content-intelligence';
import { getUserId } from '@/lib/auth-helpers';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    await getUserId();

    const { searchParams } = new URL(request.url);
    const target = searchParams.get('target');
    if (target === 'competitors') {
      const result = await scrapeCompetitorAccounts();
      saveCompetitorData(result);
      return NextResponse.json({
        success: true,
        postsScraped: result.posts.length,
        accounts: result.accounts,
        errors: result.errors,
        scrapedAt: result.scrapedAt,
      });
    }

    // Default: scrape own accounts
    const result = await scrapeInstagramAccounts();
    saveScrapedData(result);
    return NextResponse.json({
      success: true,
      postsScraped: result.posts.length,
      accounts: result.accounts,
      errors: result.errors,
      scrapedAt: result.scrapedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Scrape failed',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await getUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'intelligence') {
    const ownData = loadScrapedData();
    const compData = loadCompetitorData();
    const ownPosts = ownData?.posts ?? [];
    const compPosts = compData?.posts ?? [];

    if (ownPosts.length === 0 && compPosts.length === 0) {
      return NextResponse.json({ report: null, message: 'No scraped data available. Sync from Instagram first.' });
    }

    const report = generateIntelligenceReport(ownPosts, compPosts);
    return NextResponse.json({
      report,
      ownScrapedAt: ownData?.scrapedAt ?? null,
      competitorScrapedAt: compData?.scrapedAt ?? null,
    });
  }

  if (action === 'competitors') {
    // Try DB first (new approach)
    try {
      const userId = await getUserId();
      const { db } = await import('@/lib/db');
      const { scrapedPosts, scrapedAccounts } = await import('@/lib/db/schema');
      const { eq, and, desc } = await import('drizzle-orm');

      const rows = await db
        .select({
          shortcode: scrapedPosts.shortcode,
          caption: scrapedPosts.caption,
          likes: scrapedPosts.likes,
          comments: scrapedPosts.comments,
          isVideo: scrapedPosts.isVideo,
          imageUrl: scrapedPosts.imageUrl,
          postedAt: scrapedPosts.postedAt,
          handle: scrapedAccounts.handle,
          isCompetitor: scrapedAccounts.isCompetitor,
        })
        .from(scrapedPosts)
        .innerJoin(scrapedAccounts, eq(scrapedPosts.accountId, scrapedAccounts.id))
        .where(and(
          eq(scrapedPosts.userId, userId),
          eq(scrapedAccounts.isCompetitor, true),
        ))
        .orderBy(desc(scrapedPosts.scrapedAt))
        .limit(500);

      if (rows.length > 0) {
        return NextResponse.json({
          posts: rows.map(r => ({
            shortcode: r.shortcode,
            caption: r.caption ?? '',
            likes: r.likes,
            comments: r.comments,
            isVideo: r.isVideo,
            imageUrl: r.imageUrl ?? '',
            postedAt: r.postedAt?.toISOString() ?? '',
            accountHandle: r.handle,
            isCompetitor: r.isCompetitor,
          })),
          scrapedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Fall through to file-based
    }

    const data = loadCompetitorData();
    if (!data) {
      return NextResponse.json({ posts: [], scrapedAt: null });
    }
    return NextResponse.json(data);
  }

  // Default: return own scraped data
  const data = loadScrapedData();
  if (!data) {
    return NextResponse.json({ posts: [], scrapedAt: null });
  }
  return NextResponse.json(data);
}
