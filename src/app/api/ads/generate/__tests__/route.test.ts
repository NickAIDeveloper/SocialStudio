import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { limitMock, genMock } = vi.hoisted(() => ({ limitMock: vi.fn(), genMock: vi.fn() }));
const brandRow = { id: 'b1', slug: 'acme', name: 'Acme', userId: 'u1', description: 'A brand' };

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/brain/consume', () => ({
  readBrandBrain: vi.fn().mockResolvedValue({ briefMd: '# brief', briefVersion: 1, generatedAt: '2026-01-01T00:00:00Z', formula: null }),
}));
vi.mock('@/lib/brain/competitor-intel', () => ({
  buildCompetitorIntel: vi.fn().mockResolvedValue({
    competitorCount: 0, sampleSize: 0, topHashtags: [], topHookPatterns: [], topMediaTypes: [], topPostingSlots: [], topPosts: [],
  }),
}));
vi.mock('@/lib/ads/ad-copy', () => ({ generateAdCopy: genMock }));
// The route makes two differently-shaped queries: the brand lookup ends in
// .limit(1), while the pain-points lookup awaits .where() directly. So where()
// returns a thenable that ALSO carries .limit — supporting both without the
// test having to know which query is which.
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Object.assign(Promise.resolve([]), { limit: limitMock }),
      }),
    }),
  },
}));
vi.mock('@/lib/db/schema', () => ({ brands: {}, brandPainPoints: {} }));
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

const pickOk = { ok: true, json: async () => ({ searchTerm: 'people running', alternatives: ['people running'] }) };
const pixabayOk = { ok: true, json: async () => ({ hits: [{ webformatURL: 'https://img/1.jpg', tags: 'running, people' }, { webformatURL: 'https://img/2.jpg', tags: 'running, outdoor' }] }) };

describe('POST /api/ads/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([brandRow]);
    genMock.mockResolvedValue({
      primaryText: 'Body copy here.', hook: 'Stop scrolling now', headline: 'Run smarter today',
      hashtags: ['#a', '#b'],
    });
    // copy is generated in-process now; remaining fetches: /api/images/pick then /api/pixabay
    setFetch(pickOk, pixabayOk);
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

  it('returns 502 when copy generation fails', async () => {
    genMock.mockRejectedValueOnce(new Error('model unparseable'));
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(502);
  });

  it('sets imageMissing true when no image is found', async () => {
    // images/pick returns empty searchTerm → pixabay skipped.
    setFetch({ ok: true, json: async () => ({ searchTerm: '' }) });
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
    setFetch(pickOk, pixabayOk);
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
    setFetch(pickOk, pixabayOk);
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
