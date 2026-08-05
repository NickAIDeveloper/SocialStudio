import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    postRows: [] as unknown[],
    adRows: [] as unknown[],
    snapshots: [] as unknown[],
    userId: 'u1' as string | null,
    shouldThrow: false,
  },
}));

vi.mock('@/lib/auth-helpers', () => ({
  getUserId: vi.fn(() =>
    state.userId ? Promise.resolve(state.userId) : Promise.reject(new Error('Unauthorized')),
  ),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => {
        const tag = (t as { __t?: string })?.__t;
        if (state.shouldThrow) {
          return {
            innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.reject(new Error('db down')) }) }) }),
            where: () => ({ orderBy: () => ({ limit: () => Promise.reject(new Error('db down')) }) }),
          };
        }
        if (tag === 'posts') {
          return {
            innerJoin: () => ({
              where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(state.postRows) }) }),
            }),
          };
        }
        if (tag === 'metaAds') {
          return {
            where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(state.adRows) }) }),
          };
        }
        if (tag === 'metaAdInsights') {
          return {
            where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(state.snapshots) }) }),
          };
        }
        return { where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }) };
      },
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  posts: { __t: 'posts' },
  postAnalytics: { __t: 'postAnalytics' },
  metaAds: { __t: 'metaAds' },
  metaAdInsights: { __t: 'metaAdInsights' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn(), and: vi.fn() }));

import { GET } from '../route';

function req(qs: string): Request {
  return new Request(`http://localhost/api/creative/leaderboard${qs}`);
}

beforeEach(() => {
  state.postRows = [];
  state.adRows = [];
  state.snapshots = [];
  state.userId = 'u1';
  state.shouldThrow = false;
});

describe('GET /api/creative/leaderboard', () => {
  it('401s when signed out', async () => {
    state.userId = null;
    const res = await GET(req('?surface=organic'));
    expect(res.status).toBe(401);
  });

  it('400s on an unknown surface', async () => {
    const res = await GET(req('?surface=carrier-pigeon'));
    expect(res.status).toBe(400);
    expect((await res.json()).supported).toEqual(['ads', 'organic']);
  });

  it('defaults to the organic surface', async () => {
    const res = await GET(req(''));
    expect((await res.json()).surface).toBe('organic');
  });

  it('ranks posts by reach and returns a verdict', async () => {
    state.postRows = [
      {
        postId: 'p1', caption: 'Small one', hookText: 'Is this working?', angle: 'question',
        processedImageUrl: null, sourceImageUrl: 'https://img/1.jpg',
        publishedAt: new Date('2026-07-01T00:00:00Z'), reach: 100, likes: 5,
      },
      {
        postId: 'p2', caption: 'Big one', hookText: 'What if you are wrong?', angle: 'question',
        processedImageUrl: 'https://img/2p.jpg', sourceImageUrl: 'https://img/2.jpg',
        publishedAt: new Date('2026-07-02T00:00:00Z'), reach: 900, likes: 40,
      },
    ];
    const json = await (await GET(req('?surface=organic'))).json();
    expect(json.rows.map((r: { postId: string }) => r.postId)).toEqual(['p2', 'p1']);
    expect(json.rows[0].rank).toBe(1);
    expect(json.rows[0].imageUrl).toBe('https://img/2p.jpg');
    expect(json.totalAnalysed).toBe(2);
    // Both posts share one angle, so there is no comparison group and the
    // verdict falls back to the spread instead of crowning that angle.
    expect(json.verdict).toBe('Your best post reached 1.8x more people than your typical post.');
  });

  it('returns an empty organic payload with no verdict when nothing is analysed', async () => {
    const json = await (await GET(req('?surface=organic'))).json();
    expect(json.rows).toEqual([]);
    expect(json.verdict).toBeNull();
  });

  it('honours the limit while still ranking the whole set', async () => {
    state.postRows = Array.from({ length: 5 }, (_, i) => ({
      postId: `p${i}`, caption: `Post ${i}`, hookText: null, angle: null,
      processedImageUrl: null, sourceImageUrl: null,
      publishedAt: new Date('2026-07-01T00:00:00Z'), reach: i * 100, likes: 0,
    }));
    const json = await (await GET(req('?surface=organic&limit=2'))).json();
    expect(json.rows).toHaveLength(2);
    expect(json.totalAnalysed).toBe(5);
  });

  it('reports ads as empty when none has ever been delivered', async () => {
    state.adRows = [{ id: 'a1', objective: 'OUTCOME_TRAFFIC', draft: {} }];
    state.snapshots = [];
    const json = await (await GET(req('?surface=ads'))).json();
    expect(json.rows).toEqual([]);
    expect(json.verdict).toBeNull();
  });

  it('ranks delivered ads by cost per result', async () => {
    state.adRows = [{ id: 'a1', objective: 'OUTCOME_TRAFFIC', draft: { headline: 'Summer promo' } }];
    state.snapshots = [
      { metaAdsId: 'a1', spend: '10.00', impressions: 1000, reach: 900, clicks: 25, results: 5, resultType: 'link_click' },
    ];
    const json = await (await GET(req('?surface=ads'))).json();
    expect(json.rows[0].label).toBe('Summer promo');
    expect(json.rows[0].costPerResult).toBeCloseTo(2);
    expect(json.verdict).toContain('$2.00 per link click');
  });

  it('500s rather than leaking a database error', async () => {
    state.shouldThrow = true;
    const res = await GET(req('?surface=organic'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('leaderboard_failed');
  });
});
