import { fetchBusinessDiscovery, parseToScrapedPosts, type ParsedScrapedPost } from './business-discovery';
import { isThrottled } from '@/lib/brain/rate-limit';

export interface SyncCompetitorsInput {
  brandId: string;
  igUserId: string;
  accessToken: string;
  competitors: { id: string; handle: string }[];
  fetcher?: typeof fetch;
  spacingMs?: number;
  // Persist hooks injected by the route handler.
  upsertPosts: (accountId: string, handle: string, posts: ParsedScrapedPost[]) => Promise<void>;
  updateAccountMeta: (accountId: string, meta: { followerCount: number | null; postCount: number | null }) => Promise<void>;
  fallbackScrape?: (handle: string) => Promise<ParsedScrapedPost[]>;
}

export interface SyncCompetitorsResult {
  status: 'ok' | 'partial' | 'failed' | 'skipped_no_competitors' | 'rate_limited';
  updated: number;
  errors: { handle: string; reason: string }[];
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

export async function syncCompetitors(input: SyncCompetitorsInput): Promise<SyncCompetitorsResult> {
  if (input.competitors.length === 0) {
    return { status: 'skipped_no_competitors', updated: 0, errors: [] };
  }

  const fetcher = input.fetcher ?? fetch;
  const spacing = input.spacingMs ?? 250;
  let updated = 0;
  const errors: { handle: string; reason: string }[] = [];

  for (const comp of input.competitors) {
    await sleep(spacing);
    try {
      // Wrap fetch to capture headers for throttle check.
      let lastHeaders: Headers | null = null;
      const tracedFetch: typeof fetch = async (url, init) => {
        const res = await fetcher(url, init);
        lastHeaders = res.headers;
        return res;
      };

      const raw = await fetchBusinessDiscovery({
        igUserId: input.igUserId,
        handle: comp.handle,
        accessToken: input.accessToken,
        fetcher: tracedFetch,
      });

      if (lastHeaders && isThrottled(lastHeaders)) {
        return { status: 'rate_limited', updated, errors };
      }

      let posts: ParsedScrapedPost[] = [];
      if (raw) {
        posts = parseToScrapedPosts(raw, comp.handle);
        if (raw.business_discovery) {
          await input.updateAccountMeta(comp.id, {
            followerCount: raw.business_discovery.followers_count ?? null,
            postCount: raw.business_discovery.media_count ?? null,
          });
        }
      } else if (input.fallbackScrape) {
        posts = await input.fallbackScrape(comp.handle);
      } else {
        errors.push({ handle: comp.handle, reason: 'business_discovery_failed_no_fallback' });
        continue;
      }

      if (posts.length > 0) {
        await input.upsertPosts(comp.id, comp.handle, posts);
        updated += posts.length;
      }
    } catch (err) {
      errors.push({ handle: comp.handle, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  if (errors.length === 0) return { status: 'ok', updated, errors: [] };
  if (updated > 0) return { status: 'partial', updated, errors };
  return { status: 'failed', updated, errors };
}
