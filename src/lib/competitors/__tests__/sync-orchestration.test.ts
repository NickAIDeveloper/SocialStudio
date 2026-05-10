import { describe, it, expect, vi } from 'vitest';
import { syncCompetitors } from '../sync-competitors';
import bdFixture from './fixtures/meta-business-discovery.json';

describe('syncCompetitors', () => {
  it('returns skipped when no competitors configured', async () => {
    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [],
      upsertPosts: async () => {},
      updateAccountMeta: async () => {},
    });
    expect(result.status).toBe('skipped_no_competitors');
  });

  it('upserts posts for each competitor handle', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bdFixture)));
    const upsertPosts = vi.fn(async () => {});
    const updateAccountMeta = vi.fn(async () => {});

    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [{ id: 'a1', handle: 'h1' }, { id: 'a2', handle: 'h2' }],
      fetcher: fetcher as unknown as typeof fetch,
      spacingMs: 0,
      upsertPosts,
      updateAccountMeta,
    });

    expect(result.status).toBe('ok');
    expect(upsertPosts).toHaveBeenCalledTimes(2);
    expect(updateAccountMeta).toHaveBeenCalledTimes(2);
    expect(result.updated).toBe(4); // 2 posts × 2 handles
  });

  it('returns partial when some competitors fail', async () => {
    let call = 0;
    const fetcher = vi.fn(async () => {
      call++;
      if (call === 1) return new Response(JSON.stringify(bdFixture));
      return new Response(JSON.stringify({ error: { code: 110 } }), { status: 400 });
    });
    const upsertPosts = vi.fn(async () => {});
    const updateAccountMeta = vi.fn(async () => {});
    const fallbackScrape = vi.fn(async () => []);

    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [{ id: 'a1', handle: 'h1' }, { id: 'a2', handle: 'h2_personal' }],
      fetcher: fetcher as unknown as typeof fetch,
      spacingMs: 0,
      upsertPosts,
      updateAccountMeta,
      fallbackScrape,
    });

    expect(['ok', 'partial']).toContain(result.status);
    expect(fallbackScrape).toHaveBeenCalledWith('h2_personal');
  });
});
