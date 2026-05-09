import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshotIg } from '../snapshot-ig';
import mediaFixture from './fixtures/ig-media.json';
import insightsFixture from './fixtures/ig-insights-28d.json';

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
      brandId: 'b1',
      userId: 'u1',
      igUserId: 'ig1',
      accessToken: 'tok',
      day: '2026-05-09',
      fetcher: fetchSpy,
      cacheRead,
      cacheWrite,
      spacingMs: 0,
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
      brandId: 'b1',
      userId: 'u1',
      igUserId: 'ig1',
      accessToken: 'tok',
      day: '2026-05-09',
      fetcher: fetchSpy,
      cacheRead,
      cacheWrite,
      spacingMs: 0,
    });

    expect(result.status).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
  });
});
