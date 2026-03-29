import { NextResponse } from 'next/server';
import {
  scrapeInstagramAccounts,
  saveScrapedData,
  loadScrapedData,
} from '@/lib/instagram-scraper';

export const maxDuration = 60;

export async function POST() {
  try {
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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Scrape failed',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const data = loadScrapedData();
  if (!data) {
    return NextResponse.json({ posts: [], scrapedAt: null });
  }
  return NextResponse.json(data);
}
