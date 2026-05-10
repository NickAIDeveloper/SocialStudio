import { describe, it, expect, vi } from 'vitest';
import { fetchBusinessDiscovery, parseToScrapedPosts } from '../business-discovery';
import fixture from './fixtures/meta-business-discovery.json';

describe('fetchBusinessDiscovery', () => {
  it('hits the right URL with handle and token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture)));
    await fetchBusinessDiscovery({
      igUserId: 'ig1',
      handle: 'competitor1',
      accessToken: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url] = fetcher.mock.calls[0] as unknown as [string, ...unknown[]];
    expect(url).toContain('/ig1');
    expect(url).toContain('business_discovery.username(competitor1)');
    expect(url).toContain('access_token=tok');
  });

  it('returns null when Meta responds with an error', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 110, message: 'Unsupported' } }), { status: 400 }));
    const result = await fetchBusinessDiscovery({
      igUserId: 'ig1',
      handle: 'private_user',
      accessToken: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });
});

describe('parseToScrapedPosts', () => {
  it('extracts posts with hashtags, media type, video flag', () => {
    const posts = parseToScrapedPosts(fixture, 'competitor1');
    expect(posts).toHaveLength(2);
    expect(posts[0].shortcode).toBe('17890000000000001');
    expect(posts[0].likes).toBe(1500);
    expect(posts[0].comments).toBe(80);
    expect(posts[0].mediaType).toBe('REEL');
    expect(posts[0].isVideo).toBe(true);
    expect(posts[0].hashtags).toBe('#hashtag1 #hashtag2');
    expect(posts[0].permalink).toContain('instagram.com/p/ABC');
    expect(posts[1].mediaType).toBe('CAROUSEL');
    expect(posts[1].isVideo).toBe(false);
  });

  it('returns empty array when business_discovery is missing', () => {
    expect(parseToScrapedPosts({ id: 'x' }, 'foo')).toEqual([]);
  });
});
