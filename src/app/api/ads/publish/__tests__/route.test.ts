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

const getAdvertisableApps = vi.fn();
vi.mock('@/lib/meta/client', () => ({
  getAdvertisableApps: (...args: unknown[]) => getAdvertisableApps(...args),
}));

vi.mock('@/lib/meta/ads', () => ({
  uploadAdImage: vi.fn().mockResolvedValue('img_hash'),
  createCampaign: vi.fn().mockResolvedValue('camp_1'),
  createAdSet: vi.fn().mockResolvedValue('adset_1'),
  createAdCreative: vi.fn().mockResolvedValue('creative_1'),
  createAd: vi.fn().mockResolvedValue('ad_1'),
  searchAdInterests: vi.fn().mockResolvedValue(null),
  buildAdsManagerUrl: vi.fn().mockReturnValue('https://adsmanager/x'),
  uploadAdVideo: vi.fn().mockResolvedValue('vid_1'),
  waitForVideoReady: vi.fn().mockResolvedValue(undefined),
  createVideoCreative: vi.fn().mockResolvedValue('vcreative_1'),
  deleteCampaign: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../route';
import {
  createCampaign, createAdSet, createAd, createAdCreative,
  uploadAdVideo, waitForVideoReady, createVideoCreative, deleteCampaign,
} from '@/lib/meta/ads';
// uploadAdVideo + waitForVideoReady moved to /api/ads/upload-video; publish must
// NOT call them anymore. They remain imported here to assert they are not used.

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
    // Default: the draft's applicationId resolves to an app with a registered
    // App Store URL. The registered url intentionally differs from the
    // free-text appStoreUrl so happy-path tests prove we use the registered one.
    getAdvertisableApps.mockResolvedValue([
      { id: '123456789', name: 'My App', iosUrl: 'https://apps.apple.com/app/id123456789' },
    ]);
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

  // ── Rollback on partial failure ──────────────────────────────────────────

  it('rolls back the orphan campaign when ad-set creation fails', async () => {
    // Campaign is created, then createAdSet throws — the catch must delete the
    // campaign so no orphan shell is left in Ads Manager.
    vi.mocked(createAdSet).mockRejectedValueOnce(new Error('Meta write error 400: bad targeting'));

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('publish_failed');

    // Rollback fired with the bare campaign id from createCampaign.
    expect(vi.mocked(deleteCampaign)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteCampaign)).toHaveBeenCalledWith('TOKEN', 'camp_1');
    // The ad was never created.
    expect(vi.mocked(createAd)).not.toHaveBeenCalled();
  });

  it('does NOT attempt rollback when no campaign was created (early validation failure)', async () => {
    // no_geo fails before any Meta write — nothing to roll back.
    const res = await POST(makeReq({
      ...validBody,
      targeting: { ...validBody.targeting, countries: [], cities: [] },
    }));
    expect(res.status).toBe(400);
    expect(vi.mocked(createCampaign)).not.toHaveBeenCalled();
    expect(vi.mocked(deleteCampaign)).not.toHaveBeenCalled();
  });

  it('a successful publish never calls rollback', async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(vi.mocked(deleteCampaign)).not.toHaveBeenCalled();
  });

  it('rejects an App Store URL on a non-APP objective before any Meta write (1487810 guard)', async () => {
    const res = await POST(makeReq({
      ...validBody,
      draft: { ...validBody.draft, objective: 'TRAFFIC', destinationUrl: 'https://apps.apple.com/us/app/pacebrain/id6759993012' },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('app_url_wrong_objective');
    // No Meta objects were created, so nothing to roll back.
    expect(vi.mocked(createCampaign)).not.toHaveBeenCalled();
    expect(vi.mocked(deleteCampaign)).not.toHaveBeenCalled();
  });

  // ── Geo targeting (countries + cities) ───────────────────────────────────

  it('city-only targeting: defaults to Meta canonical radius 10 mile and creates the ad set', async () => {
    const res = await POST(makeReq({
      ...validBody,
      targeting: {
        ...validBody.targeting,
        countries: [],
        cities: [{ key: '1234', name: 'Melbourne' }],
      },
    }));
    expect(res.status).toBe(200);

    const adSetInput = vi.mocked(createAdSet).mock.calls[0][2];
    const geo = (adSetInput.targeting as { geo_locations: Record<string, unknown> }).geo_locations;
    expect(geo.countries).toBeUndefined();
    // Default (no radius/unit supplied) → Meta's canonical 10-mile default; key
    // sent as the exact numeric string. This is the shape that avoids subcode
    // 1487756 ("Locations Can't Be Used").
    expect(geo.cities).toEqual([{ key: '1234', radius: 10, distance_unit: 'mile' }]);
    expect(vi.mocked(createAdSet)).toHaveBeenCalled();
  });

  it('clamps a too-small km radius up to the Meta minimum (17) and keeps the unit', async () => {
    const res = await POST(makeReq({
      ...validBody,
      targeting: {
        ...validBody.targeting,
        countries: ['GB'],
        cities: [{ key: 5678, name: 'Leeds', radius: 5, distanceUnit: 'kilometer' }],
      },
    }));
    expect(res.status).toBe(200);

    const adSetInput = vi.mocked(createAdSet).mock.calls[0][2];
    const geo = (adSetInput.targeting as { geo_locations: Record<string, unknown> }).geo_locations;
    expect(geo.countries).toEqual(['GB']);
    // 5 km is below the 17 km floor → clamped to 17; numeric key coerced to string.
    expect(geo.cities).toEqual([{ key: '5678', radius: 17, distance_unit: 'kilometer' }]);
  });

  it('clamps an over-max mile radius down to 50', async () => {
    const res = await POST(makeReq({
      ...validBody,
      targeting: {
        ...validBody.targeting,
        countries: [],
        cities: [{ key: '999', name: 'Austin', radius: 200, distanceUnit: 'mile' }],
      },
    }));
    expect(res.status).toBe(200);

    const adSetInput = vi.mocked(createAdSet).mock.calls[0][2];
    const geo = (adSetInput.targeting as { geo_locations: Record<string, unknown> }).geo_locations;
    expect(geo.cities).toEqual([{ key: '999', radius: 50, distance_unit: 'mile' }]);
  });

  it('returns 400 no_geo when both countries and cities are empty', async () => {
    const res = await POST(makeReq({
      ...validBody,
      targeting: { ...validBody.targeting, countries: [], cities: [] },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_geo');
    expect(vi.mocked(createAdSet)).not.toHaveBeenCalled();
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
    // object_store_url must be the Meta-REGISTERED url (from getAdvertisableApps),
    // NOT the free-text appStoreUrl the user typed in the draft.
    expect(adSetInput.promotedObject?.object_store_url).toBe('https://apps.apple.com/app/id123456789');

    // createAdCreative link must still be the user's App Store URL (the
    // destination), not the registered promoted_object url and not destinationUrl.
    const creativeCall = vi.mocked(createAdCreative).mock.calls[0];
    const creativeInput = creativeCall[2]; // (token, acctId, input)
    expect(creativeInput.link).toBe('https://apps.apple.com/app/my-app/id123456789');
    expect(creativeInput.cta).toBe('INSTALL_MOBILE_APP');
  });

  it('returns 400 app_store_not_linked when the registered app has no iosUrl, without creating the ad set', async () => {
    getAdvertisableApps.mockResolvedValue([
      { id: '123456789', name: 'My App', iosUrl: null },
    ]);
    const res = await POST(makeReq({ ...validBody, draft: validAppDraft }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('app_store_not_linked');
    expect(vi.mocked(createAdSet)).not.toHaveBeenCalled();
  });

  it('returns 400 app_not_promotable when applicationId is not in the advertisable list, without creating the ad set', async () => {
    getAdvertisableApps.mockResolvedValue([
      { id: '999999999', name: 'Some Other App', iosUrl: 'https://apps.apple.com/app/id999999999' },
    ]);
    const res = await POST(makeReq({ ...validBody, draft: validAppDraft }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('app_not_promotable');
    expect(vi.mocked(createAdSet)).not.toHaveBeenCalled();
  });

  // ── Video path ────────────────────────────────────────────────────────────

  const validVideoDraft = {
    objective: 'TRAFFIC',
    destinationUrl: 'https://x.com',
    primaryText: 'Watch this',
    hook: 'h',
    headline: 'Big Video Ad',
    hashtags: [],
    cta: 'LEARN_MORE',
    imageUrl: '', // not used in video path
    interestSuggestions: [],
    mediaType: 'video' as const,
    videoUrl: 'https://blob/clip.mp4',
    thumbnailUrl: 'https://blob/thumb.jpg',
    videoId: 'vid_1', // already uploaded + processed by /api/ads/upload-video
  };

  it('video happy path: returns 200 PAUSED, calls createVideoCreative with the ready videoId (no upload/poll)', async () => {
    const res = await POST(makeReq({ ...validBody, draft: validVideoDraft }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.campaignId).toBe('camp_1');
    expect(json.adId).toBe('ad_1');

    // Upload + poll now happen in /api/ads/upload-video, NOT here.
    expect(vi.mocked(uploadAdVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(waitForVideoReady)).not.toHaveBeenCalled();
    expect(vi.mocked(createVideoCreative)).toHaveBeenCalledOnce();
    // Image path must NOT be called.
    expect(vi.mocked(createAdCreative)).not.toHaveBeenCalled();

    // createVideoCreative should have received the thumbnailUrl + the ready videoId.
    const videoCreativeInput = vi.mocked(createVideoCreative).mock.calls[0][2];
    expect(videoCreativeInput.thumbnailUrl).toBe('https://blob/thumb.jpg');
    expect(videoCreativeInput.videoId).toBe('vid_1');

    // Row should be persisted with PAUSED status.
    expect(insertValues).toHaveBeenCalledTimes(1);
    const inserted = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.status).toBe('PAUSED');
  });

  it('returns 400 video_incomplete when mediaType is video but videoUrl is missing', async () => {
    const res = await POST(makeReq({
      ...validBody,
      draft: { ...validVideoDraft, videoUrl: undefined },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('video_incomplete');
  });

  it('returns 400 video_incomplete when mediaType is video but videoId is missing', async () => {
    const res = await POST(makeReq({
      ...validBody,
      draft: { ...validVideoDraft, videoId: undefined },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('video_incomplete');
  });

  it('returns 400 video_incomplete when mediaType is video but thumbnailUrl is missing', async () => {
    const res = await POST(makeReq({
      ...validBody,
      draft: { ...validVideoDraft, thumbnailUrl: undefined },
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('video_incomplete');
  });

  it('image path is unchanged when mediaType is absent', async () => {
    const res = await POST(makeReq(validBody)); // validBody has no mediaType
    expect(res.status).toBe(200);
    expect(vi.mocked(uploadAdVideo)).not.toHaveBeenCalled();
    expect(vi.mocked(createVideoCreative)).not.toHaveBeenCalled();
    expect(vi.mocked(createAdCreative)).toHaveBeenCalledOnce();
  });
});
