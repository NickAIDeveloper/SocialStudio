import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Controllable state for per-test mock overrides.
// ---------------------------------------------------------------------------
const { state } = vi.hoisted(() => ({
  state: {
    adRows: [
      {
        id: 'row_1',
        brandId: 'b1',
        adAccountId: 'act_1',
        campaignId: 'camp_1',
        adId: 'ad_1',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        draft: { headline: 'Hello', primaryText: 'Buy now', mediaType: 'image' },
        lastError: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ] as unknown[],
    account: {
      accessToken: 'enc',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
    } as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn().mockReturnValue('TOKEN') }));

vi.mock('@/lib/meta/ads', () => ({
  getAdStatuses: vi.fn().mockResolvedValue({ ad_1: 'PAUSED' }),
  buildAdsManagerUrl: vi.fn().mockReturnValue('https://adsmanager/x'),
}));

// ---------------------------------------------------------------------------
// DB mock — two distinct call shapes:
//   1. metaAds query: select(...).from(metaAds).where().orderBy().limit(50)
//      → has orderBy in the chain
//   2. metaAccounts query: select(...).from(metaAccounts).where().limit(1)
//      → no orderBy
// We differentiate by the table's __t tag.
// ---------------------------------------------------------------------------
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => {
        const tag = (t as { __t?: string })?.__t;
        if (tag === 'metaAds') {
          // metaAds path: .where().orderBy().limit()
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve(state.adRows),
              }),
            }),
          };
        }
        // metaAccounts path: .where().limit()
        return {
          where: () => ({
            limit: () =>
              Promise.resolve(state.account ? [state.account] : []),
          }),
        };
      },
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  metaAds: { __t: 'metaAds' },
  metaAccounts: { __t: 'metaAccounts' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn() }));

import { GET } from '../route';
import { getAdStatuses } from '@/lib/meta/ads';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/ads/list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply defaults cleared by clearAllMocks.
    vi.mocked(getAdStatuses).mockResolvedValue({ ad_1: 'PAUSED' });

    state.adRows = [
      {
        id: 'row_1',
        brandId: 'b1',
        adAccountId: 'act_1',
        campaignId: 'camp_1',
        adId: 'ad_1',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        draft: { headline: 'Hello', primaryText: 'Buy now', mediaType: 'image' },
        lastError: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];
    state.account = {
      accessToken: 'enc',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
    };
  });

  it('returns 401 when getUserId throws Unauthorized', async () => {
    const { getUserId } = await import('@/lib/auth-helpers');
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 200 with ads array; row with adId ad_1 has liveStatus PAUSED and an adsManagerUrl', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.ads)).toBe(true);
    expect(json.ads).toHaveLength(1);
    const ad = json.ads[0];
    expect(ad.liveStatus).toBe('PAUSED');
    expect(ad.adsManagerUrl).toBe('https://adsmanager/x');
    expect(ad.headline).toBe('Hello');
    expect(ad.primaryText).toBe('Buy now');
    expect(ad.mediaType).toBe('image');
  });

  it('resilience: when getAdStatuses rejects, route still returns 200 with liveStatus null', async () => {
    vi.mocked(getAdStatuses).mockRejectedValueOnce(new Error('Meta down'));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.ads[0].liveStatus).toBeNull();
  });

  it('FAILED row with draft null does not crash — headline null, primaryText empty string', async () => {
    state.adRows = [
      {
        id: 'row_2',
        brandId: 'b1',
        adAccountId: 'act_1',
        campaignId: null,
        adId: null,
        objective: 'OUTCOME_TRAFFIC',
        status: 'FAILED',
        draft: null,
        lastError: 'createCampaign failed',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.ads[0].headline).toBeNull();
    expect(json.ads[0].primaryText).toBe('');
    expect(json.ads[0].adsManagerUrl).toBeNull();
    expect(json.ads[0].liveStatus).toBeNull();
    expect(json.ads[0].lastError).toBe('createCampaign failed');
  });
});
