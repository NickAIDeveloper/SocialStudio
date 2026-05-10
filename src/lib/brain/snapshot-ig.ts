import type { SnapshotResponse } from './types';
import { isThrottled } from './rate-limit';

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
  throttleThreshold?: number;
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

const BACKOFF_MS = [1000, 4000, 16000] as const;

async function fetchWithRetry(
  fetcher: typeof fetch,
  url: string,
  attempts = 3
): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetcher(url);
      if (res.ok) return res;
      // Retry only on 5xx and 429 (rate limit). 4xx other than 429 are
      // permanent — don't waste retries.
      if (res.status >= 500 || res.status === 429) {
        if (i < attempts - 1) {
          const baseMs = BACKOFF_MS[i] ?? 16000;
          const jitter = Math.floor(Math.random() * 500);
          await sleep(baseMs + jitter);
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const baseMs = BACKOFF_MS[i] ?? 16000;
        const jitter = Math.floor(Math.random() * 500);
        await sleep(baseMs + jitter);
      }
    }
  }
  if (lastErr) throw lastErr;
  // Final attempt's response (non-ok) — return it so caller can inspect status.
  return fetcher(url);
}

export async function snapshotIg(input: SnapshotIgInput): Promise<SnapshotResponse> {
  const fetcher = input.fetcher ?? fetch;
  const spacing = input.spacingMs ?? 250;
  const threshold = input.throttleThreshold ?? 80;
  const cacheKey = cacheKeyFor(input.day, input.igUserId);

  const cached = await input.cacheRead(cacheKey);
  if (cached) {
    await input.persist?.(cached);
    return { status: 'ok', sampleSize: cached.media.length };
  }

  // 1. Pull last 30 media items.
  const mediaUrl = `${IG_API_BASE}/${input.igUserId}/media?fields=${MEDIA_FIELDS}&limit=30&access_token=${input.accessToken}`;
  const mediaRes = await fetchWithRetry(fetcher, mediaUrl);
  if (!mediaRes.ok) {
    return { status: 'failed', reason: `media_${mediaRes.status}` };
  }

  // Check rate-limit before burning per-post API budget.
  if (isThrottled(mediaRes.headers, threshold)) {
    return { status: 'partial', reason: 'rate_limited' };
  }

  const mediaJson = (await mediaRes.json()) as { data: { id: string }[] };
  const media = mediaJson.data ?? [];

  // 2. For each, pull insights with conservative spacing.
  const insightsByMediaId: Record<string, unknown> = {};
  let processed = 0;
  for (const item of media) {
    await sleep(spacing);
    const url = `${IG_API_BASE}/${item.id}/insights?metric=${PER_POST_METRICS.join(',')}&access_token=${input.accessToken}`;
    const res = await fetchWithRetry(fetcher, url);
    if (!res.ok) {
      // Non-fatal: skip this post. Brain still useful.
      continue;
    }
    insightsByMediaId[item.id] = await res.json();
    processed += 1;

    // Check rate-limit after each successful insights fetch.
    if (isThrottled(res.headers, threshold)) {
      const payload = { media, insightsByMediaId };
      await input.cacheWrite(cacheKey, payload);
      await input.persist?.(payload);
      return { status: 'partial', reason: 'rate_limited', sampleSize: processed };
    }
  }

  const payload = { media, insightsByMediaId };
  await input.cacheWrite(cacheKey, payload);
  await input.persist?.(payload);

  return { status: 'ok', sampleSize: media.length };
}
