import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Controllable state for per-test mock overrides.
// ---------------------------------------------------------------------------
const { state } = vi.hoisted(() => ({
  state: {
    ad: {
      id: 'ad_row_1',
      userId: 'u1',
      brandId: 'brand_1',
      objective: 'OUTCOME_LEADS',
      draft: { headline: 'Unlock your endurance profile' },
    } as Record<string, unknown> | null,
    snap: {
      id: 'snap_1',
      metaAdsId: 'ad_row_1',
      snapshotDate: '2026-06-02',
      currency: 'GBP',
      spend: '38.90',
      impressions: 21050,
      reach: 9800,
      clicks: 74,
      inlineLinkClicks: 70,
      ctr: '0.35',
      cpc: '0.53',
      frequency: '2.1',
      results: 3,
      resultType: 'link_click',
    } as Record<string, unknown> | null,
    brand: {
      id: 'brand_1',
      name: 'PaceBrain',
    } as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));

// Mock brain/competitor helpers — optional context, should not affect advice.
vi.mock('@/lib/brain/consume', () => ({ readBrandBrain: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/brain/competitor-intel', () => ({ buildCompetitorIntel: vi.fn().mockResolvedValue(null) }));

// Mock getAdvice so tests don't call Cerebras.
vi.mock('@/lib/ads/advice', () => ({ getAdvice: vi.fn().mockResolvedValue('1. Narrow audience. 2. Test new hook. 3. Increase budget.') }));

// ---------------------------------------------------------------------------
// DB mock: three distinct select shapes identified by __t tag.
//   - metaAds: .where().limit()
//   - metaAdInsights: .where().orderBy().limit()
//   - brands: .where().limit()
// ---------------------------------------------------------------------------
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => {
        const tag = (t as { __t?: string })?.__t;
        if (tag === 'metaAds') {
          return {
            where: () => ({
              limit: () => Promise.resolve(state.ad ? [state.ad] : []),
            }),
          };
        }
        if (tag === 'metaAdInsights') {
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve(state.snap ? [state.snap] : []),
              }),
            }),
          };
        }
        if (tag === 'brands') {
          return {
            where: () => ({
              limit: () => Promise.resolve(state.brand ? [state.brand] : []),
            }),
          };
        }
        return {
          where: () => ({
            limit: () => Promise.resolve([]),
            orderBy: () => ({ limit: () => Promise.resolve([]) }),
          }),
        };
      },
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  metaAds: { __t: 'metaAds' },
  metaAdInsights: { __t: 'metaAdInsights' },
  brands: { __t: 'brands' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn() }));

import { POST } from '../route';
import { getUserId } from '@/lib/auth-helpers';
import { getAdvice } from '@/lib/ads/advice';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/ads/advice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserId).mockResolvedValue('u1');
    vi.mocked(getAdvice).mockResolvedValue('1. Narrow audience. 2. Test new hook. 3. Increase budget.');

    state.ad = {
      id: 'ad_row_1',
      userId: 'u1',
      brandId: 'brand_1',
      objective: 'OUTCOME_LEADS',
      draft: { headline: 'Unlock your endurance profile' },
    };
    state.snap = {
      id: 'snap_1',
      metaAdsId: 'ad_row_1',
      snapshotDate: '2026-06-02',
      currency: 'GBP',
      spend: '38.90',
      impressions: 21050,
      reach: 9800,
      clicks: 74,
      inlineLinkClicks: 70,
      ctr: '0.35',
      cpc: '0.53',
      frequency: '2.1',
      results: 3,
      resultType: 'link_click',
    };
    state.brand = { id: 'brand_1', name: 'PaceBrain' };
  });

  it('returns 401 when getUserId throws Unauthorized', async () => {
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const req = new Request('http://localhost/api/ads/advice', {
      method: 'POST',
      body: JSON.stringify({ adId: 'ad_row_1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when adId is missing', async () => {
    const req = new Request('http://localhost/api/ads/advice', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('missing adId');
  });

  it('returns 404 when ad not found (ownership check)', async () => {
    // Ad belongs to a different user.
    state.ad = {
      id: 'ad_row_1',
      userId: 'other_user',
      brandId: 'brand_1',
      objective: 'OUTCOME_LEADS',
      draft: {},
    };
    const req = new Request('http://localhost/api/ads/advice', {
      method: 'POST',
      body: JSON.stringify({ adId: 'ad_row_1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Ad not found');
  });

  it('returns 200 with advice when getAdvice resolves', async () => {
    const req = new Request('http://localhost/api/ads/advice', {
      method: 'POST',
      body: JSON.stringify({ adId: 'ad_row_1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.advice).toContain('Narrow audience');
  });

  it('returns 200 with friendly message when getAdvice throws', async () => {
    vi.mocked(getAdvice).mockRejectedValueOnce(new Error('Cerebras timeout'));
    const req = new Request('http://localhost/api/ads/advice', {
      method: 'POST',
      body: JSON.stringify({ adId: 'ad_row_1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.advice).toMatch(/try again/i);
  });

  it('returns 200 with not-enough-data message when no snapshot exists', async () => {
    state.snap = null;
    const req = new Request('http://localhost/api/ads/advice', {
      method: 'POST',
      body: JSON.stringify({ adId: 'ad_row_1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.advice).toMatch(/not enough data/i);
  });
});
