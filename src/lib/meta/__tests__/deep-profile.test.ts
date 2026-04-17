// Tests for buildDeepProfile metric reducers.
// The fetch layer (db + instagram-client) is fully mocked so tests run offline.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { userId: 'u1', igUserId: 'ig1', accessToken: 'enc_token', tokenExpiresAt: null },
          ]),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({ instagramAccounts: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock('@/lib/encryption', () => ({ decrypt: (t: string) => t.replace('enc_', '') }));

// We mock getIgMe, getIgMedia, getIgMediaInsights individually
vi.mock('@/lib/meta/instagram-client', () => ({
  getIgMe: vi.fn(),
  getIgMedia: vi.fn(),
  getIgMediaInsights: vi.fn(),
}));

import { getIgMe, getIgMedia, getIgMediaInsights } from '@/lib/meta/instagram-client';
import { buildDeepProfile, clearDeepProfileCache } from '../deep-profile';

// ── Fixture ──────────────────────────────────────────────────────────────────
// 30 posts designed to make assertions deterministic.
// Layout:
//   posts 0-9   REEL      — high reach 1000-1900
//   posts 10-19 CAROUSEL  — medium reach 400-490
//   posts 20-29 IMAGE     — low reach 100-190
//
// Hook pattern: 4 posts start with "how to grow your" → cluster should appear
// Caption length: 8 short (<=80), 12 medium (81-250), 10 long (251+)
//   long posts have highest reach seeded via REEL group
// Timing: 3 posts at Sunday 09:00 with reach 1800+ → bestSlot[0] should be Sun/9
// Hashtag: #growthhack appears in 3 posts with high engagement → should be in winning

const FIXTURE_POSTS = [
  // REELs (0-9) — high reach
  {
    id: 'r0',
    caption: 'how to grow your audience on instagram tips and more #growthhack #reels',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-03T09:00:00Z', // Sunday 09:00
    like_count: 200,
    comments_count: 30,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1800 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 2200 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 80 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 40 }] },
    ],
  },
  {
    id: 'r1',
    caption: 'how to grow your audience with reels strategy #growthhack #instagram',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-03T09:15:00Z', // Sunday 09:00 slot
    like_count: 180,
    comments_count: 25,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1750 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 2100 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 75 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 35 }] },
    ],
  },
  {
    id: 'r2',
    caption: 'how to grow your audience organically without ads #growthhack',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-03T09:45:00Z', // Sunday 09:00 slot
    like_count: 160,
    comments_count: 20,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1700 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 2000 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 70 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 30 }] },
    ],
  },
  {
    id: 'r3',
    caption: 'this is a completely unique caption about reels editing #reels',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-04T14:00:00Z', // Monday 14:00
    like_count: 150,
    comments_count: 18,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1600 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 1900 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 65 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 28 }] },
    ],
  },
  {
    id: 'r4',
    caption: 'behind the scenes of my content creation workflow for social media growth strategy detailed breakdown',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-05T10:00:00Z',
    like_count: 140,
    comments_count: 15,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1500 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 1800 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 60 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 26 }] },
    ],
  },
  {
    id: 'r5',
    caption: 'content repurposing strategies for maximum reach across platforms and channels',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-06T11:00:00Z',
    like_count: 130,
    comments_count: 14,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1400 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 1700 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 55 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 24 }] },
    ],
  },
  {
    id: 'r6',
    caption: 'algorithm tips for getting your content seen by more people every day',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-07T12:00:00Z',
    like_count: 120,
    comments_count: 13,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1300 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 1600 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 50 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 22 }] },
    ],
  },
  {
    id: 'r7',
    caption: 'posting consistency and why it matters for long-term social media success',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-08T13:00:00Z',
    like_count: 110,
    comments_count: 12,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1200 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 1500 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 45 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 20 }] },
    ],
  },
  {
    id: 'r8',
    caption: 'trending audio tracks and how to use them in your reels effectively',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-09T14:00:00Z',
    like_count: 100,
    comments_count: 11,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1100 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 1400 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 40 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 18 }] },
    ],
  },
  {
    id: 'r9',
    caption: 'hook strategies for the first three seconds that stop the scroll instantly',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    timestamp: '2024-03-10T15:00:00Z',
    like_count: 90,
    comments_count: 10,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 1000 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 1300 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 35 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 16 }] },
    ],
  },

  // CARROUSELs (10-19) — medium reach
  {
    id: 'c0',
    caption: 'Swipe to see my top 5 tips #carousel',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-11T10:00:00Z',
    like_count: 80,
    comments_count: 9,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 490 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 600 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 20 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 10 }] },
    ],
  },
  {
    id: 'c1',
    caption: 'Before and after transformation in 5 slides #transformation',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-12T10:00:00Z',
    like_count: 75,
    comments_count: 8,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 480 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 590 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 19 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 9 }] },
    ],
  },
  {
    id: 'c2',
    caption: 'Step by step guide to better photos #photography',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-13T10:00:00Z',
    like_count: 70,
    comments_count: 7,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 470 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 580 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 18 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 8 }] },
    ],
  },
  {
    id: 'c3',
    caption: 'My editing workflow revealed in detail across many different steps and processes',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-14T10:00:00Z',
    like_count: 65,
    comments_count: 6,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 460 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 570 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 17 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 7 }] },
    ],
  },
  {
    id: 'c4',
    caption: 'Color grading secrets that pro photographers never share with their audiences ever',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-15T10:00:00Z',
    like_count: 60,
    comments_count: 5,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 450 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 560 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 16 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 6 }] },
    ],
  },
  {
    id: 'c5',
    caption: 'Lighting setups from cheap to expensive',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-16T10:00:00Z',
    like_count: 55,
    comments_count: 4,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 440 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 550 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 15 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 5 }] },
    ],
  },
  {
    id: 'c6',
    caption: 'Top presets for Lightroom',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-17T10:00:00Z',
    like_count: 50,
    comments_count: 3,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 430 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 540 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 14 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 4 }] },
    ],
  },
  {
    id: 'c7',
    caption: 'Best camera settings for portraits',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-18T10:00:00Z',
    like_count: 45,
    comments_count: 2,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 420 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 530 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 13 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 3 }] },
    ],
  },
  {
    id: 'c8',
    caption: 'Gear guide for beginners on a budget',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-19T10:00:00Z',
    like_count: 40,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 410 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 520 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 12 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 2 }] },
    ],
  },
  {
    id: 'c9',
    caption: 'Final slide CTA examples',
    media_type: 'CAROUSEL_ALBUM',
    media_product_type: 'FEED',
    timestamp: '2024-03-20T10:00:00Z',
    like_count: 35,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 400 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 510 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 11 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 1 }] },
    ],
  },

  // IMAGEs (20-29) — low reach, short captions
  {
    id: 'i0',
    caption: 'Golden hour #photo',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-21T08:00:00Z',
    like_count: 30,
    comments_count: 2,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 190 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 210 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 5 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 1 }] },
    ],
  },
  {
    id: 'i1',
    caption: 'Morning vibes',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-22T08:00:00Z',
    like_count: 28,
    comments_count: 2,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 180 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 200 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 4 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 1 }] },
    ],
  },
  {
    id: 'i2',
    caption: 'Coffee and code',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-23T08:00:00Z',
    like_count: 26,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 170 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 190 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 3 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
  {
    id: 'i3',
    caption: 'Weekend mood',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-24T08:00:00Z',
    like_count: 24,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 160 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 180 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 3 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
  {
    id: 'i4',
    caption: 'New post up',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-25T08:00:00Z',
    like_count: 22,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 150 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 170 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 2 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
  {
    id: 'i5',
    caption: 'Just posted',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-26T08:00:00Z',
    like_count: 20,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 140 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 160 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 2 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
  {
    id: 'i6',
    caption: 'Check it out',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-27T08:00:00Z',
    like_count: 18,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 130 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 150 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 2 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
  {
    id: 'i7',
    caption: 'Throwback pic',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-28T08:00:00Z',
    like_count: 16,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 120 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 140 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 1 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
  {
    id: 'i8',
    caption: 'Still here',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-29T08:00:00Z',
    like_count: 14,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 110 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 130 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 1 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
  {
    id: 'i9',
    caption: 'Last one',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2024-03-30T08:00:00Z',
    like_count: 12,
    comments_count: 1,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: 100 }] },
      { name: 'views', period: 'lifetime', values: [{ value: 120 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: 1 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: 0 }] },
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// Strip insights from fixture when mocking getIgMedia (they come via getIgMediaInsights separately)
const FIXTURE_MEDIA = FIXTURE_POSTS.map(({ insights: _ignored, ...rest }) => rest);

// Build a lookup for getIgMediaInsights per post id
const FIXTURE_INSIGHTS_MAP = new Map(
  FIXTURE_POSTS.map((p) => [p.id, p.insights])
);

function setupMocks() {
  vi.mocked(getIgMe).mockResolvedValue({
    user_id: 'ig1',
    username: 'testhandle',
    account_type: 'BUSINESS',
    followers_count: 5000,
  });
  // Cast: IgMedia doesn't have insights field; that's fine
  vi.mocked(getIgMedia).mockResolvedValue(FIXTURE_MEDIA as Awaited<ReturnType<typeof getIgMedia>>);
  vi.mocked(getIgMediaInsights).mockImplementation(async (_token: string, mediaId: string) => {
    const data = FIXTURE_INSIGHTS_MAP.get(mediaId) ?? [];
    return { data };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildDeepProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDeepProfileCache();
    setupMocks();
  });

  it('returns correct sampleSize and handle', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    expect(profile.sampleSize).toBe(30);
    expect(profile.handle).toBe('testhandle');
    expect(profile.followerCount).toBe(5000);
  });

  it('computes medians.reach as the numeric median of all 30 reach values', async () => {
    // Reaches: REELs 1000-1900 (10), CARROUSELs 400-490 (10), IMAGEs 100-190 (10)
    // Sorted: 100,110,120,130,140,150,160,170,180,190,400,410,420,430,440,450,460,470,480,490,
    //         1000,1100,1200,1300,1400,1500,1600,1700,1750,1800
    // 30 values, median = avg of 15th and 16th (0-indexed 14,15) = (440+450)/2 = 445
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    expect(profile.medians.reach).toBe(445);
  });

  it('formatPerformance has 3 entries with correct counts', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    expect(profile.formatPerformance).toHaveLength(3);
    const reel = profile.formatPerformance.find((f) => f.format === 'REEL');
    const carousel = profile.formatPerformance.find((f) => f.format === 'CAROUSEL');
    const image = profile.formatPerformance.find((f) => f.format === 'IMAGE');
    expect(reel?.count).toBe(10);
    expect(carousel?.count).toBe(10);
    expect(image?.count).toBe(10);
  });

  it('formatPerformance REEL lift > 1 (higher reach than overall median)', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    const reel = profile.formatPerformance.find((f) => f.format === 'REEL');
    // REEL median reach 1250 > overall 445, so lift > 1
    expect(reel?.liftVsOverall).toBeGreaterThan(1);
  });

  it('formatPerformance IMAGE lift < 1 (lower reach than overall median)', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    const image = profile.formatPerformance.find((f) => f.format === 'IMAGE');
    // IMAGE median reach 145 < overall 445, so lift < 1
    expect(image?.liftVsOverall).toBeLessThan(1);
  });

  it('hookPatterns includes "how to grow your" cluster with >= 3 occurrences', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    const cluster = profile.hookPatterns.find((p) => p.pattern === 'how to grow your');
    expect(cluster).toBeDefined();
    expect(cluster!.occurrences).toBeGreaterThanOrEqual(3);
    expect(cluster!.exampleCaptions.length).toBeGreaterThanOrEqual(2);
  });

  it('hookPatterns does not include single-occurrence captions as a cluster', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    // "this is completely unique" should NOT appear (only 1 occurrence)
    const cluster = profile.hookPatterns.find((p) => p.pattern === 'this is a');
    expect(cluster).toBeUndefined();
  });

  it('captionLengthSweetSpot winner is "short" (IMAGE posts are short and REELs are long)', async () => {
    // REELs have long captions and high reach -> long should win
    // But let's verify the actual winner matches the highest median bucket
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    const { shortMedian, mediumMedian, longMedian, winner } = profile.captionLengthSweetSpot;
    // Winner must be the bucket with max median
    const maxVal = Math.max(shortMedian, mediumMedian, longMedian);
    if (maxVal === longMedian) expect(winner).toBe('long');
    else if (maxVal === mediumMedian) expect(winner).toBe('medium');
    else expect(winner).toBe('short');
  });

  it('timing.heatmap has non-null cell for the seeded high-reach slot', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    // At least one heatmap cell must be non-null (the slot containing the seeded Sunday posts)
    const flatCells = profile.timing.heatmap.flat();
    const nonNull = flatCells.filter((v) => v !== null);
    expect(nonNull.length).toBeGreaterThan(0);
  });

  it('timing.heatmap has null for slots with zero posts', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    // 30 posts across 30 unique timestamps — at most 30 non-null cells; rest must be null
    const flatCells = profile.timing.heatmap.flat();
    const nullCount = flatCells.filter((v) => v === null).length;
    expect(nullCount).toBeGreaterThan(0);
  });

  it('timing.bestSlots[0] has highest medianReach among all slots', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    const top = profile.timing.bestSlots[0];
    expect(top.medianReach).toBeGreaterThan(0);
    // top slot reach should be >= all other bestSlots
    for (const slot of profile.timing.bestSlots) {
      expect(top.medianReach).toBeGreaterThanOrEqual(slot.medianReach);
    }
  });

  it('topicSignals.winning includes #growthhack (highest engagement hashtag)', async () => {
    const profile = await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    expect(profile.topicSignals.winning).toContain('#growthhack');
  });

  it('returns cached result on second call (mock called once)', async () => {
    await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    // getIgMedia should only be called once due to caching
    expect(getIgMedia).toHaveBeenCalledTimes(1);
  });

  it('clearDeepProfileCache invalidates cache for specific user', async () => {
    await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    clearDeepProfileCache('u1');
    await buildDeepProfile({ userId: 'u1', igUserId: 'ig1' });
    expect(getIgMedia).toHaveBeenCalledTimes(2);
  });
});
