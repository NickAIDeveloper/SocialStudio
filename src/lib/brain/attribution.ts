// Angle-attribution: match OUR published autopilot posts to the Instagram media
// they became, so real per-post performance (reach/saves) can be tied to the
// creative `angle` that produced them. This closes the feedback loop — the
// generator can then favour angles that actually win for THIS account.
//
// We never store the IG media id (posts only carry a Buffer id), so the join is
// by CAPTION. Instagram returns our caption with hashtags appended and OEmbed
// framing, so both sides are normalized to a stable key before comparing.
// Pure, no I/O — the caller supplies media (with insights) and posts.

import { cleanIgCaption } from '@/lib/ig-caption-clean';
import { getMetric, type IgMediaItem } from '@/lib/meta/ig-analytics';

/**
 * Reduces a caption to a stable match key: strips IG framing (cleanIgCaption),
 * removes hashtags, collapses whitespace, lowercases, and bounds the length so
 * appended hashtags / trailing edits don't break the join. Empty when there's
 * no usable text.
 */
export function captionMatchKey(raw: string | null | undefined): string {
  const cleaned = cleanIgCaption(String(raw ?? ''));
  return cleaned
    .replace(/#[^\s#]+/g, ' ') // strip hashtags
    .replace(/["“”‘’]/g, '') // residual framing quotes (IG's closing quote sits before hashtags, so cleanIgCaption misses it)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

export interface PostForAttribution {
  id: string;
  caption: string | null;
  publishedAt: Date | null;
}

export interface MediaMetrics {
  reach: number;
  saves: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface Attribution {
  postId: string;
  mediaId: string;
  metrics: MediaMetrics;
}

function metricsOf(media: IgMediaItem): MediaMetrics {
  return {
    reach: getMetric(media, 'reach') ?? 0,
    saves: getMetric(media, 'saves') ?? 0,
    likes: getMetric(media, 'likes') ?? 0,
    comments: getMetric(media, 'comments') ?? 0,
    shares: getMetric(media, 'shares') ?? 0,
  };
}

/**
 * For each of OUR published posts, finds the IG media whose (normalized) caption
 * matches and returns its real metrics. When several media share a caption, the
 * one whose timestamp is closest to the post's publishedAt wins. A match older
 * than `maxDayGap` from publishedAt is rejected (guards against a recycled
 * caption from months ago). One attribution per matched post; unmatched posts
 * are skipped.
 */
export function matchMediaToPosts(
  media: readonly IgMediaItem[],
  posts: readonly PostForAttribution[],
  opts: { maxDayGap?: number } = {},
): Attribution[] {
  const { maxDayGap = 30 } = opts;

  const byKey = new Map<string, IgMediaItem[]>();
  for (const m of media) {
    const key = captionMatchKey(m.caption);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(m);
    else byKey.set(key, [m]);
  }

  const out: Attribution[] = [];
  for (const p of posts) {
    const key = captionMatchKey(p.caption);
    if (!key) continue;
    const candidates = byKey.get(key);
    if (!candidates || candidates.length === 0) continue;

    let best = candidates[0];
    if (candidates.length > 1 && p.publishedAt) {
      const pt = p.publishedAt.getTime();
      const dist = (m: IgMediaItem) =>
        m.timestamp ? Math.abs(new Date(m.timestamp).getTime() - pt) : Number.POSITIVE_INFINITY;
      best = candidates.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    }

    if (p.publishedAt && best.timestamp) {
      const gapDays =
        Math.abs(new Date(best.timestamp).getTime() - p.publishedAt.getTime()) / 86_400_000;
      if (gapDays > maxDayGap) continue;
    }

    out.push({ postId: p.id, mediaId: best.id, metrics: metricsOf(best) });
  }
  return out;
}
