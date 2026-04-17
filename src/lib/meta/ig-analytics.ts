// Pure analytics helpers for the /meta Instagram section.
//
// Everything here is computed client-side from the `IgInsightsBundle.media`
// array returned by /api/meta/instagram/insights — no extra API calls.
// Keep these functions deterministic and side-effect-free so they're safe
// to call inside render and memoize with useMemo.

export interface IgInsightRow {
  name: string;
  period: string;
  values: Array<{ value: number | Record<string, number>; end_time?: string }>;
  total_value?: { value: number };
  title?: string;
}

export interface IgMediaItem {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights: IgInsightRow[];
}

export type MetricKey = 'reach' | 'views' | 'likes' | 'comments' | 'saves' | 'shares';

export const METRIC_KEYS: MetricKey[] = ['reach', 'views', 'likes', 'comments', 'saves', 'shares'];

// Pull a single numeric metric off a post's insights array (or fall back to the
// top-level like_count / comments_count when that's where Meta parked it).
export function getMetric(post: IgMediaItem, key: MetricKey): number | null {
  if (key === 'likes' && typeof post.like_count === 'number') return post.like_count;
  if (key === 'comments' && typeof post.comments_count === 'number') return post.comments_count;
  const row = post.insights.find((r) => r.name === key);
  const raw = row?.values?.[0]?.value;
  if (typeof raw === 'number') return raw;
  return null;
}

// Standard-but-robust median: ignores missing/NaN values and returns null when
// there's no valid data (callers render "—"). Avoids the classic mistake of
// returning 0 for empty series, which would paint everything as "above median".
export function median(values: Array<number | null | undefined>): number | null {
  const sorted = values
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface Benchmarks {
  median: Record<MetricKey, number | null>;
  sampleSize: number;
}

export function computeBenchmarks(media: IgMediaItem[]): Benchmarks {
  const out: Benchmarks = { median: {} as Benchmarks['median'], sampleSize: media.length };
  for (const key of METRIC_KEYS) {
    out.median[key] = median(media.map((m) => getMetric(m, key)));
  }
  return out;
}

export type DeltaBand = 'strong-positive' | 'positive' | 'neutral' | 'negative' | 'strong-negative';

// Maps a ratio (value / median) to a human category used for color coding.
// Thresholds chosen so routine variance lands in "neutral" and only meaningful
// differences flip into positive/negative bands.
export function deltaBand(ratio: number | null): DeltaBand {
  if (ratio == null || !Number.isFinite(ratio)) return 'neutral';
  if (ratio >= 2.0) return 'strong-positive';
  if (ratio >= 1.2) return 'positive';
  if (ratio <= 0.5) return 'strong-negative';
  if (ratio <= 0.8) return 'negative';
  return 'neutral';
}

export function ratio(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base === 0) return null;
  return value / base;
}

// Normalizes Meta's media_type + media_product_type into the three surfaces the
// IG audience actually perceives. REELS is its own thing regardless of the
// underlying media type; VIDEO outside of REELS is legacy/uncommon but we
// lump it with IMAGE since we wouldn't have a good recommendation anyway.
export type IgFormat = 'REEL' | 'CAROUSEL' | 'IMAGE';

