import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedAccounts, scrapedPosts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

// Compare data for the /analyze?tab=compare view.
//
// Only reads existing scraped data; it computes stats on the fly rather than
// persisting derived aggregates so the code stays honest about what the
// source data actually supports.
//
// Reality check on the spec rows:
//   - "Median reach" — scraped posts expose only `likes`, not reach. We surface
//     median likes and label the row "Median engagement (likes)".
//   - "Format mix" — scraped posts only distinguish Video vs Image (no
//     REEL/CAROUSEL separation), so mix is Video/Image counts.
//   - "Caption length sweet spot" — the median caption length of the top
//     quartile of posts by likes; gives the length that historically performed.

interface Stat {
  medianLikes: number | null;
  videoCount: number;
  imageCount: number;
  topVideoLikes: number | null;
  topImageLikes: number | null;
  sweetSpot: { range: string; samples: number } | null;
  sampleSize: number;
}

interface CompareResponse {
  you: Stat | null;
  competitor: Stat | null;
  competitorHandle: string | null;
  youHandle: string | null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

// Buckets a caption length in characters into a coarse range. Buckets are
// tuned for Instagram: <80 is a one-liner, 80-160 is a short paragraph,
// 161-300 is a medium story, and >300 is long-form.
function bucket(len: number): string {
  if (len < 80) return '< 80 chars';
  if (len <= 160) return '80–160 chars';
  if (len <= 300) return '161–300 chars';
  return '> 300 chars';
}

function sweetSpot(posts: Array<{ caption: string | null; likes: number }>): Stat['sweetSpot'] {
  const withCaption = posts.filter((p) => p.caption && p.caption.length > 0);
  if (withCaption.length < 4) return null;
  const sorted = [...withCaption].sort((a, b) => b.likes - a.likes);
  const topQuartile = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 4)));
  const buckets = new Map<string, number>();
  for (const p of topQuartile) {
    const b = bucket((p.caption ?? '').length);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  let best: { range: string; samples: number } | null = null;
  for (const [range, samples] of buckets) {
    if (!best || samples > best.samples) best = { range, samples };
  }
  return best;
}

async function statsForAccount(userId: string, accountId: string): Promise<Stat | null> {
  const rows = await db
    .select()
    .from(scrapedPosts)
    .where(and(eq(scrapedPosts.userId, userId), eq(scrapedPosts.accountId, accountId)));

  if (rows.length === 0) return null;

  const likes = rows.map((r) => r.likes);
  const videos = rows.filter((r) => r.isVideo);
  const images = rows.filter((r) => !r.isVideo);
  const topVideoLikes = videos.length > 0 ? Math.max(...videos.map((r) => r.likes)) : null;
  const topImageLikes = images.length > 0 ? Math.max(...images.map((r) => r.likes)) : null;

  return {
    medianLikes: median(likes),
    videoCount: videos.length,
    imageCount: images.length,
    topVideoLikes,
    topImageLikes,
    sweetSpot: sweetSpot(rows),
    sampleSize: rows.length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const competitorId = req.nextUrl.searchParams.get('competitorId');
    const brandId = req.nextUrl.searchParams.get('brandId');

    if (!competitorId) {
      return NextResponse.json({ error: 'competitorId required' }, { status: 400 });
    }

    const [competitor] = await db
      .select()
      .from(scrapedAccounts)
      .where(and(eq(scrapedAccounts.id, competitorId), eq(scrapedAccounts.userId, userId)))
      .limit(1);

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });
    }

    // Resolve "your" account from the brand's instagram handle when brandId
    // is provided; otherwise fall back to the first non-competitor scraped
    // account for the user.
    let ownAccountId: string | null = null;
    let youHandle: string | null = null;
    if (brandId) {
      const [brand] = await db
        .select()
        .from(brands)
        .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
        .limit(1);
      if (brand?.instagramHandle) {
        const [own] = await db
          .select()
          .from(scrapedAccounts)
          .where(
            and(
              eq(scrapedAccounts.userId, userId),
              eq(scrapedAccounts.handle, brand.instagramHandle),
            ),
          )
          .limit(1);
        if (own) {
          ownAccountId = own.id;
          youHandle = own.handle;
        }
      }
    }
    if (!ownAccountId) {
      const [own] = await db
        .select()
        .from(scrapedAccounts)
        .where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, false)))
        .limit(1);
      if (own) {
        ownAccountId = own.id;
        youHandle = own.handle;
      }
    }

    const [youStats, competitorStats] = await Promise.all([
      ownAccountId ? statsForAccount(userId, ownAccountId) : Promise.resolve(null),
      statsForAccount(userId, competitor.id),
    ]);

    const payload: CompareResponse = {
      you: youStats,
      competitor: competitorStats,
      competitorHandle: competitor.handle,
      youHandle,
    };

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : 'Failed to load compare data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
