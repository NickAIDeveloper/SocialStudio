import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── hoisted helpers ──────────────────────────────────────────────────────────
const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

// ── mocks ────────────────────────────────────────────────────────────────────
vi.mock('@/lib/auth-helpers', () => ({
  getUserId: vi.fn().mockResolvedValue('u1'),
}));

vi.mock('@/lib/cerebras', () => ({
  cerebrasChatCompletion: vi.fn().mockResolvedValue(
    JSON.stringify({ options: ['Your routine is broken', 'Stop scrolling now', 'This changes everything'] }),
  ),
  isCerebrasAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/brain/consume', () => ({
  readBrandBrain: vi.fn().mockResolvedValue({ briefMd: '# b' }),
}));

vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }) },
}));

vi.mock('@/lib/db/schema', () => ({ brands: {} }));

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

// ── imports (after mocks) ────────────────────────────────────────────────────
import { POST } from '../route';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

// ── helpers ──────────────────────────────────────────────────────────────────
const brandRow = { id: 'b1', slug: 'acme', name: 'Acme', userId: 'u1', description: 'd' };

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/ads/suggest'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── tests ────────────────────────────────────────────────────────────────────
describe('POST /api/ads/suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([brandRow]);
    vi.mocked(isCerebrasAvailable).mockReturnValue(true);
    vi.mocked(cerebrasChatCompletion).mockResolvedValue(
      JSON.stringify({ options: ['Your routine is broken', 'Stop scrolling now', 'This changes everything'] }),
    );
  });

  it('returns 400 when field is invalid', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', field: 'badField' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid_field');
  });

  it('returns 400 when brandId is missing', async () => {
    const res = await POST(makeReq({ objective: 'TRAFFIC', field: 'hook' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('brandId_required');
  });

  it('returns 403 when brand is not owned by the user', async () => {
    limitMock.mockResolvedValue([]);
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', field: 'hook' }));
    expect(res.status).toBe(403);
  });

  it('falls back to line-based parsing when AI returns non-JSON', async () => {
    vi.mocked(cerebrasChatCompletion).mockResolvedValue(
      '1. Your routine is broken\n2. Stop scrolling now\n3. This changes everything',
    );
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', field: 'hook' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.options.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 200 with options array of length 3 for hook field (happy path)', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', field: 'hook' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.options)).toBe(true);
    expect(json.options.length).toBe(3);
  });

  it('caps each headline option to ≤40 chars', async () => {
    const longHeadline = 'This is a very long headline that exceeds forty characters easily';
    vi.mocked(cerebrasChatCompletion).mockResolvedValue(
      JSON.stringify({ options: [longHeadline, longHeadline, longHeadline] }),
    );
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', field: 'headline' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    for (const option of json.options) {
      expect(option.length).toBeLessThanOrEqual(40);
    }
  });

  it('returns 503 when isCerebrasAvailable() is false', async () => {
    vi.mocked(isCerebrasAvailable).mockReturnValue(false);
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', field: 'hook' }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe('no_ai_key');
  });
});
