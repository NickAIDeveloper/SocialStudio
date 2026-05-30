import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { limitMock, genMock, availMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  genMock: vi.fn(),
  availMock: vi.fn(() => true),
}));

const brandRow = {
  id: 'b1',
  slug: 'acme',
  name: 'Acme',
  userId: 'u1',
  description: 'A brand',
  websiteUrl: 'https://acme.test',
};

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/cerebras', () => ({ isCerebrasAvailable: availMock }));
vi.mock('@/lib/brain/consume', () => ({
  readBrandBrain: vi.fn().mockResolvedValue({ briefMd: '# brief', briefVersion: 1, generatedAt: '2026-01-01T00:00:00Z', formula: null }),
}));
vi.mock('@/lib/brain/competitor-intel', () => ({
  buildCompetitorIntel: vi.fn().mockResolvedValue({
    competitorCount: 2,
    sampleSize: 10,
    topHashtags: [{ tag: '#run', uses: 5, avgEngagement: 100 }],
    topHookPatterns: [{ pattern: 'question', uses: 3, avgEngagement: 90 }],
    topMediaTypes: [],
    topPostingSlots: [],
    topPosts: [{ handle: 'rival', hook: 'Are you fast enough?', engagement: 200, hashtags: [] }],
  }),
}));
vi.mock('@/lib/ads/ad-copy', () => ({ generateAdCopy: genMock }));
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }) },
}));
vi.mock('@/lib/db/schema', () => ({ brands: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/ads/copy'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ads/copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([brandRow]);
    availMock.mockReturnValue(true);
    genMock.mockResolvedValue({
      primaryText: 'Hook line.\n\nBody.\n\nCTA now.',
      hook: 'Stop scrolling now',
      headline: 'Run smarter today',
      hashtags: ['#run', '#pace', '#fitness', '#training', '#goals'],
    });
  });

  it('returns 400 for an invalid objective', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'NOPE', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when the brand is not owned by the user', async () => {
    limitMock.mockResolvedValueOnce([]);
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(403);
  });

  it('returns 503 when no AI key is configured', async () => {
    availMock.mockReturnValue(false);
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(503);
  });

  it('returns 200 with the 4 copy fields', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.primaryText).toBe('Hook line.\n\nBody.\n\nCTA now.');
    expect(json.hook).toBe('Stop scrolling now');
    expect(json.headline).toBe('Run smarter today');
    expect(json.hashtags).toEqual(['#run', '#pace', '#fitness', '#training', '#goals']);
  });

  it('returns 502 when the generator throws', async () => {
    genMock.mockRejectedValueOnce(new Error('model unparseable'));
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(502);
  });
});
