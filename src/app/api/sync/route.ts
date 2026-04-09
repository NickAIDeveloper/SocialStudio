import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  linkedAccounts,
  brands,
  scrapedAccounts,
  scrapedPosts,
} from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { getSentPostsWithAnalytics } from '@/lib/buffer';

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Instagram profile scraper (lightweight — no Playwright needed)
// ---------------------------------------------------------------------------

interface ScrapedProfile {
  handle: string;
  followers: number;
  following: number;
  postCount: number;
  bio: string;
  posts: Array<{
    shortcode: string;
    caption: string;
    likes: number;
    comments: number;
    imageUrl: string;
    isVideo: boolean;
    timestamp: string;
  }>;
}

async function scrapeInstagramProfile(handle: string): Promise<ScrapedProfile | null> {
  try {
    // Use Instagram's public JSON endpoint (no auth required)
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${handle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-IG-App-ID': '936619743392459',
      },
    });

    if (!res.ok) {
      console.log(`[Scraper] JSON API ${res.status} for @${handle}, falling back to HTML`);
      // Fallback: try the HTML page and extract from meta tags
      return scrapeInstagramHTML(handle);
    }

    const data = await res.json();
    const user = data?.data?.user;
    if (!user) return scrapeInstagramHTML(handle);

    const posts = (user.edge_owner_to_timeline_media?.edges ?? []).map(
      (edge: Record<string, unknown>) => {
        const node = edge.node as Record<string, unknown>;
        const captionEdges = (node.edge_media_to_caption as Record<string, unknown>)?.edges as Array<Record<string, unknown>> ?? [];
        const caption = captionEdges[0]?.node
          ? String((captionEdges[0].node as Record<string, unknown>).text ?? '')
          : '';

        return {
          shortcode: String(node.shortcode ?? ''),
          caption,
          likes: Number((node.edge_liked_by as Record<string, unknown>)?.count ?? 0),
          comments: Number((node.edge_media_to_comment as Record<string, unknown>)?.count ?? 0),
          imageUrl: String(node.display_url ?? node.thumbnail_src ?? ''),
          isVideo: Boolean(node.is_video),
          timestamp: node.taken_at_timestamp
            ? new Date(Number(node.taken_at_timestamp) * 1000).toISOString()
            : new Date().toISOString(),
        };
      },
    );

    return {
      handle,
      followers: Number(user.edge_followed_by?.count ?? 0),
      following: Number(user.edge_follow?.count ?? 0),
      postCount: Number(user.edge_owner_to_timeline_media?.count ?? 0),
      bio: String(user.biography ?? ''),
      posts,
    };
  } catch {
    return scrapeInstagramHTML(handle);
  }
}

