/**
 * Simple client-side cache for Buffer API responses.
 * Prevents multiple components from hammering the Buffer API on every page load.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (avoid Buffer rate limits)
const MAX_CACHE_SIZE = 50;

export async function cachedBufferFetch<T>(
  url: string,
  ttl: number = CACHE_TTL,
): Promise<T | null> {
  const now = Date.now();

  // Return cached data if fresh
  const cached = cache.get(url);
  if (cached && now - cached.timestamp < ttl) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests
  const existing = inflight.get(url);
  if (existing) {
    return existing as Promise<T | null>;
  }

  const promise = (async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      // Only cache successful responses, not errors
      if (res.ok) {
        if (cache.size >= MAX_CACHE_SIZE) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(url, { data, timestamp: Date.now() });
      }
      return data as T;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

export function invalidateBufferCache() {
  cache.clear();
}
