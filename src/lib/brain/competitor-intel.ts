import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scrapedAccounts, scrapedPosts } from '@/lib/db/schema';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

export interface CompetitorIntel {
  competitorCount: number;
  sampleSize: number;
  topHashtags: { tag: string; uses: number; avgEngagement: number }[];
  topHookPatterns: { pattern: 'question' | 'stat' | 'imperative' | 'other'; uses: number; avgEngagement: number }[];
  topMediaTypes: { mediaType: string; uses: number; avgEngagement: number }[];
  topPostingSlots: { day: string; hour: number; uses: number; avgEngagement: number }[];
  topPosts: { handle: string; hook: string; engagement: number; hashtags: string[] }[];
}

interface Row {
  caption: string | null;
  likes: number;
  comments: number;
  hashtags: string | null;
  postedAt: Date | null;
  mediaType: string | null;
  handle: string;
}

function classifyHook(line: string): 'question' | 'stat' | 'imperative' | 'other' {
  if (/\?$/.test(line)) return 'question';
  if (/\b\d+(\.\d+)?\b/.test(line)) return 'stat';
  if (/^(stop|start|try|do|don't|never|always|how|why|the|your|you|here|imagine|stop)\b/i.test(line)) return 'imperative';
  return 'other';
}

function extractHashtagsFromRow(row: Row): string[] {
  if (row.hashtags) {
    return row.hashtags
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith('#') && s.length > 1);
  }
  return [...(row.caption ?? '').matchAll(HASHTAG_RE)].map((m) => m[0]);
}

function rankByEngagement<T>(
  bucket: Map<string, { totalEng: number; uses: number; meta?: T }>,
  topN: number,
): { key: string; uses: number; avgEngagement: number; meta?: T }[] {
  return [...bucket.entries()]
    .map(([key, v]) => ({ key, uses: v.uses, avgEngagement: v.uses > 0 ? Math.round(v.totalEng / v.uses) : 0, meta: v.meta }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.uses - a.uses)
    .slice(0, topN);
}

export async function buildCompetitorIntel(brandId: string, maxPostsPerCompetitor = 30): Promise<CompetitorIntel> {
  const competitors = await db
    .select({ id: scrapedAccounts.id, handle: scrapedAccounts.handle })
    .from(scrapedAccounts)
    .where(and(eq(scrapedAccounts.brandId, brandId), eq(scrapedAccounts.isCompetitor, true)));

  if (competitors.length === 0) {
    return {
      competitorCount: 0,
      sampleSize: 0,
      topHashtags: [],
      topHookPatterns: [],
      topMediaTypes: [],
      topPostingSlots: [],
      topPosts: [],
    };
  }

  // Run the per-competitor post fetches in parallel. Previously this was a
  // serial loop — for 5 competitors that's ~5x the DB round-trip latency.
  // Promise.all collapses it to max(one_query) instead of sum. A single
  // IN-clause query would be marginally faster but would need a window-
  // function to enforce the per-competitor limit; parallel keeps the SQL
  // unchanged.
  const competitorPostLists = await Promise.all(
    competitors.map((c) =>
      db
        .select({
          caption: scrapedPosts.caption,
          likes: scrapedPosts.likes,
          comments: scrapedPosts.comments,
          hashtags: scrapedPosts.hashtags,
          postedAt: scrapedPosts.postedAt,
          mediaType: scrapedPosts.mediaType,
        })
        .from(scrapedPosts)
        .where(eq(scrapedPosts.accountId, c.id))
        .orderBy(desc(scrapedPosts.likes))
        .limit(maxPostsPerCompetitor)
        .then((postRows) => postRows.map((r) => ({ ...r, handle: c.handle }))),
    ),
  );
  const rows: Row[] = competitorPostLists.flat();

  if (rows.length === 0) {
    return {
      competitorCount: competitors.length,
      sampleSize: 0,
      topHashtags: [],
      topHookPatterns: [],
      topMediaTypes: [],
      topPostingSlots: [],
      topPosts: [],
    };
  }

  const hashtagBucket = new Map<string, { totalEng: number; uses: number }>();
  const hookBucket = new Map<string, { totalEng: number; uses: number }>();
  const mediaBucket = new Map<string, { totalEng: number; uses: number }>();
  const slotBucket = new Map<string, { totalEng: number; uses: number }>();

  for (const row of rows) {
    const eng = (row.likes ?? 0) + (row.comments ?? 0);

    for (const tag of extractHashtagsFromRow(row)) {
      const key = tag.toLowerCase();
      const cur = hashtagBucket.get(key) ?? { totalEng: 0, uses: 0 };
      hashtagBucket.set(key, { totalEng: cur.totalEng + eng, uses: cur.uses + 1 });
    }

    const firstLine = (row.caption ?? '').split('\n')[0]?.trim() ?? '';
    if (firstLine.length > 0) {
      const hookKey = classifyHook(firstLine);
      const cur = hookBucket.get(hookKey) ?? { totalEng: 0, uses: 0 };
      hookBucket.set(hookKey, { totalEng: cur.totalEng + eng, uses: cur.uses + 1 });
    }

    if (row.mediaType) {
      const cur = mediaBucket.get(row.mediaType) ?? { totalEng: 0, uses: 0 };
      mediaBucket.set(row.mediaType, { totalEng: cur.totalEng + eng, uses: cur.uses + 1 });
    }

    if (row.postedAt) {
      const day = DAY_NAMES[row.postedAt.getUTCDay()];
      const hour = row.postedAt.getUTCHours();
      const key = `${day}|${hour}`;
      const cur = slotBucket.get(key) ?? { totalEng: 0, uses: 0 };
      slotBucket.set(key, { totalEng: cur.totalEng + eng, uses: cur.uses + 1 });
    }
  }

  const topHashtags = rankByEngagement(hashtagBucket, 8).map(({ key, uses, avgEngagement }) => ({
    tag: key,
    uses,
    avgEngagement,
  }));

  const topHookPatterns = rankByEngagement(hookBucket, 4).map(({ key, uses, avgEngagement }) => ({
    pattern: key as 'question' | 'stat' | 'imperative' | 'other',
    uses,
    avgEngagement,
  }));

  const topMediaTypes = rankByEngagement(mediaBucket, 3).map(({ key, uses, avgEngagement }) => ({
    mediaType: key,
    uses,
    avgEngagement,
  }));

  const topPostingSlots = rankByEngagement(slotBucket, 5).map(({ key, uses, avgEngagement }) => {
    const [day, hourStr] = key.split('|');
    return { day, hour: Number(hourStr), uses, avgEngagement };
  });

  const topPosts = rows
    .map((r) => ({
      handle: r.handle,
      hook: ((r.caption ?? '').split('\n')[0] ?? '').trim().slice(0, 160),
      engagement: (r.likes ?? 0) + (r.comments ?? 0),
      hashtags: extractHashtagsFromRow(r).slice(0, 5),
    }))
    .filter((p) => p.hook.length > 0)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);

  return {
    competitorCount: competitors.length,
    sampleSize: rows.length,
    topHashtags,
    topHookPatterns,
    topMediaTypes,
    topPostingSlots,
    topPosts,
  };
}
