import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadAdImage,
  createCampaign,
  createAdSet,
  createAdCreative,
  createAd,
  buildAdsManagerUrl,
} from '../ads';

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

  it('uploadAdImage posts bytes and returns the image hash', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    // image fetch (bytes) then adimages upload
    g.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => 'image/jpeg' } })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ images: { bytes: { hash: 'abc123' } } }), text: async () => '' }) as unknown as typeof fetch;

    const hash = await uploadAdImage('TOKEN', 'act_1', 'https://img/x.jpg');
    expect(hash).toBe('abc123');
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

  it('buildAdsManagerUrl points at the created campaign in the account', () => {
    const url = buildAdsManagerUrl('act_123', 'camp_9');
    expect(url).toContain('123');
    expect(url).toContain('camp_9');
  });
});
