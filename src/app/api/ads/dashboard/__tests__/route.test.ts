import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Controllable state for per-test mock overrides.
// ---------------------------------------------------------------------------
const { state } = vi.hoisted(() => ({
  state: {
    adRows: [
      {
        id: 'row_1',
        userId: 'u1',
        adAccountId: 'act_1',
        campaignId: 'camp_1',
        adId: 'ad_1',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        draft: {
          headline: 'Hello',
          primaryText: 'Buy now',
          mediaType: 'image',
          cta: 'LEARN_MORE',
          imageUrl: null,
          thumbnailUrl: null,
          destinationUrl: 'https://example.com',
        },
        lastError: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ] as unknown[],
    account: {
      accessToken: 'enc',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
    } as Record<string, unknown> | null,
    snapshots: [
      {
        id: 'snap_1',
        metaAdsId: 'row_1',
        adId: 'ad_1',
        snapshotDate: '2026-06-02',
        currency: 'USD',
        spend: '12.50',
        impressions: 2000,
        reach: 1800,
        clicks: 40,
        inlineLinkClicks: 35,
        ctr: '2.000',
        cpc: '0.31',
        frequency: '1.11',
        results: 20,
        resultType: 'link_click',
        fetchedAt: new Date('2026-06-02T03:00:00Z'),
        createdAt: new Date('2026-06-02T03:00:00Z'),
      },
      {
        id: 'snap_2',
        metaAdsId: 'row_1',
        adId: 'ad_1',
        snapshotDate: '2026-06-01',
        currency: 'USD',
        spend: '10.00',
        impressions: 1800,
        reach: 1600,
        clicks: 30,
        inlineLinkClicks: 25,
        ctr: '1.500',
        cpc: '0.33',
        frequency: '1.05',
        results: 15,
        resultType: 'link_click',
        fetchedAt: new Date('2026-06-01T03:00:00Z'),
        createdAt: new Date('2026-06-01T03:00:00Z'),
      },
    ] as unknown[],
    refreshShouldThrow: false,
  },
}));

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn().mockReturnValue('TOKEN') }));
vi.mock('@/lib/meta/ads', () => ({
  buildAdsManagerUrl: vi.fn().mockReturnValue('https://adsmanager/x'),
  getAdLiveStatus: vi.fn().mockResolvedValue({ kind: 'unknown' }),
}));

vi.mock('@/lib/meta/ad-insights', () => ({
  getAdInsights: vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// DB mock — three distinct call shapes:
//   1. metaAds query: select().from(metaAds).where().orderBy().limit(50)
//   2. metaAccounts query: select().from(metaAccounts).where().limit(1)
//   3. metaAdInsights query: select().from(metaAdInsights).where().orderBy().limit(2)
//   4. metaAdInsights insert: insert().values().onConflictDoUpdate()
// We differentiate select calls by the table's __t tag.
// ---------------------------------------------------------------------------
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => {
        const tag = (t as { __t?: string })?.__t;
        if (tag === 'metaAds') {
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve(state.adRows),
              }),
            }),
          };
        }
        if (tag === 'metaAccounts') {
          return {
            where: () => ({
              limit: () =>
                Promise.resolve(state.account ? [state.account] : []),
            }),
          };
        }
        if (tag === 'metaAdInsights') {
          if (state.refreshShouldThrow) {
            return {
              where: () => ({
                orderBy: () => ({
                  limit: () => Promise.resolve(state.snapshots),
                }),
              }),
            };
          }
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve(state.snapshots),
              }),
            }),
          };
        }
        return {
          where: () => ({
            orderBy: () => ({ limit: () => Promise.resolve([]) }),
            limit: () => Promise.resolve([]),
          }),
        };
      },
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  metaAds: { __t: 'metaAds' },
  metaAccounts: { __t: 'metaAccounts' },
  metaAdInsights: { __t: 'metaAdInsights' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn() }));

