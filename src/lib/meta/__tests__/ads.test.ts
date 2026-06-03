import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadAdImage,
  createCampaign,
  createAdSet,
  createAdCreative,
  createAd,
  buildAdsManagerUrl,
  uploadAdVideo,
  waitForVideoReady,
  createVideoCreative,
  deleteCampaign,
  getAd,
  getAdLiveStatus,
} from '../ads';

// The SSRF-guarded image fetch is unit-tested in safe-image-fetch.test.ts.
// Here we mock it so uploadAdImage's own logic (upload + hash parsing) is
// exercised without real DNS/network.
vi.mock('../safe-image-fetch', () => ({
  fetchImageBytes: vi.fn().mockResolvedValue(Buffer.from('img-bytes')),
}));

function mockFetchOnce(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
}

describe('meta/ads write client', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('uploadAdImage uploads bytes (from the guarded fetch) and returns the image hash', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    // Only the adimages upload hits global.fetch now; the image bytes come from
    // the mocked fetchImageBytes.
    const fetchMock = mockFetchOnce({ images: { bytes: { hash: 'abc123' } } });
    g.fetch = fetchMock as unknown as typeof fetch;

    const hash = await uploadAdImage('TOKEN', 'act_1', 'https://cdn.pixabay.com/x.jpg');
    expect(hash).toBe('abc123');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('bytes=');
  });

  it('createCampaign sends PAUSED status and the mapped objective', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'camp_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createCampaign('TOKEN', 'act_1', 'OUTCOME_TRAFFIC');
    expect(id).toBe('camp_1');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('status=PAUSED');
    expect(body).toContain('OUTCOME_TRAFFIC');
    // Meta v21 requires this be explicitly set when the campaign has no CBO;
    // budget lives on the ad set, so sharing is disabled.
    expect(body).toContain('is_adset_budget_sharing_enabled=false');
  });

  it('createAdSet sends PAUSED status and the daily budget', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'adset_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createAdSet('TOKEN', 'act_1', {
      campaignId: 'camp_1',
      optimizationGoal: 'LINK_CLICKS',
      billingEvent: 'IMPRESSIONS',
      dailyBudgetMinor: 500,
      startTime: '2026-06-01T00:00:00Z',
      endTime: '2026-06-08T00:00:00Z',
      targeting: { geo_locations: { countries: ['GB'] }, age_min: 18, age_max: 65 },
    });
    expect(id).toBe('adset_1');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('status=PAUSED');
    expect(body).toContain('daily_budget=500');
    // Auto-bid strategy so Meta doesn't demand a bid cap (subcode 2490487).
    expect(body).toContain('bid_strategy=LOWEST_COST_WITHOUT_CAP');
  });

  it('createAdCreative serializes object_story_spec and sends no status', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'creative_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createAdCreative('TOKEN', 'act_1', {
      pageId: 'page_1',
      imageHash: 'h1',
      message: 'hello',
      headline: 'Head',
      link: 'https://x.com',
      cta: 'LEARN_MORE',
    });
    expect(id).toBe('creative_1');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('object_story_spec');
    const decoded = decodeURIComponent(body);
    expect(decoded).toContain('"page_id":"page_1"');
    expect(decoded).toContain('"image_hash":"h1"');
    expect(decoded).toContain('"call_to_action"');
    // Ad creatives carry no status field — only the ad/adset/campaign do.
    expect(body).not.toContain('status=');

    // And when an IG account is supplied, it is added to the spec.
    const igMock = mockFetchOnce({ id: 'creative_2' });
    g.fetch = igMock as unknown as typeof fetch;
    const igId = await createAdCreative('TOKEN', 'act_1', {
      pageId: 'page_1',
      igAccountId: 'ig_1',
      imageHash: 'h1',
      message: 'hello',
      headline: 'Head',
      link: 'https://x.com',
      cta: 'LEARN_MORE',
    });
    expect(igId).toBe('creative_2');
    const igDecoded = decodeURIComponent(String(igMock.mock.calls[0][1].body));
    expect(igDecoded).toContain('"instagram_actor_id":"ig_1"');
  });

  it('createAd sends PAUSED status and links creative onto the ad set', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'ad_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createAd('TOKEN', 'act_1', {
      adsetId: 'adset_1',
      creativeId: 'creative_1',
      name: 'My Ad',
    });
    expect(id).toBe('ad_1');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('status=PAUSED');
    expect(body).toContain('adset_id=adset_1');
    const decoded = decodeURIComponent(body);
    expect(decoded).toContain('"creative_id":"creative_1"');
  });

  it('deleteCampaign issues a DELETE to the bare campaign id (rollback path)', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '{"success":true}',
      json: async () => ({ success: true }),
    });
    g.fetch = fetchMock as unknown as typeof fetch;

    await deleteCampaign('TOKEN', 'camp_1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(String(url)).toContain('/camp_1');
    expect(String(url)).toContain('access_token=TOKEN');
  });

  it('deleteCampaign throws when Meta returns a non-ok response', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    g.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'cannot delete',
    }) as unknown as typeof fetch;

    await expect(deleteCampaign('TOKEN', 'camp_bad')).rejects.toThrow(/Meta delete error 400/);
  });

  it('buildAdsManagerUrl points at the created campaign in the account', () => {
    const url = buildAdsManagerUrl('act_123', 'camp_9');
    expect(url).toContain('123');
    expect(url).toContain('camp_9');
  });

  // ── Video functions ──────────────────────────────────────────────────────

  it('uploadAdVideo posts file_url to advideos and returns the video id', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'vid_1' }),
      text: async () => '{"id":"vid_1"}',
    });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await uploadAdVideo('TOKEN', 'act_1', 'https://blob/clip.mp4');
    expect(id).toBe('vid_1');

    const body = String(fetchMock.mock.calls[0][1].body);
    const decoded = decodeURIComponent(body);
    expect(decoded).toContain('file_url=https://blob/clip.mp4');
    // Must not send status — advideos doesn't take one.
    expect(body).not.toContain('status=');
  });

  it('waitForVideoReady resolves when video status becomes ready after processing', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    // First poll: processing; second poll: ready
    g.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: { video_status: 'processing' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: { video_status: 'ready' } }),
      }) as unknown as typeof fetch;

    await expect(
      waitForVideoReady('TOKEN', 'vid_1', { tries: 3, delayMs: 0 }),
    ).resolves.toBeUndefined();
  });

  it('waitForVideoReady throws when video status is error', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    g.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: { video_status: 'error' } }),
    }) as unknown as typeof fetch;

    await expect(
      waitForVideoReady('TOKEN', 'vid_bad', { tries: 3, delayMs: 0 }),
    ).rejects.toThrow(/processing failed/);
  });

  it('waitForVideoReady throws after exhausting retries if video never becomes ready', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    // Always returns 'processing' — never ready
    g.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: { video_status: 'processing' } }),
    }) as unknown as typeof fetch;

    await expect(
      waitForVideoReady('TOKEN', 'vid_slow', { tries: 3, delayMs: 0 }),
    ).rejects.toThrow(/timed out|within 3 polls/i);
  });

  it('createVideoCreative serializes object_story_spec with video_data and sends no status', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'vcreative_1' }),
      text: async () => '{"id":"vcreative_1"}',
    });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createVideoCreative('TOKEN', 'act_1', {
      pageId: 'page_1',
      videoId: 'vid_1',
      thumbnailUrl: 'https://blob/thumb.jpg',
      message: 'Watch this',
      headline: 'Big Headline',
      link: 'https://example.com',
      cta: 'LEARN_MORE',
    });
    expect(id).toBe('vcreative_1');

    const body = String(fetchMock.mock.calls[0][1].body);
    const decoded = decodeURIComponent(body);
    expect(decoded).toContain('object_story_spec');
    expect(decoded).toContain('"video_id"');
    expect(decoded).toContain('"image_url"');
    expect(decoded).toContain('vid_1');
    expect(decoded).toContain('https://blob/thumb.jpg');
    // Must use video_data, not link_data.
    expect(decoded).toContain('"video_data"');
    expect(decoded).not.toContain('"link_data"');
    // Ad creatives carry no status field.
    expect(body).not.toContain('status=');
  });

  it('createVideoCreative includes instagram_actor_id when igAccountId is provided', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'vcreative_2' }),
      text: async () => '{"id":"vcreative_2"}',
    });
    g.fetch = fetchMock as unknown as typeof fetch;

    await createVideoCreative('TOKEN', 'act_1', {
      pageId: 'page_1',
      igAccountId: 'ig_99',
      videoId: 'vid_2',
      thumbnailUrl: 'https://blob/thumb2.jpg',
      message: 'hello',
      headline: 'Head',
      link: 'https://x.com',
      cta: 'LEARN_MORE',
    });

    const decoded = decodeURIComponent(String(fetchMock.mock.calls[0][1].body));
    expect(decoded).toContain('"instagram_actor_id":"ig_99"');
  });

  it('createAdSet with promotedObject includes promoted_object in the form body', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'adset_app_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createAdSet('TOKEN', 'act_1', {
      campaignId: 'camp_app_1',
      optimizationGoal: 'APP_INSTALLS',
      billingEvent: 'IMPRESSIONS',
      dailyBudgetMinor: 500,
      startTime: '2026-06-01T00:00:00Z',
      endTime: '2026-06-08T00:00:00Z',
      targeting: { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 65 },
      promotedObject: {
        application_id: '123456789',
        object_store_url: 'https://apps.apple.com/app/my-app/id123456789',
      },
    });
    expect(id).toBe('adset_app_1');
    const rawBody = String(fetchMock.mock.calls[0][1].body);
    const decoded = decodeURIComponent(rawBody);
    // promoted_object must be present and contain both required fields.
    expect(decoded).toContain('"application_id"');
    expect(decoded).toContain('"object_store_url"');
    expect(decoded).toContain('123456789');
    // Safety invariant: PAUSED must always be sent.
    expect(rawBody).toContain('status=PAUSED');
  });

  it('createAdSet without promotedObject does NOT include promoted_object', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'adset_traffic_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    await createAdSet('TOKEN', 'act_1', {
      campaignId: 'camp_traffic_1',
      optimizationGoal: 'LINK_CLICKS',
      billingEvent: 'IMPRESSIONS',
      dailyBudgetMinor: 500,
      startTime: '2026-06-01T00:00:00Z',
      endTime: '2026-06-08T00:00:00Z',
      targeting: { geo_locations: { countries: ['GB'] }, age_min: 18, age_max: 65 },
    });
    const rawBody = String(fetchMock.mock.calls[0][1].body);
    expect(rawBody).not.toContain('promoted_object');
    expect(rawBody).toContain('status=PAUSED');
  });

  // ── getAd read-back ──────────────────────────────────────────────────────

  it('getAd returns effective_status and review_feedback', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123', effective_status: 'PENDING_REVIEW', review_feedback: '{}' }),
    });
    g.fetch = fetchMock as unknown as typeof fetch;
    const result = await getAd('tok', '123');
    expect(result).toEqual({ effectiveStatus: 'PENDING_REVIEW', reviewFeedback: '{}' });
  });

  it('getAd returns null on Meta failure (best-effort)', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    g.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => 'boom' }) as unknown as typeof fetch;
    const result = await getAd('tok', '123');
    expect(result).toBeNull();
  });

  it('getAdLiveStatus returns the live status on success', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    g.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ effective_status: 'ACTIVE', review_feedback: null }),
    }) as unknown as typeof fetch;
    expect(await getAdLiveStatus('tok', '1')).toEqual({
      kind: 'status', effectiveStatus: 'ACTIVE', reviewFeedback: null,
    });
  });

  it('getAdLiveStatus reports deleted on a 400 "does not exist"', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    g.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"Unsupported get request. Object with ID does not exist","code":100}}',
    }) as unknown as typeof fetch;
    expect(await getAdLiveStatus('tok', '1')).toEqual({ kind: 'deleted' });
  });

  it('getAdLiveStatus reports unknown on a transient (non-deletion) failure', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    g.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'server error',
    }) as unknown as typeof fetch;
    expect(await getAdLiveStatus('tok', '1')).toEqual({ kind: 'unknown' });
  });
});