export function normalizeFormat(post: IgMediaItem): IgFormat {
  if (post.media_product_type === 'REELS') return 'REEL';
  if (post.media_type === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  return 'IMAGE';
}

export interface FormatStats {
  format: IgFormat;
  sampleSize: number;
  medianReach: number | null;
  medianViews: number | null;
  medianEngagement: number | null;
  // reach multiplier vs the best format across all three — always ≤ 1.0. The
  // best format has multiplier 1.0 by definition.
  relativeToBest: number;
}

// engagement = likes + comments + saves + shares (Meta's canonical definition
// for "total_interactions" minus profile visits / follows which aren't always
// populated at the per-post level).
function postEngagement(post: IgMediaItem): number | null {
  const likes = getMetric(post, 'likes') ?? 0;
  const comments = getMetric(post, 'comments') ?? 0;
  const saves = getMetric(post, 'saves') ?? 0;
  const shares = getMetric(post, 'shares') ?? 0;
  const sum = likes + comments + saves + shares;
  return sum > 0 ? sum : null;
}

export function computeFormatPerformance(media: IgMediaItem[]): FormatStats[] {
  const buckets: Record<IgFormat, IgMediaItem[]> = { REEL: [], CAROUSEL: [], IMAGE: [] };
  for (const m of media) buckets[normalizeFormat(m)].push(m);

  const stats: FormatStats[] = (Object.keys(buckets) as IgFormat[]).map((fmt) => {
    const posts = buckets[fmt];
    return {
      format: fmt,
      sampleSize: posts.length,
      medianReach: median(posts.map((p) => getMetric(p, 'reach'))),
      medianViews: median(posts.map((p) => getMetric(p, 'views'))),
      medianEngagement: median(posts.map(postEngagement)),
    } as FormatStats;
  });

  // Rank by reach so the "top format" is whichever gets the most eyeballs.
  const maxReach = Math.max(
    ...stats.map((s) => s.medianReach ?? 0),
    0,
  );
  for (const s of stats) {
    s.relativeToBest = maxReach > 0 && s.medianReach ? s.medianReach / maxReach : 0;
  }
  return stats.sort((a, b) => (b.medianReach ?? 0) - (a.medianReach ?? 0));
}

export interface HeatCell {
  day: number; // 0 = Sunday
  hour: number; // 0-23 local
  sampleSize: number;
  medianEngagement: number | null;
  // Normalized 0-1 across the whole grid — used to drive opacity.
  intensity: number;
}

export interface Heatmap {
  cells: HeatCell[];
  topSlots: Array<{ day: number; hour: number; medianEngagement: number }>;
}

// Builds a 7×24 grid indexed by [day][hour] using the user's local time zone.
// The IG timestamp is ISO-UTC; Date's getDay/getHours convert to local, which
// is what the user cares about (they care when THEIR audience is active in
// their own mental model, not UTC).
export function computeHeatmap(media: IgMediaItem[]): Heatmap {
  const bucketed: Array<Array<number[]>> = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => [] as number[]),
  );

  for (const m of media) {
    if (!m.timestamp) continue;
    const t = new Date(m.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const eng = postEngagement(m);
    if (eng == null) continue;
    bucketed[t.getDay()][t.getHours()].push(eng);
  }

  const cells: HeatCell[] = [];
  let maxMed = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const bucket = bucketed[d][h];
      const med = median(bucket);
      if (med != null && med > maxMed) maxMed = med;
      cells.push({ day: d, hour: h, sampleSize: bucket.length, medianEngagement: med, intensity: 0 });
    }
  }
  for (const c of cells) {
    c.intensity = maxMed > 0 && c.medianEngagement ? c.medianEngagement / maxMed : 0;
  }

  const topSlots = cells
    .filter((c) => c.medianEngagement != null && c.sampleSize > 0)
    .sort((a, b) => (b.medianEngagement ?? 0) - (a.medianEngagement ?? 0))
    .slice(0, 3)
    .map((c) => ({ day: c.day, hour: c.hour, medianEngagement: c.medianEngagement as number }));

  return { cells, topSlots };
}

// Simple weekly reach series for sparklines on the per-post table. Bins the
// last 8 weeks; older posts fall off. Used to give each row visual context
// ("is this creator trending up or coasting?").
export function weeklyReachSeries(media: IgMediaItem[], weeks = 8): number[] {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const bins = Array.from({ length: weeks }, () => [] as number[]);
  for (const m of media) {
    if (!m.timestamp) continue;
    const t = new Date(m.timestamp).getTime();
    if (Number.isNaN(t)) continue;
    const weeksAgo = Math.floor((now - t) / weekMs);
    if (weeksAgo < 0 || weeksAgo >= weeks) continue;
    const reach = getMetric(m, 'reach');
    if (reach != null) bins[weeks - 1 - weeksAgo].push(reach);
  }
  return bins.map((b) => median(b) ?? 0);
}

// Human labels for day-of-week used by the heatmap. Keep Sunday-first to match
// Date.getDay() semantics.
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Format a 24-hour local clock value as "3p" / "11a" style — short enough to
// fit on a heatmap axis without rotating labels.
export function shortHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}