import { GET } from '../route';
import { getAdInsights } from '@/lib/meta/ad-insights';
import { getUserId } from '@/lib/auth-helpers';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/ads/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply defaults cleared by clearAllMocks.
    vi.mocked(getUserId).mockResolvedValue('u1');

    state.refreshShouldThrow = false;
    state.adRows = [
      {
        id: 'row_1',
        userId: 'u1',
        adAccountId: 'act_1',
        campaignId: 'camp_1',
        adId: 'ad_1',
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        draft: {
          headline: 'Hello',
          primaryText: 'Buy now',
          mediaType: 'image',
          cta: 'LEARN_MORE',
          imageUrl: null,
          thumbnailUrl: null,
          destinationUrl: 'https://example.com',
        },
        lastError: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];
    state.account = {
      accessToken: 'enc',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
    };
    state.snapshots = [
      {
        id: 'snap_1',
        metaAdsId: 'row_1',
        adId: 'ad_1',
        snapshotDate: '2026-06-02',
        currency: 'USD',
        spend: '12.50',
        impressions: 2000,
        reach: 1800,
        clicks: 40,
        inlineLinkClicks: 35,
        ctr: '2.000',
        cpc: '0.31',
        frequency: '1.11',
        results: 20,
        resultType: 'link_click',
        fetchedAt: new Date('2026-06-02T03:00:00Z'),
        createdAt: new Date('2026-06-02T03:00:00Z'),
      },
      {
        id: 'snap_2',
        metaAdsId: 'row_1',
        adId: 'ad_1',
        snapshotDate: '2026-06-01',
        currency: 'USD',
        spend: '10.00',
        impressions: 1800,
        reach: 1600,
        clicks: 30,
        inlineLinkClicks: 25,
        ctr: '1.500',
        cpc: '0.33',
        frequency: '1.05',
        results: 15,
        resultType: 'link_click',
        fetchedAt: new Date('2026-06-01T03:00:00Z'),
        createdAt: new Date('2026-06-01T03:00:00Z'),
      },
    ];
  });

  it('returns 401 when getUserId throws Unauthorized', async () => {
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const req = new Request('http://localhost/api/ads/dashboard');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('happy path (stored data, no refresh): returns 200 with insight, ctrTrend and signals', async () => {
    const req = new Request('http://localhost/api/ads/dashboard');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(Array.isArray(json.ads)).toBe(true);
    expect(json.ads).toHaveLength(1);

    const ad = json.ads[0];

    // insight should be populated from the latest snapshot
    expect(ad.insight).not.toBeNull();
    expect(ad.insight.ctr).toBe(2.0);
    expect(ad.insight.impressions).toBe(2000);
    expect(ad.insight.currency).toBe('USD');

    // ctrTrend: latest ctr=2.0 vs prior ctr=1.5 → up
    expect(ad.ctrTrend).not.toBeNull();
    expect(ad.ctrTrend.direction).toBe('up');

    // signals verdict: impressions=2000 ≥ 1000 and ctr=2.0 ≥ benchmark*1.5 (0.9*1.5=1.35) → 'working'
    expect(ad.signals).toBeDefined();
    expect(ad.signals.verdict).toBe('working');

    // adsManagerUrl present
    expect(ad.adsManagerUrl).toBe('https://adsmanager/x');

    // getAdInsights must NOT be called when refresh param absent
    expect(vi.mocked(getAdInsights)).not.toHaveBeenCalled();
  });

  it('no snapshots: insight is null and verdict is gathering', async () => {
    state.snapshots = [];
    const req = new Request('http://localhost/api/ads/dashboard');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ads[0].insight).toBeNull();
    expect(json.ads[0].ctrTrend).toBeNull();
    expect(json.ads[0].signals.verdict).toBe('gathering');
  });

  it('refresh error stays 200: when getAdInsights throws, response still 200 with stored data', async () => {
    vi.mocked(getAdInsights).mockRejectedValueOnce(new Error('Meta API down'));
    const req = new Request('http://localhost/api/ads/dashboard?refresh=1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // stored data still rendered
    expect(json.ads).toHaveLength(1);
    expect(json.ads[0].insight).not.toBeNull();
  });

  it('refresh with no account still returns 200 with stored data', async () => {
    state.account = null;
    const req = new Request('http://localhost/api/ads/dashboard?refresh=1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.ads).toHaveLength(1);
  });
});
