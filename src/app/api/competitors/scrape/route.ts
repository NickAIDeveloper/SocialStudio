import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scrapedAccounts, scrapedPosts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { chromium } from 'playwright';

export const maxDuration = 300; // 5 min timeout

/**
 * POST /api/competitors/scrape
 * Deep scrape a single competitor using Playwright.
 * Runs one account at a time to avoid rate limits.
 * Body: { handle: string }
 */
export async function POST(request: NextRequest) {
  let browser;
  try {
    const userId = await getUserId();
    const body = await request.json();
    const handle = String(body.handle ?? '').trim();

    if (!handle) {
      return NextResponse.json({ error: 'handle required' }, { status: 400 });
    }

    // Find account in DB
    const [account] = await db
      .select()
      .from(scrapedAccounts)
      .where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.handle, handle)))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: 'Account not tracked' }, { status: 404 });
    }

    console.log(`[DeepScrape] Starting Playwright scrape for @${handle}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // Go to profile
    await page.goto(`https://www.instagram.com/${handle}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    // Wait and dismiss any login prompts
    await page.waitForTimeout(3000);
    for (const text of ['Not Now', 'Not now', 'Decline optional cookies', 'Allow all cookies', 'Accept All']) {
      try {
        const btn = page.locator(`text="${text}"`).first();
        if (await btn.isVisible({ timeout: 500 })) await btn.click();
      } catch { /* not found */ }
    }

    await page.waitForTimeout(1000);

    // Extract profile stats
    const profileStats = await page.evaluate(() => {
      const text = document.body.innerText;
      const parse = (match: RegExpMatchArray | null) => {
        if (!match) return 0;
        const s = match[1].replace(/,/g, '');
        if (/[kK]$/.test(s)) return Math.round(parseFloat(s) * 1000);
        if (/[mM]$/.test(s)) return Math.round(parseFloat(s) * 1000000);
        return parseInt(s, 10) || 0;
      };
      return {
        followers: parse(text.match(/([\d,.]+[KMkm]?)\s*followers/i)),
        following: parse(text.match(/([\d,.]+[KMkm]?)\s*following/i)),
        postCount: parse(text.match(/([\d,.]+[KMkm]?)\s*posts/i)),
      };
    });

    console.log(`[DeepScrape] @${handle}: ${profileStats.followers} followers`);

    // Scroll to load posts
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1500);
    }

    // Collect post links
    const postLinks = await page.evaluate(() => {
      const seen = new Set<string>();
      const links: string[] = [];
      document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]').forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        if (!seen.has(href)) { seen.add(href); links.push(href); }
      });
      return links;
    });

    console.log(`[DeepScrape] @${handle}: found ${postLinks.length} post links`);

    // Scrape individual posts (up to 12)
    interface PostData {
      shortcode: string;
      caption: string;
      likes: number;
      comments: number;
      imageUrl: string;
      isVideo: boolean;
      timestamp: string;
    }
    const posts: PostData[] = [];

    for (const link of postLinks.slice(0, 12)) {
      try {
        const shortcodeMatch = link.match(/\/(p|reel)\/([\w-]+)/);
        const shortcode = shortcodeMatch?.[2] ?? '';
        const isVideo = link.includes('/reel/');

        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(1000);

        const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => null);
        const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
        const timeEl = await page.locator('time[datetime]').first().getAttribute('datetime').catch(() => null);

        let likes = 0, comments = 0, caption = '';

        if (ogDesc) {
          const lm = ogDesc.match(/([\d,]+)\s*likes?/i);
          const cm = ogDesc.match(/([\d,]+)\s*comments?/i);
          if (lm) likes = parseInt(lm[1].replace(/,/g, ''), 10) || 0;
          if (cm) comments = parseInt(cm[1].replace(/,/g, ''), 10) || 0;
          const dash = ogDesc.indexOf(' - ');
          if (dash !== -1) caption = ogDesc.slice(dash + 3).trim();
        }

        posts.push({ shortcode, caption, likes, comments, imageUrl: ogImage ?? '', isVideo, timestamp: timeEl ?? '' });

        // Polite delay between posts
        await page.waitForTimeout(1200);
      } catch {
        // Skip failed post
      }
    }

    await browser.close().catch(() => {});
    browser = undefined;

    console.log(`[DeepScrape] @${handle}: scraped ${posts.length} posts`);

    // Store profile stats
    await db.update(scrapedAccounts).set({
      followerCount: profileStats.followers || undefined,
      followingCount: profileStats.following || undefined,
      postCount: profileStats.postCount || undefined,
      lastScrapedAt: new Date(),
    }).where(eq(scrapedAccounts.id, account.id));

    // Store posts
    let storedCount = 0;
    for (const post of posts) {
      if (!post.shortcode) continue;
      try {
        await db.insert(scrapedPosts).values({
          userId,
          accountId: account.id,
          shortcode: post.shortcode,
          caption: post.caption,
          likes: post.likes,
          comments: post.comments,
          imageUrl: post.imageUrl,
          isVideo: post.isVideo,
          hashtags: (post.caption.match(/#\w+/g) || []).join(','),
          postedAt: post.timestamp ? new Date(post.timestamp) : new Date(),
        }).onConflictDoNothing();
        storedCount++;
      } catch { /* duplicate */ }
    }

    // Compute quick analysis
    const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
    const totalComments = posts.reduce((s, p) => s + p.comments, 0);
    const avgLikes = posts.length > 0 ? Math.round(totalLikes / posts.length) : 0;
    const avgComments = posts.length > 0 ? Math.round(totalComments / posts.length) : 0;
    const engRate = profileStats.followers > 0 ? (((avgLikes + avgComments) / profileStats.followers) * 100).toFixed(2) : '0';

    // Best posting day/time
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayStats: Record<string, { total: number; count: number }> = {};
    const timeStats: Record<string, { total: number; count: number }> = {};
    for (const p of posts) {
      if (!p.timestamp) continue;
      const d = new Date(p.timestamp);
      if (isNaN(d.getTime())) continue;
      const eng = p.likes + p.comments;
      const day = DAYS[d.getDay()];
      dayStats[day] = { total: (dayStats[day]?.total ?? 0) + eng, count: (dayStats[day]?.count ?? 0) + 1 };
      const h = d.getHours();
      const block = h < 9 ? 'Early Morning' : h < 12 ? 'Morning' : h < 15 ? 'Afternoon' : h < 18 ? 'Late Afternoon' : 'Evening';
      timeStats[block] = { total: (timeStats[block]?.total ?? 0) + eng, count: (timeStats[block]?.count ?? 0) + 1 };
    }

    const bestDay = Object.entries(dayStats).sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0]?.[0] ?? 'N/A';
    const bestTime = Object.entries(timeStats).sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0]?.[0] ?? 'N/A';

    // Content mix
    const videoCount = posts.filter(p => p.isVideo).length;
    const imageCount = posts.length - videoCount;

    // Top hashtags
    const tagCount: Record<string, number> = {};
    for (const p of posts) {
      for (const t of (p.caption.match(/#\w+/g) ?? [])) {
        tagCount[t.toLowerCase()] = (tagCount[t.toLowerCase()] ?? 0) + 1;
      }
    }
    const topHashtags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);

    // Top and worst posts
    const sorted = [...posts].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments));

    return NextResponse.json({
      success: true,
      handle,
      profile: profileStats,
      postsScraped: posts.length,
      postsStored: storedCount,
      analysis: {
        avgLikes,
        avgComments,
        engagementRate: parseFloat(engRate),
        postsPerWeek: posts.length > 1 ? parseFloat((posts.length / Math.max(1, (Date.now() - new Date(posts[posts.length - 1]?.timestamp || Date.now()).getTime()) / (7 * 24 * 60 * 60 * 1000))).toFixed(1)) : 0,
        bestDay,
        bestTime,
        contentMix: {
          images: imageCount,
          reels: videoCount,
          imagePct: posts.length > 0 ? Math.round((imageCount / posts.length) * 100) : 0,
          reelPct: posts.length > 0 ? Math.round((videoCount / posts.length) * 100) : 0,
        },
        topHashtags,
        topPost: sorted[0] ?? null,
        worstPost: sorted.length > 1 ? sorted[sorted.length - 1] : null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[DeepScrape] Error:', error);
    return NextResponse.json({
      error: 'Scrape failed',
    }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
