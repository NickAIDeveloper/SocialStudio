// Deep-profile builder for Meta IG analytics.
//
// Derives all metric reducers purely in TypeScript from the posts returned by
// the existing ig-analytics helpers. No extra API calls beyond what the
// insights route already fetches — callers must supply the IgMediaItem array.
//
// Exported surface:
//   buildDeepProfile({ userId, igUserId })  — main entry point
//   clearDeepProfileCache(userId?)          — logout / invalidation helper

import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '@/lib/encryption';
import { getIgMe, getIgMedia, getIgMediaInsights } from '@/lib/meta/instagram-client';
import {
  IgMediaItem,
  getMetric,
  median,
  normalizeFormat,
} from '@/lib/meta/ig-analytics';
import type { DeepProfile, IgFormat } from './deep-profile.types';

// ── In-memory cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  profile: DeepProfile;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function clearDeepProfileCache(userId?: string): void {
  if (userId == null) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

// ── Pure reducers ────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function computeMedians(posts: IgMediaItem[]): DeepProfile['medians'] {
  return {
    reach: median(posts.map((p) => getMetric(p, 'reach'))),
    views: median(posts.map((p) => getMetric(p, 'views'))),
    likes: median(posts.map((p) => getMetric(p, 'likes'))),
    comments: median(posts.map((p) => getMetric(p, 'comments'))),
    saves: median(posts.map((p) => getMetric(p, 'saves'))),
    shares: median(posts.map((p) => getMetric(p, 'shares'))),
  };
}

function computeFormatPerformance(
  posts: IgMediaItem[],
  overallMedianReach: number | null
): DeepProfile['formatPerformance'] {
  const buckets: Record<IgFormat, IgMediaItem[]> = { REEL: [], CAROUSEL: [], IMAGE: [] };
  for (const p of posts) buckets[normalizeFormat(p)].push(p);

  return (Object.keys(buckets) as IgFormat[]).map((fmt) => {
    const group = buckets[fmt];
    const medReach = median(group.map((p) => getMetric(p, 'reach'))) ?? 0;
    const medSaves = median(group.map((p) => getMetric(p, 'saves'))) ?? 0;
    const medShares = median(group.map((p) => getMetric(p, 'shares'))) ?? 0;
    const lift =
      overallMedianReach != null && overallMedianReach > 0
        ? medReach / overallMedianReach
        : 1;
    return {
      format: fmt,
      count: group.length,
      medianReach: medReach,
      medianSaves: medSaves,
      medianShares: medShares,
      liftVsOverall: lift,
    };
  });
}

function normalizePrefix(caption: string): string {
  const words = caption
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4);
  return words.join(' ');
}

function computeHookPatterns(posts: IgMediaItem[]): DeepProfile['hookPatterns'] {
  const clusters = new Map<
    string,
    { captions: string[]; reaches: number[] }
  >();

  for (const p of posts) {
    const caption = p.caption?.trim();
    if (!caption) continue;
    const prefix = normalizePrefix(caption);
    if (!prefix || prefix.split(' ').length < 2) continue;
    const entry = clusters.get(prefix) ?? { captions: [], reaches: [] };
    entry.captions.push(caption);
    const reach = getMetric(p, 'reach') ?? 0;
    entry.reaches.push(reach);
    clusters.set(prefix, entry);
  }

  const result: DeepProfile['hookPatterns'] = [];
  for (const [pattern, { captions, reaches }] of clusters.entries()) {
    if (reaches.length < 2) continue;
    const avgReach = reaches.reduce((a, b) => a + b, 0) / reaches.length;
    result.push({
      pattern,
      exampleCaptions: captions.slice(0, 3),
      avgReach,
      occurrences: reaches.length,
    });
  }

  return result.sort((a, b) => b.avgReach - a.avgReach).slice(0, 5);
}

function computeCaptionLengthSweetSpot(posts: IgMediaItem[]): DeepProfile['captionLengthSweetSpot'] {
  const short: number[] = [];
  const medium: number[] = [];
  const long: number[] = [];

  for (const p of posts) {
    const len = p.caption?.length ?? 0;
    const reach = getMetric(p, 'reach') ?? 0;
    if (len <= 80) short.push(reach);
    else if (len <= 250) medium.push(reach);
    else long.push(reach);
  }

  const shortMedian = median(short) ?? 0;
  const mediumMedian = median(medium) ?? 0;
  const longMedian = median(long) ?? 0;

  let winner: 'short' | 'medium' | 'long' = 'short';
  if (mediumMedian >= shortMedian && mediumMedian >= longMedian) winner = 'medium';
  else if (longMedian >= shortMedian && longMedian >= mediumMedian) winner = 'long';

  return { shortMedian, mediumMedian, longMedian, winner };
}

