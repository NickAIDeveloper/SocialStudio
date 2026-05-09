import type { SnapshotResponse } from './types';

export interface SnapshotIgInput {
  brandId: string;
  userId: string;
  igUserId: string;
  accessToken: string;
  day: string; // YYYY-MM-DD
  fetcher?: typeof fetch;
  cacheRead: (key: string) => Promise<{ media: unknown[]; insightsByMediaId: Record<string, unknown> } | null>;
  cacheWrite: (key: string, value: unknown) => Promise<void>;
  persist?: (payload: { media: unknown[]; insightsByMediaId: Record<string, unknown> }) => Promise<void>;
  spacingMs?: number;
}

const IG_API_BASE = 'https://graph.instagram.com';
const MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url';
const PER_POST_METRICS = ['reach', 'views', 'likes', 'comments', 'saves', 'shares'];

function cacheKeyFor(day: string, igUserId: string): string {
  return `brain:ig:${igUserId}:${day}`;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

export async function snapshotIg(input: SnapshotIgInput): Promise<SnapshotResponse> {
  const fetcher = input.fetcher ?? fetch;
  const spacing = input.spacingMs ?? 250;
  const cacheKey = cacheKeyFor(input.day, input.igUserId);

  const cached = await input.cacheRead(cacheKey);
  if (cached) {
    await input.persist?.(cached);
    return { status: 'ok', sampleSize: cached.media.length };
  }

  // 1. Pull last 30 media items.
  const mediaUrl = `${IG_API_BASE}/${input.igUserId}/media?fields=${MEDIA_FIELDS}&limit=30&access_token=${input.accessToken}`;
  const mediaRes = await fetcher(mediaUrl);
  if (!mediaRes.ok) {
    return { status: 'failed', reason: `media_${mediaRes.status}` };
  }
  const mediaJson = (await mediaRes.json()) as { data: { id: string }[] };
  const media = mediaJson.data ?? [];

  // 2. For each, pull insights with conservative spacing.
  const insightsByMediaId: Record<string, unknown> = {};
  for (const item of media) {
    await sleep(spacing);
    const url = `${IG_API_BASE}/${item.id}/insights?metric=${PER_POST_METRICS.join(',')}&access_token=${input.accessToken}`;
    const res = await fetcher(url);
    if (!res.ok) {
      // Non-fatal: skip this post. Brain still useful.
      continue;
    }
    insightsByMediaId[item.id] = await res.json();
  }

  const payload = { media, insightsByMediaId };
  await input.cacheWrite(cacheKey, payload);
  await input.persist?.(payload);

  return { status: 'ok', sampleSize: media.length };
}
