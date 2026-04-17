// Tests for the /api/smart-posts/god-mode route.
// All collaborators (auth, deep-profile, cerebras, generateFromSeed) are mocked
// so the route logic itself is exercised in isolation.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth-helpers', () => ({
  getUserId: vi.fn().mockResolvedValue('u1'),
}));

vi.mock('@/lib/meta/deep-profile', () => ({
  buildDeepProfile: vi.fn(),
}));

vi.mock('@/lib/cerebras', () => ({
  cerebrasChatCompletion: vi.fn(),
  isCerebrasAvailable: () => true,
}));

vi.mock('@/lib/smart-posts/generate', async (importOriginal) => {
  // Keep the real sanitizeMetaOverrides; mock generateFromSeed.
  const orig = await importOriginal<typeof import('@/lib/smart-posts/generate')>();
  return {
    ...orig,
    generateFromSeed: vi.fn(),
  };
});

// generate.ts pulls in db + image processing — stub those at module level so
// the importOriginal call doesn't try to touch a real database.
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
  },
}));
vi.mock('@/lib/db/schema', () => ({
  brands: {},
  scrapedPosts: {},
  posts: {},
  instagramAccounts: {},
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock('@/lib/image-processing', () => ({
  createInstagramImageWithText: vi.fn(),
}));
vi.mock('@/lib/smart-posts', () => ({
  seedFromInsight: vi.fn(),
  mergePerfectSeed: vi.fn(),
}));

import { buildDeepProfile } from '@/lib/meta/deep-profile';
import { cerebrasChatCompletion } from '@/lib/cerebras';
import { generateFromSeed } from '@/lib/smart-posts/generate';
import { POST } from '../route';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/smart-posts/god-mode'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

function makeProfile(overrides: Partial<DeepProfile> = {}): DeepProfile {
  return {
    igUserId: 'ig1',
    handle: 'testhandle',
    followerCount: 1000,
    sampleSize: 30,
    medians: { reach: 100, views: 200, likes: 10, comments: 1, saves: 1, shares: 1 },
    formatPerformance: [
      { format: 'REEL', count: 10, medianReach: 200, medianSaves: 5, medianShares: 2, liftVsOverall: 2 },
      { format: 'CAROUSEL', count: 10, medianReach: 100, medianSaves: 3, medianShares: 1, liftVsOverall: 1 },
      { format: 'IMAGE', count: 10, medianReach: 50, medianSaves: 1, medianShares: 0, liftVsOverall: 0.5 },
    ],
    hookPatterns: [],
    captionLengthSweetSpot: { shortMedian: 50, mediumMedian: 100, longMedian: 200, winner: 'long' },
    timing: {
      heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null)),
      bestSlots: [{ day: 'Sunday', hour: 9, medianReach: 200 }],
    },
    topicSignals: { winning: ['#growth'], losing: [] },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/smart-posts/god-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 422 not_enough_data when sampleSize < 5', async () => {
    vi.mocked(buildDeepProfile).mockResolvedValueOnce(makeProfile({ sampleSize: 3 }));

    const res = await POST(makeReq({ brandId: 'b1', igUserId: 'ig1' }));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error).toBe('not_enough_data');
  });

  it('returns 403 ig_account_not_owned when buildDeepProfile throws "not connected"', async () => {
    vi.mocked(buildDeepProfile).mockRejectedValueOnce(new Error('IG account not connected'));

    const res = await POST(makeReq({ brandId: 'b1', igUserId: 'ig1' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('ig_account_not_owned');
  });

  it('returns 502 ai_parse_failed when LLM returns non-JSON', async () => {
    vi.mocked(buildDeepProfile).mockResolvedValueOnce(makeProfile());
    vi.mocked(cerebrasChatCompletion).mockResolvedValueOnce("sorry I can't help");

    const res = await POST(makeReq({ brandId: 'b1', igUserId: 'ig1' }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe('ai_parse_failed');
  });

  it('returns 502 ai_invalid_shape with field=rationale when rationale is missing', async () => {
    vi.mocked(buildDeepProfile).mockResolvedValueOnce(makeProfile());
    vi.mocked(cerebrasChatCompletion).mockResolvedValueOnce(
      JSON.stringify({ overrides: { format: 'REEL' } }),
    );

    const res = await POST(makeReq({ brandId: 'b1', igUserId: 'ig1' }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe('ai_invalid_shape');
    expect(json.field).toBe('rationale');
  });

  it('returns 502 ai_invalid_shape with field=overrides when overrides are empty/missing', async () => {
    vi.mocked(buildDeepProfile).mockResolvedValueOnce(makeProfile());
    vi.mocked(cerebrasChatCompletion).mockResolvedValueOnce(
      JSON.stringify({ rationale: 'valid prose' }),
    );

    const res = await POST(makeReq({ brandId: 'b1', igUserId: 'ig1' }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe('ai_invalid_shape');
    expect(json.field).toBe('overrides');
  });

  it('returns 200 with godModeRationale + deepProfile on the happy path', async () => {
    const profile = makeProfile();
    vi.mocked(buildDeepProfile).mockResolvedValueOnce(profile);
    vi.mocked(cerebrasChatCompletion).mockResolvedValueOnce(
      JSON.stringify({
        overrides: {
          format: 'REEL',
          day: 'Sunday',
          hour: 9,
          pattern: 'how to',
          preset: 'growth tips for creators',
        },
        rationale: 'Reels lift 2x your median reach. Sundays at 9 are your best slot.',
      }),
    );
    vi.mocked(generateFromSeed).mockResolvedValueOnce({
      ok: true,
      data: {
        imageDataUrl: 'data:image/jpeg;base64,abc',
        sourceImageUrl: 'https://example.com/img.jpg',
        caption: 'Caption here',
        hashtags: '#growth',
        hookText: 'Save this',
        seed: { contentType: 'tip' },
        suggestedPostTime: { day: 'Sunday', hour: 9 },
        scheduledAt: '2024-04-21T09:00:00.000Z',
        sourceInsightId: null,
        contributions: { 'meta-format': 'Meta format REEL' },
      },
    });

    const res = await POST(makeReq({ brandId: 'b1', igUserId: 'ig1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.godModeRationale).toContain('Reels lift 2x');
    expect(json.deepProfile).toBeDefined();
    expect(json.deepProfile.handle).toBe('testhandle');
    expect(json.caption).toBe('Caption here');
    expect(json.imageDataUrl).toContain('data:image/jpeg');

    // Confirm sanitized overrides reached generateFromSeed.
    expect(generateFromSeed).toHaveBeenCalledTimes(1);
    const call = vi.mocked(generateFromSeed).mock.calls[0][0];
    expect(call.brandId).toBe('b1');
    expect(call.userId).toBe('u1');
    expect(call.metaOverrides).toMatchObject({ format: 'REEL', day: 'Sunday', hour: 9 });
  });

  it('returns 400 brandId_required when brandId is missing from body', async () => {
    const res = await POST(makeReq({ igUserId: 'ig1' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('brandId_required');
  });
});
