import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));
const brandRow = { id: 'b1', slug: 'acme', name: 'Acme', userId: 'u1', description: 'A brand' };

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/brain/consume', () => ({
  readBrandBrain: vi.fn().mockResolvedValue({ briefMd: '# brief', briefVersion: 1, generatedAt: '2026-01-01T00:00:00Z', formula: null }),
}));
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }) },
}));
vi.mock('@/lib/db/schema', () => ({ brands: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/ads/generate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

function setFetch(...responses: Array<{ ok: boolean; json: () => Promise<unknown> }>): void {
  let fetchMock = vi.fn();
  for (const r of responses) fetchMock = fetchMock.mockResolvedValueOnce(r);
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
}

const capOk = { ok: true, json: async () => ({ caption: 'Body copy here.', hashtags: '#a #b', hookText: 'Stop scrolling now' }) };
const pickOk = { ok: true, json: async () => ({ searchTerm: 'people running', alternatives: ['people running'] }) };
const pixabayOk = { ok: true, json: async () => ({ hits: [{ webformatURL: 'https://img/1.jpg', tags: 'running, people' }, { webformatURL: 'https://img/2.jpg', tags: 'running, outdoor' }] }) };

describe('POST /api/ads/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([brandRow]);
    // internal fetches: /api/captions then /api/images/pick (mode A) then /api/pixabay
    setFetch(capOk, pickOk, pixabayOk);
  });

  it('returns 400 when brandId is missing', async () => {
    const res = await POST(makeReq({ objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when objective is invalid', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'NOPE', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when destinationUrl is not http(s)', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'ftp://x.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when the brand is not owned by the user', async () => {
    limitMock.mockResolvedValueOnce([]);
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(403);
  });

  it('returns 502 when caption generation fails', async () => {
    setFetch({ ok: false, json: async () => ({ message: 'rate limited' }) });
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(502);
  });

  it('sets imageMissing true when no image is found', async () => {
    // captions ok, then images/pick returns empty searchTerm → pixabay skipped.
    setFetch(capOk, { ok: true, json: async () => ({ searchTerm: '' }) });
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.imageMissing).toBe(true);
    expect(json.imageCandidates.length).toBe(0);
  });

  it('returns an editable draft with mapped fields and image candidates', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.draft.primaryText).toBe('Body copy here.');
    expect(json.draft.hook).toBe('Stop scrolling now');
    expect(json.draft.cta).toBe('LEARN_MORE');
    expect(json.draft.imageUrl).toBe('https://img/1.jpg');
    expect(json.imageMissing).toBe(false);
    expect(json.imageCandidates.length).toBeGreaterThanOrEqual(2);
  });

  it('sets appStoreUrl and applicationId on the draft for APP objective', async () => {
    setFetch(capOk, pickOk, pixabayOk);
    const res = await POST(makeReq({
      brandId: 'b1',
      objective: 'APP',
      destinationUrl: 'https://apps.apple.com/app/my-app/id123',
      applicationId: '987654321',
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.draft.appStoreUrl).toBe('https://apps.apple.com/app/my-app/id123');
    expect(json.draft.applicationId).toBe('987654321');
    expect(json.draft.cta).toBe('INSTALL_MOBILE_APP');
  });

  it('accepts APP objective without applicationId (picker not yet selected)', async () => {
    setFetch(capOk, pickOk, pixabayOk);
    const res = await POST(makeReq({
      brandId: 'b1',
      objective: 'APP',
      destinationUrl: 'https://apps.apple.com/app/my-app/id123',
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.draft.appStoreUrl).toBe('https://apps.apple.com/app/my-app/id123');
    expect(json.draft.applicationId).toBeUndefined();
  });
});