async function scrapeInstagramHTML(handle: string): Promise<ScrapedProfile | null> {
  try {
    const res = await fetch(`https://www.instagram.com/${handle}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Extract from meta tags (handle any attribute order)
    const descMatch = html.match(/content="(\d+\s*Followers[^"]*)"/i)
      ?? html.match(/<meta[^>]*(?:og:description|name="description")[^>]*content="([^"]*)"/i);
    const desc = descMatch?.[1] ?? '';
    console.log(`[Scraper HTML] @${handle} desc: "${desc.substring(0, 80)}"`);

    // Parse "X Followers, Y Following, Z Posts"
    const followersMatch = desc.match(/([\d,.]+[KMkm]?)\s*Followers/i);
    const followingMatch = desc.match(/([\d,.]+[KMkm]?)\s*Following/i);
    const postsMatch = desc.match(/([\d,.]+[KMkm]?)\s*Posts/i);

    const parseCount = (s: string | undefined): number => {
      if (!s) return 0;
      const cleaned = s.replace(/,/g, '');
      if (cleaned.match(/[Kk]$/)) return Math.round(parseFloat(cleaned) * 1000);
      if (cleaned.match(/[Mm]$/)) return Math.round(parseFloat(cleaned) * 1000000);
      return parseInt(cleaned, 10) || 0;
    };

    return {
      handle,
      followers: parseCount(followersMatch?.[1]),
      following: parseCount(followingMatch?.[1]),
      postCount: parseCount(postsMatch?.[1]),
      bio: '',
      posts: [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Buffer sync — pull sent posts with stats
// ---------------------------------------------------------------------------

interface BufferSyncResult {
  postsSynced: number;
  error?: string;
}

async function syncBufferPosts(userId: string): Promise<BufferSyncResult> {
  // Get user's Buffer API key
  const [bufferAccount] = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'buffer')))
    .limit(1);

  if (!bufferAccount?.accessToken) {
    return { postsSynced: 0, error: 'Buffer not connected' };
  }

  let apiKey: string;
  try {
    apiKey = decrypt(bufferAccount.accessToken);
  } catch {
    return { postsSynced: 0, error: 'Buffer key decryption failed' };
  }

  try {
    const posts = await getSentPostsWithAnalytics(apiKey);
    return { postsSynced: posts.length };
  } catch (err) {
    return { postsSynced: 0, error: err instanceof Error ? err.message : 'Buffer API error' };
  }
}

// ---------------------------------------------------------------------------
// Instagram sync — scrape tracked accounts and store in DB
// ---------------------------------------------------------------------------

interface ProfileStats {
  handle: string;
  followers: number;
  following: number;
  postCount: number;
}

interface InstagramSyncResult {
  accountsSynced: number;
  postsSynced: number;
  profiles: ProfileStats[];
  errors: string[];
}

async function syncInstagramAccounts(userId: string): Promise<InstagramSyncResult> {
  const errors: string[] = [];
  let accountsSynced = 0;
  let postsSynced = 0;
  const profiles: ProfileStats[] = [];

  // Get all tracked accounts (own + competitors)
  const accounts = await db
    .select()
    .from(scrapedAccounts)
    .where(eq(scrapedAccounts.userId, userId));

  // Also get brand instagram handles that may not be in scraped_accounts yet
  const userBrands = await db
    .select()
    .from(brands)
    .where(eq(brands.userId, userId));

  // Ensure brand handles are in scraped_accounts as non-competitor
  for (const brand of userBrands) {
    if (!brand.instagramHandle) continue;
    const exists = accounts.find(a => a.handle === brand.instagramHandle);
    if (!exists) {
      try {
        const [inserted] = await db
          .insert(scrapedAccounts)
          .values({
            userId,
            handle: brand.instagramHandle,
            isCompetitor: false,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) accounts.push(inserted);
      } catch {
        // Already exists, that's fine
      }
    }
  }

  // Scrape each account
  for (const account of accounts) {
    try {
      let profile = await scrapeInstagramProfile(account.handle);

      // Profile stats from HTML meta tags is our primary data source
      // Individual post scraping is unreliable due to Instagram's anti-bot measures

      if (!profile) {
        errors.push(`Could not scrape @${account.handle}`);
        continue;
      }

      // Update profile stats
      await db
        .update(scrapedAccounts)
        .set({
          followerCount: profile.followers || undefined,
          followingCount: profile.following || undefined,
          postCount: profile.postCount || undefined,
          lastScrapedAt: new Date(),
        })
        .where(eq(scrapedAccounts.id, account.id));

      // Collect profile stats
      profiles.push({
        handle: account.handle,
        followers: profile.followers,
        following: profile.following,
        postCount: profile.postCount,
      });

      accountsSynced++;

      // Store posts
      for (const post of profile.posts) {
        if (!post.shortcode) continue;

        try {
          await db
            .insert(scrapedPosts)
            .values({
              userId,
              accountId: account.id,
              shortcode: post.shortcode,
              caption: post.caption,
              likes: post.likes,
              comments: post.comments,
              imageUrl: post.imageUrl,
              isVideo: post.isVideo,
              hashtags: (post.caption.match(/#\w+/g) || []).join(','),
              postedAt: new Date(post.timestamp),
            })
            .onConflictDoNothing();

          postsSynced++;
        } catch {
          // Duplicate post, skip
        }
      }
    } catch (err) {
      errors.push(`Error scraping @${account.handle}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Small delay between accounts to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { accountsSynced, postsSynced, profiles, errors };
}

// ---------------------------------------------------------------------------
// POST /api/sync — trigger full data sync
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json().catch(() => ({}));
    const target = (body as Record<string, unknown>).target as string | undefined;

    const results: Record<string, unknown> = {};

    if (!target || target === 'all' || target === 'buffer') {
      results.buffer = await syncBufferPosts(userId);
    }

    if (!target || target === 'all' || target === 'instagram') {
      results.instagram = await syncInstagramAccounts(userId);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/sync — check sync status
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const userId = await getUserId();

    const accounts = await db
      .select({
        handle: scrapedAccounts.handle,
        isCompetitor: scrapedAccounts.isCompetitor,
        followerCount: scrapedAccounts.followerCount,
        followingCount: scrapedAccounts.followingCount,
        postCount: scrapedAccounts.postCount,
        lastScrapedAt: scrapedAccounts.lastScrapedAt,
      })
      .from(scrapedAccounts)
      .where(eq(scrapedAccounts.userId, userId));

    return NextResponse.json({
      accounts,
      totalAccounts: accounts.length,
      lastSyncedAt: accounts
        .map(a => a.lastScrapedAt)
        .filter(Boolean)
        .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0] ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}
