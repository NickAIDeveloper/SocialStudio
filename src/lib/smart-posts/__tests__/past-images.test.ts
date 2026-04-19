import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTopPerformingPastImages } from '../past-images';

describe('fetchTopPerformingPastImages', () => {
  const origin = 'http://test';
  const cookie = 'sid=abc';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns top N media sorted by reach desc with media_url present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          media: [
            { id: 'a', media_url: 'http://a.jpg', insights: [{ name: 'reach', total_value: { value: 100 } }] },
            { id: 'b', media_url: 'http://b.jpg', insights: [{ name: 'reach', total_value: { value: 500 } }] },
            { id: 'c', media_url: 'http://c.jpg', insights: [{ name: 'reach', total_value: { value: 300 } }] },
          ],
        },
      }),
    }));

    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result.map(m => m.id)).toEqual(['b', 'c']);
  });

  it('falls back to thumbnail_url when media_url is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          media: [
            { id: 'a', thumbnail_url: 'http://a-thumb.jpg', insights: [{ name: 'reach', total_value: { value: 50 } }] },
          ],
        },
      }),
    }));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result[0].media_url ?? result[0].thumbnail_url).toBe('http://a-thumb.jpg');
  });

  it('returns [] when no igUserId', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchTopPerformingPastImages({ igUserId: undefined, limit: 2, origin, cookie });
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns [] when fetch throws (silent fallback, never blocks caller)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result).toEqual([]);
  });

  it('returns [] when response is non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result).toEqual([]);
  });

  it('filters out media with no usable URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          media: [
            { id: 'a', insights: [{ name: 'reach', total_value: { value: 100 } }] },
            { id: 'b', media_url: 'http://b.jpg', insights: [{ name: 'reach', total_value: { value: 50 } }] },
          ],
        },
      }),
    }));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 5, origin, cookie });
    expect(result.map(m => m.id)).toEqual(['b']);
  });
});
