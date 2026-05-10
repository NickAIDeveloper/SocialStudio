import { describe, it, expect, vi } from 'vitest';
import { syncCompetitors } from '../sync-competitors';
import bdFixture from './fixtures/meta-business-discovery.json';

describe('syncCompetitors rate limiting', () => {
  it('halts at 80% X-App-Usage', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(bdFixture), {
        headers: { 'x-app-usage': JSON.stringify({ call_count: 95 }) },
      })
    );
    const upsertPosts = vi.fn(async () => {});
    const updateAccountMeta = vi.fn(async () => {});

    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [
        { id: 'a1', handle: 'h1' },
        { id: 'a2', handle: 'h2' },
        { id: 'a3', handle: 'h3' },
      ],
      fetcher: fetcher as unknown as typeof fetch,
      spacingMs: 0,
      upsertPosts,
      updateAccountMeta,
    });

    expect(result.status).toBe('rate_limited');
    // Halts before processing all handles.
    expect(fetcher).not.toHaveBeenCalledTimes(3);
  });
});