function computeTiming(posts: IgMediaItem[]): DeepProfile['timing'] {
  // 7x24 buckets: bucketed[day][hour] = array of reach values
  const bucketed: number[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => [] as number[])
  );

  for (const p of posts) {
    if (!p.timestamp) continue;
    const t = new Date(p.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const reach = getMetric(p, 'reach');
    if (reach == null) continue;
    bucketed[t.getDay()][t.getHours()].push(reach);
  }

  // Build 7x24 heatmap (null for empty slots)
  const heatmap: Array<Array<number | null>> = bucketed.map((days) =>
    days.map((hrs) => (hrs.length > 0 ? (median(hrs) ?? null) : null))
  );

  // Top 3 slots
  const slots: Array<{ day: string; hour: number; medianReach: number }> = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const val = heatmap[d][h];
      if (val != null) slots.push({ day: DAY_NAMES[d], hour: h, medianReach: val });
    }
  }
  slots.sort((a, b) => b.medianReach - a.medianReach);
  const bestSlots = slots.slice(0, 3);

  return { heatmap, bestSlots };
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\w]+/g) ?? [];
  return matches.map((h) => h.toLowerCase());
}

function computeTopicSignals(posts: IgMediaItem[]): DeepProfile['topicSignals'] {
  const tagStats = new Map<string, { engagement: number; count: number }>();

  for (const p of posts) {
    if (!p.caption) continue;
    const tags = extractHashtags(p.caption);
    const eng =
      (getMetric(p, 'likes') ?? 0) +
      (getMetric(p, 'comments') ?? 0);
    for (const tag of tags) {
      const s = tagStats.get(tag) ?? { engagement: 0, count: 0 };
      s.engagement += eng;
      s.count += 1;
      tagStats.set(tag, s);
    }
  }

  // Only include tags appearing >= 2 times
  const filtered = [...tagStats.entries()]
    .filter(([, s]) => s.count >= 2)
    .sort((a, b) => b[1].engagement - a[1].engagement);

  const winning = filtered.slice(0, 10).map(([tag]) => tag);
  const losing = filtered
    .slice()
    .reverse()
    .slice(0, 10)
    .map(([tag]) => tag);

  return { winning, losing };
}

// ── Token + posts fetcher ────────────────────────────────────────────────────

async function fetchPostsForUser(
  userId: string,
  igUserId: string
): Promise<{ posts: IgMediaItem[]; handle: string; followerCount: number | null }> {
  const rows = await db
    .select()
    .from(instagramAccounts)
    .where(and(eq(instagramAccounts.userId, userId), eq(instagramAccounts.igUserId, igUserId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error('IG account not connected');

  const token = decrypt(row.accessToken);

  const [me, mediaList] = await Promise.all([getIgMe(token), getIgMedia(token, 50)]);

  const mediaInsights = await Promise.all(
    mediaList.map(async (m) => {
      try {
        const res = await getIgMediaInsights(token, m.id);
        return { mediaId: m.id, data: res.data };
      } catch {
        return { mediaId: m.id, data: [] };
      }
    })
  );

  const posts: IgMediaItem[] = mediaList.map((m) => {
    const ins = mediaInsights.find((x) => x.mediaId === m.id);
    return { ...m, insights: ins?.data ?? [] };
  });

  return {
    posts,
    handle: me.username ?? me.user_id,
    followerCount: me.followers_count ?? null,
  };
}

// ── Main entry ───────────────────────────────────────────────────────────────

export async function buildDeepProfile({
  userId,
  igUserId,
}: {
  userId: string;
  igUserId: string;
}): Promise<DeepProfile> {
  const cacheKey = `${userId}:${igUserId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const { posts, handle, followerCount } = await fetchPostsForUser(userId, igUserId);

  const overallMedians = computeMedians(posts);

  const profile: DeepProfile = {
    igUserId,
    handle,
    followerCount,
    sampleSize: posts.length,
    medians: overallMedians,
    formatPerformance: computeFormatPerformance(posts, overallMedians.reach),
    hookPatterns: computeHookPatterns(posts),
    captionLengthSweetSpot: computeCaptionLengthSweetSpot(posts),
    timing: computeTiming(posts),
    topicSignals: computeTopicSignals(posts),
  };

  cache.set(cacheKey, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
  return profile;
}
