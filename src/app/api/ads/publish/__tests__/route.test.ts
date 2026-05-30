import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Controllable state for per-test mock overrides.
// ---------------------------------------------------------------------------
const { state } = vi.hoisted(() => ({
  state: {
    // null → select returns [] for brands; set to brandRow for default
    brand: { id: 'b1', slug: 'acme', userId: 'u1' } as Record<string, unknown> | null,
    // null → select returns [] for metaAccounts
    account: {
      userId: 'u1',
      accessToken: 'enc',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      assets: { adAccounts: [{ id: 'act_1', account_id: '1', currency: 'GBP' }] },
    } as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn().mockReturnValue('TOKEN') }));

const insertValues = vi.fn().mockResolvedValue(undefined);

// Returns the right stub row depending on which table is queried.
function selectRow(t: unknown): Record<string, unknown> | null {
  const name = (t as { __t?: string })?.__t;
  if (name === 'brands') return state.brand;
  if (name === 'metaAccounts') return state.account;
  return null;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: () => {
            const row = selectRow(t);
            return Promise.resolve(row ? [row] : []);
          },
        }),
      }),
    }),
    insert: () => ({ values: insertValues }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  brands: { __t: 'brands' },
  metaAccounts: { __t: 'metaAccounts' },
  metaAds: { __t: 'metaAds' },
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

vi.mock('@/lib/meta/ads', () => ({
  uploadAdImage: vi.fn().mockResolvedValue('img_hash'),
  createCampaign: vi.fn().mockResolvedValue('camp_1'),
  createAdSet: vi.fn().mockResolvedValue('adset_1'),
  createAdCreative: vi.fn().mockResolvedValue('creative_1'),
  createAd: vi.fn().mockResolvedValue('ad_1'),
  searchAdInterests: vi.fn().mockResolvedValue(null),
  buildAdsManagerUrl: vi.fn().mockReturnValue('https://adsmanager/x'),
}));

import { POST } from '../route';
import { createCampaign, createAdSet, createAd, createAdCreative } from '@/lib/meta/ads';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/ads/publish'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  brandId: 'b1',
  adAccountId: 'act_1',
  pageId: 'page_1',
  draft: {
    objective: 'TRAFFIC',
    destinationUrl: 'https://x.com',
    primaryText: 'copy',
    hook: 'h',
    headline: 'Head',
    hashtags: ['#a'],
    cta: 'LEARN_MORE',
    imageUrl: 'https://img/x.jpg',
    interestSuggestions: [],
  },
  targeting: {
    countries: ['GB'],
    ageMin: 18,
    ageMax: 65,
    gender: 'all',
    interests: [],
    dailyBudgetMinor: 500,
    startDate: '2026-06-01T00:00:00Z',
    endDate: '2026-06-08T00:00:00Z',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/ads/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.mockResolvedValue(undefined);
    // Reset to defaults.
    state.brand = { id: 'b1', slug: 'acme', userId: 'u1' };
    state.account = {
      userId: 'u1',
      accessToken: 'enc',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      assets: { adAccounts: [{ id: 'act_1', account_id: '1', currency: 'GBP' }] },
    };
  });

  // ── Base test coverage ────────────────────────────────────────────────────

  it('rejects an ad account not in the user assets', async () => {
    const res = await POST(makeReq({ ...validBody, adAccountId: 'act_999' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('ad_account_not_owned');
  });

  it('rejects a sub-minimum daily budget', async () => {
    const res = await POST(makeReq({
      ...validBody,
      targeting: { ...validBody.targeting, dailyBudgetMinor: 50 },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('budget_below_minimum');
  });

  it('creates the full tree PAUSED and returns ids + ads manager url', async () => {
    const res = await POST(makeReq(validBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.campaignId).toBe('camp_1');
    expect(json.adId).toBe('ad_1');
    expect(json.adsManagerUrl).toBe('https://adsmanager/x');
    expect(vi.mocked(createCampaign)).toHaveBeenCalled();
    expect(vi.mocked(createAdSet)).toHaveBeenCalled();
    expect(vi.mocked(createAd)).toHaveBeenCalled();
  });

  // ── Additional guard-branch coverage ─────────────────────────────────────

  it('returns 400 missing_fields when pageId is absent', async () => {
    const res = await POST(makeReq({ ...validBody, pageId: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('missing_fields');
  });

  it('returns 403 brand_not_found when brand not owned', async () => {
    state.brand = null;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('brand_not_found');
  });

  it('returns 400 meta_not_connected when no Meta account', async () => {
    state.account = null;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('meta_not_connected');
  });

  it('returns 401 token_expired when token has expired', async () => {
    state.account = {
      userId: 'u1',
      accessToken: 'enc',
      tokenExpiresAt: new Date(Date.now() - 1000), // expired
      assets: { adAccounts: [{ id: 'act_1', account_id: '1', currency: 'GBP' }] },
    };
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('token_expired');
  });

  it('returns 400 invalid_dates when end <= start', async () => {
    const res = await POST(makeReq({
      ...validBody,
      targeting: {
        ...validBody.targeting,
        startDate: '2026-06-08T00:00:00Z',
        endDate: '2026-06-01T00:00:00Z',
      },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_dates');
  });

  it('inserts a metaAds row on success with status PAUSED and correct adId', async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledTimes(1);
    const inserted = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.status).toBe('PAUSED');
    expect(inserted.adId).toBe('ad_1');
  });

  // ── APP objective ─────────────────────────────────────────────────────────

  const validAppDraft = {
    objective: 'APP',
    destinationUrl: 'https://example.com', // ignored for APP; appStoreUrl is used
    primaryText: 'Get the app',
    hook: 'h',
    headline: 'Download Now',
    hashtags: [],
    cta: 'INSTALL_MOBILE_APP',
    imageUrl: 'https://img/x.jpg',
    interestSuggestions: [],
    appStoreUrl: 'https://apps.apple.com/app/my-app/id123456789',
    applicationId: '123456789',
  };

  it('returns 400 app_setup_required when APP objective has no appStoreUrl', async () => {
    const res = await POST(makeReq({
      ...validBody,
      draft: { ...validAppDraft, appStoreUrl: undefined },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('app_setup_required');
  });

  it('returns 400 app_setup_required when APP objective has non-App-Store URL', async () => {
    const res = await POST(makeReq({
      ...validBody,
      draft: { ...validAppDraft, appStoreUrl: 'https://play.google.com/store/apps/details?id=com.example' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('app_setup_required');
  });

  it('returns 400 app_setup_required when APP objective has no applicationId', async () => {
    const res = await POST(makeReq({
      ...validBody,
      draft: { ...validAppDraft, applicationId: '' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('app_setup_required');
  });

  it('APP happy path: returns 200, createAdSet called with promotedObject, creative link is App Store URL', async () => {
    const res = await POST(makeReq({ ...validBody, draft: validAppDraft }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.campaignId).toBe('camp_1');
    expect(json.adId).toBe('ad_1');

    // createAdSet must have received promotedObject with both required fields.
    const adSetCall = vi.mocked(createAdSet).mock.calls[0];
    const adSetInput = adSetCall[2]; // (token, acctId, input)
    expect(adSetInput.promotedObject).toBeDefined();
    expect(adSetInput.promotedObject?.application_id).toBe('123456789');
    expect(adSetInput.promotedObject?.object_store_url).toBe('https://apps.apple.com/app/my-app/id123456789');

    // createAdCreative link must be the App Store URL, not destinationUrl.
    const creativeCall = vi.mocked(createAdCreative).mock.calls[0];
    const creativeInput = creativeCall[2]; // (token, acctId, input)
    expect(creativeInput.link).toBe('https://apps.apple.com/app/my-app/id123456789');
    expect(creativeInput.cta).toBe('INSTALL_MOBILE_APP');
  });
});
