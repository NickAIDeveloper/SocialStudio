import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshotIg } from '../snapshot-ig';
import mediaFixture from './fixtures/ig-media.json';
import insightsFixture from './fixtures/ig-insights-28d.json';

const BASE_INPUT = {
  brandId: 'b1',
  userId: 'u1',
  igUserId: 'ig1',
  accessToken: 'tok',
  day: '2026-05-09',
  spacingMs: 0,
} as const;

describe('snapshotIg cache behaviour', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let cacheRead: ReturnType<typeof vi.fn>;
  let cacheWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/media')) return new Response(JSON.stringify(mediaFixture));
      const m = url.match(/\/(m\d+)\/insights/);
      const id = m?.[1] as keyof typeof insightsFixture;
      return new Response(JSON.stringify(insightsFixture[id] ?? { data: [] }));
    });
    cacheRead = vi.fn(async () => null);
    cacheWrite = vi.fn(async () => {});
  });

  it('returns ok and writes cache on a fresh day', async () => {
    const result = await snapshotIg({
      ...BASE_INPUT,
      fetcher: fetchSpy as unknown as typeof fetch,
      cacheRead: cacheRead as unknown as Parameters<typeof snapshotIg>[0]['cacheRead'],
      cacheWrite: cacheWrite as unknown as Parameters<typeof snapshotIg>[0]['cacheWrite'],
    });

    expect(result.status).toBe('ok');
    expect(result.sampleSize).toBe(2);
    expect(cacheWrite).toHaveBeenCalledTimes(1);
  });

  it('skips Graph calls when cache is fresh', async () => {
    cacheRead.mockResolvedValueOnce({
      media: mediaFixture.data,
      insightsByMediaId: insightsFixture,
    });

    const result = await snapshotIg({
      ...BASE_INPUT,
      fetcher: fetchSpy as unknown as typeof fetch,
      cacheRead: cacheRead as unknown as Parameters<typeof snapshotIg>[0]['cacheRead'],
      cacheWrite: cacheWrite as unknown as Parameters<typeof snapshotIg>[0]['cacheWrite'],
    });

    expect(result.status).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
  });

  it('returns partial when X-App-Usage indicates ≥80% usage', async () => {
    const throttledFetcher = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), {
        headers: { 'x-app-usage': JSON.stringify({ call_count: 95 }) },
      })
    );

    const result = await snapshotIg({
      ...BASE_INPUT,
      fetcher: throttledFetcher as unknown as typeof fetch,
      cacheRead: async () => null,
      cacheWrite: async () => {},
    });

    expect(result.status).toBe('partial');
    expect(result.reason).toBe('rate_limited');
  });
});
