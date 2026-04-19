import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 'b1',
            slug: 'affectly',
            name: 'Affectly',
            description: 'Test brand',
            logoUrl: null,
            userId: 'u1',
          }]),
        }),
      }),
    })),
  },
}));
vi.mock('@/lib/db/schema', () => ({ brands: {}, scrapedPosts: {}, posts: {}, instagramAccounts: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock('@/lib/image-processing', () => ({
  createInstagramImageWithText: vi.fn().mockResolvedValue(Buffer.from('fakeimg')),
}));
vi.mock('@/lib/smart-posts', () => ({
  seedFromInsight: vi.fn(),
  mergePerfectSeed: vi.fn().mockReturnValue({
    seed: {
      contentType: 'image',
      avoidTopics: [],
      hookPattern: 'How to',
      captionLengthHint: 100,
      captionPatternHint: 'tip',
      toneHint: 'helpful',
      topicHint: 'productivity tips',
      textPosition: 'center',
      overlayStyle: 'editorial',
      suggestedPostTime: null,
    },
    contributions: { 'best-content-type': 'test' },
  }),
}));
vi.mock('@/lib/cerebras', () => ({
  cerebrasChatCompletion: vi.fn(),
  isCerebrasAvailable: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/smart-posts/past-images', () => ({
  fetchTopPerformingPastImages: vi.fn(),
}));

import { generateFromSeed } from '../generate';
import { fetchTopPerformingPastImages } from '../past-images';

beforeEach(() => {
  vi.clearAllMocks();
});

function stubFetchSequence(responses: Array<{ ok: boolean; body: unknown }>) {
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch call');
    return { ok: next.ok, json: async () => next.body } as Response;
  }));
}

describe('generateFromSeed candidate assembly', () => {
  it('returns up to 6 candidates: stock first, then past, capped at 2 past', async () => {
    vi.mocked(fetchTopPerformingPastImages).mockResolvedValue([
      { id: 'p1', media_url: 'http://past1.jpg', reach: 500 },
      { id: 'p2', media_url: 'http://past2.jpg', reach: 400 },
      { id: 'p3', media_url: 'http://past3.jpg', reach: 300 },
    ]);
    stubFetchSequence([
      { ok: true, body: { insights: [{ id: 'i1', type: 'test' }] } },
      { ok: true, body: { caption: 'cap', hashtags: '#a', hookText: 'Hook' } },
      { ok: true, body: { images: [
        { largeImageURL: 'http://s1.jpg' },
        { largeImageURL: 'http://s2.jpg' },
        { largeImageURL: 'http://s3.jpg' },
        { largeImageURL: 'http://s4.jpg' },
        { largeImageURL: 'http://s5.jpg' },
      ] } },
    ]);

    const result = await generateFromSeed({
      brandId: 'b1', userId: 'u1', origin: 'http://t', cookie: '', igUserId: 'ig1',
    });

    if (!result.ok) throw new Error(`Expected ok, got ${result.err.error}: ${result.err.message}`);
    expect(result.data.candidates).toHaveLength(6);
    expect(result.data.candidates.slice(0, 4).every(c => c.source === 'stock')).toBe(true);
    expect(result.data.candidates.slice(4).every(c => c.source === 'past')).toBe(true);
    expect(result.data.sourceImageUrl).toBe('http://s1.jpg');
  });

  it('falls back to stock-only when past returns []', async () => {
    vi.mocked(fetchTopPerformingPastImages).mockResolvedValue([]);
    stubFetchSequence([
      { ok: true, body: { insights: [{ id: 'i1', type: 'test' }] } },
      { ok: true, body: { caption: 'cap', hashtags: '', hookText: 'Hook' } },
      { ok: true, body: { images: [
        { largeImageURL: 'http://s1.jpg' },
        { largeImageURL: 'http://s2.jpg' },
      ] } },
    ]);

    const result = await generateFromSeed({
      brandId: 'b1', userId: 'u1', origin: 'http://t', cookie: '',
    });

    if (!result.ok) throw new Error(`Expected ok, got ${result.err.error}: ${result.err.message}`);
    expect(result.data.candidates).toHaveLength(2);
    expect(result.data.candidates.every(c => c.source === 'stock')).toBe(true);
  });

  it('returns no_images when both stock and past are empty', async () => {
    vi.mocked(fetchTopPerformingPastImages).mockResolvedValue([]);
    stubFetchSequence([
      { ok: true, body: { insights: [{ id: 'i1', type: 'test' }] } },
      { ok: true, body: { caption: 'cap', hashtags: '', hookText: 'Hook' } },
      { ok: true, body: { images: [] } },
    ]);

    const result = await generateFromSeed({
      brandId: 'b1', userId: 'u1', origin: 'http://t', cookie: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.err.error).toBe('no_images');
  });

  it('returns renderParams matching the seed used for the first render', async () => {
    vi.mocked(fetchTopPerformingPastImages).mockResolvedValue([]);
    stubFetchSequence([
      { ok: true, body: { insights: [{ id: 'i1', type: 'test' }] } },
      { ok: true, body: { caption: 'cap', hashtags: '', hookText: 'A hook' } },
      { ok: true, body: { images: [{ largeImageURL: 'http://s1.jpg' }] } },
    ]);

    const result = await generateFromSeed({
      brandId: 'b1', userId: 'u1', origin: 'http://t', cookie: '',
    });

    if (!result.ok) throw new Error(`Expected ok, got ${result.err.error}: ${result.err.message}`);
    expect(result.data.renderParams).toEqual({
      brand: 'affectly',
      hookText: 'A hook',
      textPosition: 'center',
      overlayStyle: 'editorial',
      logoUrl: null,
    });
  });
});
