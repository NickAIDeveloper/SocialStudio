import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// All mock functions must be created inside vi.hoisted() so they are available
// when vi.mock() factories run (which are hoisted to the top of the file).
// ---------------------------------------------------------------------------
const {
  state,
  verifyBrainSignatureFn,
  decryptFn,
  dbInsertFn,
  insertValuesFn,
  onConflictDoUpdateFn,
  dbUpdateFn,
  updateSetFn,
  updateWhereFn,
  dbSelectFn,
  getAdInsightsFn,
  getAdFn,
  buildSnapshotRowFn,
} = vi.hoisted(() => {
  const onConflictDoUpdateFn = vi.fn().mockResolvedValue(undefined);
  const insertValuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateFn });
  const dbInsertFn = vi.fn().mockReturnValue({ values: insertValuesFn });

  const updateWhereFn = vi.fn().mockResolvedValue(undefined);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const dbUpdateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  // Shared state for per-test control
  const state = {
    verifyResult: false as boolean,
    adRows: [] as Array<Record<string, unknown>>,
    accountRow: null as Record<string, unknown> | null,
    selectCallCount: 0,
  };

  const dbSelectFn = vi.fn().mockImplementation(() => {
    state.selectCallCount++;
    const callIndex = state.selectCallCount;
    return {
      from: (_t: unknown) => ({
        where: (_c: unknown) => {
          if (callIndex === 1) {
            // metaAds query — no .limit(), returns a thenable
            return Promise.resolve(state.adRows);
          }
          // metaAccounts query — has .limit()
          return {
            limit: (_n: unknown) =>
              Promise.resolve(state.accountRow ? [state.accountRow] : []),
          };
        },
      }),
    };
  });

  const verifyBrainSignatureFn = vi.fn().mockImplementation(() =>
    Promise.resolve(state.verifyResult),
  );
  const decryptFn = vi.fn().mockReturnValue('TOKEN');
  const getAdInsightsFn = vi.fn().mockResolvedValue({});
  const getAdFn = vi.fn().mockResolvedValue({ kind: 'unknown' });
  const buildSnapshotRowFn = vi.fn().mockReturnValue({
    metaAdsId: 'u1',
    adId: 'ad1',
    snapshotDate: '2026-06-03',
    currency: 'USD',
    spend: '10.00',
    impressions: 1000,
    reach: 800,
    clicks: 50,
    inlineLinkClicks: 45,
    ctr: '5.000',
    cpc: '0.20',
    frequency: '1.25',
    results: 30,
    resultType: 'link_click',
    raw: {},
  });

  return {
    state,
    verifyBrainSignatureFn,
    decryptFn,
    dbInsertFn,
    insertValuesFn,
    onConflictDoUpdateFn,
    dbUpdateFn,
    updateSetFn,
    updateWhereFn,
    dbSelectFn,
    getAdInsightsFn,
    getAdFn,
    buildSnapshotRowFn,
  };
});

vi.mock('@/lib/brain/auth', () => ({
  verifyBrainSignature: verifyBrainSignatureFn,
}));

vi.mock('@/lib/encryption', () => ({
  decrypt: decryptFn,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectFn,
    insert: dbInsertFn,
    update: dbUpdateFn,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  metaAds: {
    __t: 'metaAds',
    status: 'status',
    id: 'id',
    userId: 'userId',
    adId: 'adId',
    objective: 'objective',
    updatedAt: 'updatedAt',
  },
  metaAccounts: {
    __t: 'metaAccounts',
    userId: 'userId',
    accessToken: 'accessToken',
    tokenExpiresAt: 'tokenExpiresAt',
  },
  metaAdInsights: {
    __t: 'metaAdInsights',
    metaAdsId: 'metaAdsId',
    snapshotDate: 'snapshotDate',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNotNull: vi.fn(),
  ne: vi.fn(),
}));

vi.mock('@/lib/meta/ad-insights', () => ({
  getAdInsights: getAdInsightsFn,
}));

vi.mock('@/lib/meta/ads', () => ({
  getAdLiveStatus: getAdFn,
}));

vi.mock('@/lib/ads/insights-store', () => ({
  buildSnapshotRow: buildSnapshotRowFn,
}));

import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/ads/sync-insights'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brain-signature': 'fake-sig' },
    body: '{}',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/ads/sync-insights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.verifyResult = false;
    state.adRows = [];
    state.accountRow = null;
    state.selectCallCount = 0;

    // Re-wire the chain mocks after clearAllMocks
    onConflictDoUpdateFn.mockResolvedValue(undefined);
    insertValuesFn.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateFn });
    dbInsertFn.mockReturnValue({ values: insertValuesFn });
    updateWhereFn.mockResolvedValue(undefined);
    updateSetFn.mockReturnValue({ where: updateWhereFn });
    dbUpdateFn.mockReturnValue({ set: updateSetFn });
    verifyBrainSignatureFn.mockImplementation(() => Promise.resolve(state.verifyResult));
    decryptFn.mockReturnValue('TOKEN');
    getAdInsightsFn.mockResolvedValue({});
    getAdFn.mockResolvedValue({ kind: 'unknown' });
    buildSnapshotRowFn.mockReturnValue({
      metaAdsId: 'u1',
      adId: 'ad1',
      snapshotDate: '2026-06-03',
      currency: 'USD',
      spend: '10.00',
      impressions: 1000,
      reach: 800,
      clicks: 50,
      inlineLinkClicks: 45,
      ctr: '5.000',
      cpc: '0.20',
      frequency: '1.25',
      results: 30,
      resultType: 'link_click',
      raw: {},
    });
    dbSelectFn.mockImplementation(() => {
      state.selectCallCount++;
      const callIndex = state.selectCallCount;
      return {
        from: (_t: unknown) => ({
          where: (_c: unknown) => {
            if (callIndex === 1) {
              return Promise.resolve(state.adRows);
            }
            return {
              limit: (_n: unknown) =>
                Promise.resolve(state.accountRow ? [state.accountRow] : []),
            };
          },
        }),
      };
    });
  });

  it('returns 401 when verifyBrainSignature returns false', async () => {
    state.verifyResult = false;
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('bad_signature');
  });

  it('returns 200 with { success: true } and upserts insight for a valid ad', async () => {
    state.verifyResult = true;
    state.adRows = [
      { id: 'u1', userId: 'usr1', adId: 'ad1', objective: 'OUTCOME_TRAFFIC' },
    ];
    state.accountRow = {
      accessToken: 'enc-token',
      tokenExpiresAt: new Date(Date.now() + 86_400_000), // future — not expired
    };

    getAdInsightsFn.mockResolvedValue({
      ad1: {
        spend: 10,
        impressions: 1000,
        reach: 800,
        clicks: 50,
        inlineLinkClicks: 45,
        ctr: 5.0,
        cpc: 0.2,
        frequency: 1.25,
        results: 30,
        resultType: 'link_click',
        currency: 'USD',
      },
    });

    getAdFn.mockResolvedValue({
      kind: 'status',
      effectiveStatus: 'ACTIVE',
      reviewFeedback: null,
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Insight upsert was invoked
    expect(dbInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ __t: 'metaAdInsights' }),
    );
    expect(insertValuesFn).toHaveBeenCalled();
    expect(onConflictDoUpdateFn).toHaveBeenCalled();

    // Status update was invoked
    expect(dbUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ __t: 'metaAds' }),
    );
  });
});
