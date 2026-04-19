# Smart Posts — Image Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/smart-posts`, after a post is generated, show 6 candidate thumbnails (4 stock + up to 2 past top-performing IG posts) plus a "More options" modal so the user can swap the image without regenerating the caption/hook/seed.

**Architecture:** Three pieces. (1) `generate.ts` collects candidates and returns them with `renderParams` so the client can re-render later. (2) New `POST /api/smart-posts/render` re-runs only the overlay step against any chosen `sourceImageUrl`. (3) `<CandidateStrip>` + `<MoreOptionsDialog>` in the dashboard call `/render` and swap `imageDataUrl` in place.

**Tech Stack:** Next.js (App Router) routes, React 19 client components, Vitest for unit + component tests, `@base-ui/react` Dialog (already in `src/components/ui/dialog.tsx`), `sharp`-based overlay (`createInstagramImageWithText` in `src/lib/image-processing.ts`).

**Spec:** `docs/superpowers/specs/2026-04-18-smart-posts-image-gallery-design.md`

---

## File Map

**Create:**
- `src/lib/smart-posts/past-images.ts` — `fetchTopPerformingPastImages` helper
- `src/lib/smart-posts/__tests__/past-images.test.ts`
- `src/app/api/smart-posts/render/route.ts` — new render endpoint
- `src/app/api/smart-posts/render/__tests__/route.test.ts`
- `src/components/smart-posts/candidate-strip.tsx` — thumb UI
- `src/components/smart-posts/__tests__/candidate-strip.test.tsx`
- `src/components/smart-posts/more-options-dialog.tsx` — modal wrapping `ImageSourceSelector`

**Modify:**
- `src/lib/smart-posts/generate.ts` — accept `igUserId?`, build candidate list, return `candidates` + `renderParams`
- `src/lib/smart-posts/__tests__/generate.test.ts` (create if missing) — candidate-ranking tests
- `src/app/api/smart-posts/god-mode/route.ts` — forward `igUserId` into `generateFromSeed`
- `src/components/smart-posts-dashboard.tsx` — extend `PerfectPost` type, mount strip/dialog, swap-handler

---

## Task 1: `fetchTopPerformingPastImages` helper

**Files:**
- Create: `src/lib/smart-posts/past-images.ts`
- Test: `src/lib/smart-posts/__tests__/past-images.test.ts`

**Why this exists:** `generate.ts` needs the user's top past IG posts ranked by reach so they can serve as candidates. `TopPerformersStrip` already does this in the browser; this is the server-side equivalent that calls the same `/api/meta/instagram/insights` endpoint.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/smart-posts/__tests__/past-images.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTopPerformingPastImages } from '../past-images';

describe('fetchTopPerformingPastImages', () => {
  const origin = 'http://test';
  const cookie = 'sid=abc';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns top N media sorted by reach desc with media_url present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          media: [
            { id: 'a', media_url: 'http://a.jpg', insights: [{ name: 'reach', total_value: { value: 100 } }] },
            { id: 'b', media_url: 'http://b.jpg', insights: [{ name: 'reach', total_value: { value: 500 } }] },
            { id: 'c', media_url: 'http://c.jpg', insights: [{ name: 'reach', total_value: { value: 300 } }] },
          ],
        },
      }),
    }));

    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result.map(m => m.id)).toEqual(['b', 'c']);
  });

  it('falls back to thumbnail_url when media_url is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          media: [
            { id: 'a', thumbnail_url: 'http://a-thumb.jpg', insights: [{ name: 'reach', total_value: { value: 50 } }] },
          ],
        },
      }),
    }));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result[0].media_url ?? result[0].thumbnail_url).toBe('http://a-thumb.jpg');
  });

  it('returns [] when no igUserId', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchTopPerformingPastImages({ igUserId: undefined, limit: 2, origin, cookie });
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns [] when fetch throws (silent fallback, never blocks caller)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result).toEqual([]);
  });

  it('returns [] when response is non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 2, origin, cookie });
    expect(result).toEqual([]);
  });

  it('filters out media with no usable URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          media: [
            { id: 'a', insights: [{ name: 'reach', total_value: { value: 100 } }] },
            { id: 'b', media_url: 'http://b.jpg', insights: [{ name: 'reach', total_value: { value: 50 } }] },
          ],
        },
      }),
    }));
    const result = await fetchTopPerformingPastImages({ igUserId: 'ig1', limit: 5, origin, cookie });
    expect(result.map(m => m.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/smart-posts/__tests__/past-images.test.ts`
Expected: FAIL with "Cannot find module '../past-images'"

- [ ] **Step 3: Write the helper**

```ts
// src/lib/smart-posts/past-images.ts

// Server-side helper that fetches the user's top-performing recent IG media
// (by reach) so they can be offered as image candidates in /smart-posts.
// Mirrors the client-side ranking used by TopPerformersStrip but calls the
// internal insights API with a forwarded cookie for auth.

interface IgInsightRow {
  name: string;
  values?: Array<{ value: number | Record<string, number> }>;
  total_value?: { value: number };
}

interface IgMediaItem {
  id: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  insights?: IgInsightRow[];
}

interface InsightsResponse {
  data?: { media?: IgMediaItem[] };
  error?: string;
}

export interface PastImageMedia {
  id: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  reach: number;
}

function extractReach(media: IgMediaItem): number {
  const row = media.insights?.find((r) => r.name === 'reach');
  if (!row) return 0;
  if (row.total_value && typeof row.total_value.value === 'number') return row.total_value.value;
  const first = row.values?.[0]?.value;
  return typeof first === 'number' ? first : 0;
}

export interface FetchTopPerformingPastImagesInput {
  igUserId: string | undefined;
  limit: number;
  origin: string;
  cookie: string;
}

export async function fetchTopPerformingPastImages(
  input: FetchTopPerformingPastImagesInput,
): Promise<PastImageMedia[]> {
  if (!input.igUserId) return [];
  try {
    const res = await fetch(
      `${input.origin}/api/meta/instagram/insights?igUserId=${encodeURIComponent(input.igUserId)}`,
      { headers: { cookie: input.cookie } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as InsightsResponse;
    const media = json.data?.media ?? [];
    return media
      .map<PastImageMedia>((m) => ({
        id: m.id,
        media_url: m.media_url,
        thumbnail_url: m.thumbnail_url,
        permalink: m.permalink,
        reach: extractReach(m),
      }))
      .filter((m) => Boolean(m.media_url ?? m.thumbnail_url))
      .sort((a, b) => b.reach - a.reach)
      .slice(0, input.limit);
  } catch (err) {
    console.warn('[fetchTopPerformingPastImages] failed, falling back to []', err);
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/smart-posts/__tests__/past-images.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/smart-posts/past-images.ts src/lib/smart-posts/__tests__/past-images.test.ts
git commit -m "feat(smart-posts): server-side helper for top-performing past IG images"
```

---

## Task 2: Refactor `generate.ts` to assemble candidates + return `renderParams`

**Files:**
- Modify: `src/lib/smart-posts/generate.ts:181-203` (input/result types) and `src/lib/smart-posts/generate.ts:394-458` (image-fetch + return shape)
- Test: `src/lib/smart-posts/__tests__/generate.test.ts` (new file)

**Why this matters:** The dashboard needs to know what other images were available, and needs the overlay parameters frozen at generate time so re-rendering produces a consistent output. Past-image fetch is parallelized with stock so total latency is `max(stock, past)` not `sum`.

- [ ] **Step 1: Write failing tests for the new candidate logic**

```ts
// src/lib/smart-posts/__tests__/generate.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub heavy collaborators before importing the module under test.
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{
          id: 'b1',
          slug: 'affectly',
          name: 'Affectly',
          description: 'Test brand',
          logoUrl: null,
        }]) }),
      }),
    }),
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
    contentType: 'image',
    avoidTopics: [],
    hookPattern: 'How to',
    captionLengthHint: 100,
    captionPatternHint: 'tip',
    toneHint: 'helpful',
    topicHint: 'productivity',
    textPosition: 'center',
    overlayStyle: 'editorial',
    suggestedPostTime: null,
  }),
}));
vi.mock('@/lib/image-queries', () => ({
  deriveImageQuery: vi.fn().mockResolvedValue('productivity tips'),
}));
vi.mock('@/lib/smart-posts/past-images', () => ({
  fetchTopPerformingPastImages: vi.fn(),
}));
vi.mock('@/lib/health-score', () => ({ computeHealthScore: vi.fn() }));
vi.mock('@/lib/insights/types', () => ({}));

import { generateFromSeed } from '../generate';
import { fetchTopPerformingPastImages } from '../past-images';

beforeEach(() => {
  vi.restoreAllMocks();
  // Re-stub fetch each time so tests don't bleed.
});

function stubFetchSequence(responses: Array<{ ok: boolean; body: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected fetch: ${url}`);
    return { ok: next.ok, json: async () => next.body } as Response;
  }));
  return calls;
}

describe('generateFromSeed candidate assembly', () => {
  it('returns up to 6 candidates: stock first, then past, capped at 2 past', async () => {
    vi.mocked(fetchTopPerformingPastImages).mockResolvedValue([
      { id: 'p1', media_url: 'http://past1.jpg', reach: 500 },
      { id: 'p2', media_url: 'http://past2.jpg', reach: 400 },
      { id: 'p3', media_url: 'http://past3.jpg', reach: 300 },  // dropped (cap=2)
    ]);
    stubFetchSequence([
      // captions
      { ok: true, body: { caption: 'cap', hashtags: '#a', hookText: 'Hook' } },
      // images (stock)
      { ok: true, body: { images: [
        { largeImageURL: 'http://s1.jpg' },
        { largeImageURL: 'http://s2.jpg' },
        { largeImageURL: 'http://s3.jpg' },
        { largeImageURL: 'http://s4.jpg' },
        { largeImageURL: 'http://s5.jpg' }, // dropped (target - past = 4)
      ] } },
    ]);

    const result = await generateFromSeed({
      brandId: 'b1', userId: 'u1', origin: 'http://t', cookie: '', igUserId: 'ig1',
    });

    if (!result.ok) throw new Error(`Expected ok, got ${result.err.error}`);
    expect(result.data.candidates).toHaveLength(6);
    expect(result.data.candidates.slice(0, 4).every(c => c.source === 'stock')).toBe(true);
    expect(result.data.candidates.slice(4).every(c => c.source === 'past')).toBe(true);
    expect(result.data.sourceImageUrl).toBe('http://s1.jpg');
  });

  it('falls back to stock-only when past returns []', async () => {
    vi.mocked(fetchTopPerformingPastImages).mockResolvedValue([]);
    stubFetchSequence([
      { ok: true, body: { caption: 'cap', hashtags: '', hookText: 'Hook' } },
      { ok: true, body: { images: [
        { largeImageURL: 'http://s1.jpg' },
        { largeImageURL: 'http://s2.jpg' },
      ] } },
    ]);

    const result = await generateFromSeed({
      brandId: 'b1', userId: 'u1', origin: 'http://t', cookie: '',
    });

    if (!result.ok) throw new Error('Expected ok');
    expect(result.data.candidates).toHaveLength(2);
    expect(result.data.candidates.every(c => c.source === 'stock')).toBe(true);
  });

  it('returns no_images when both stock and past are empty', async () => {
    vi.mocked(fetchTopPerformingPastImages).mockResolvedValue([]);
    stubFetchSequence([
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
      { ok: true, body: { caption: 'cap', hashtags: '', hookText: 'A hook' } },
      { ok: true, body: { images: [{ largeImageURL: 'http://s1.jpg' }] } },
    ]);

    const result = await generateFromSeed({
      brandId: 'b1', userId: 'u1', origin: 'http://t', cookie: '',
    });

    if (!result.ok) throw new Error('Expected ok');
    expect(result.data.renderParams).toEqual({
      brand: 'affectly',
      hookText: 'A hook',
      textPosition: 'center',
      overlayStyle: 'editorial',
      logoUrl: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/smart-posts/__tests__/generate.test.ts`
Expected: FAIL — `result.data.candidates` undefined and `result.data.renderParams` undefined.

- [ ] **Step 3: Update `GenerateFromSeedInput` and `GenerateFromSeedResult`**

Modify `src/lib/smart-posts/generate.ts:181-203`. Replace the two interfaces with:

```ts
export interface GenerateFromSeedInput {
  insightId?: string;
  brandId?: string;
  metaOverrides?: unknown;
  userId: string;
  /** Origin of the Next.js app (e.g. "https://example.com") used for internal fetches. */
  origin: string;
  /** Forwarded cookie header for internal API auth. */
  cookie: string;
  /** Optional connected IG account id; when present, top past posts join the candidate list. */
  igUserId?: string;
}

export interface ImageCandidate {
  url: string;
  source: 'stock' | 'past';
  permalink?: string;
}

export interface RenderParams {
  brand: 'affectly' | 'pacebrain';
  hookText: string;
  textPosition: 'top' | 'center' | 'bottom';
  overlayStyle: 'editorial' | 'bold-card' | 'gradient-bar' | 'full-tint';
  logoUrl: string | null;
}

export interface GenerateFromSeedResult {
  imageDataUrl: string;
  sourceImageUrl: string;
  caption: string;
  hashtags: string;
  hookText: string;
  seed: unknown;
  suggestedPostTime: unknown;
  scheduledAt: string | null;
  sourceInsightId: string | null;
  contributions: Record<string, string>;
  candidates: ImageCandidate[];
  renderParams: RenderParams;
}
```

- [ ] **Step 4: Replace the image-fetch + return blocks with candidate assembly**

In `src/lib/smart-posts/generate.ts`, replace lines 394-423 (the `imagesRes` block + `firstImage` extraction) with:

```ts
  const [imagesRes, pastRes] = await Promise.all([
    fetch(`${origin}/api/images?source=all&q=${encodeURIComponent(topicQuery)}`, {
      headers: { cookie },
    }),
    fetchTopPerformingPastImages({ igUserId, limit: 2, origin, cookie }),
  ]);

  if (!imagesRes.ok) {
    return {
      ok: false,
      err: {
        error: 'image_search_failed',
        message: "Couldn't fetch a stock image. Connect a stock source in Settings.",
        status: 502,
      },
    };
  }
  const imagesPayload = (await imagesRes.json()) as {
    images?: Array<{ largeImageURL?: string; url?: string }>;
  };

  const TARGET = 6;
  const PAST_CAP = 2;
  const pastCandidates: ImageCandidate[] = pastRes
    .slice(0, PAST_CAP)
    .map((m) => ({
      url: (m.media_url ?? m.thumbnail_url) as string,
      source: 'past' as const,
      permalink: m.permalink,
    }))
    .filter((c) => Boolean(c.url));
  const stockCandidates: ImageCandidate[] = (imagesPayload.images ?? [])
    .slice(0, TARGET - pastCandidates.length)
    .map((img) => ({
      url: (img.largeImageURL ?? img.url) as string,
      source: 'stock' as const,
    }))
    .filter((c) => Boolean(c.url));

  const candidates: ImageCandidate[] = [...stockCandidates, ...pastCandidates];
  const sourceImageUrl = candidates[0]?.url;
  if (!sourceImageUrl) {
    return {
      ok: false,
      err: {
        error: 'no_images',
        message:
          'No stock image found for this topic. Connect Pixabay, Unsplash, or Pexels in Settings.',
        status: 422,
      },
    };
  }
```

Add the import at the top of `src/lib/smart-posts/generate.ts` (next to existing imports):

```ts
import { fetchTopPerformingPastImages } from './past-images';
```

`ImageCandidate` and `RenderParams` are declared in this same file (Step 3 above) — reference them by name; do NOT self-import.

Also extend the destructure of `input` near the top of `generateFromSeed` to include `igUserId`:

```ts
const { insightId, brandId, metaOverrides: rawMetaOverrides, userId, origin, cookie, igUserId } = input;
```

- [ ] **Step 5: Update the return block to include `candidates` and `renderParams`**

Replace lines 444-458 of `src/lib/smart-posts/generate.ts`:

```ts
  const renderParams: RenderParams = {
    brand: renderBrand,
    hookText: hookText.slice(0, 60),
    textPosition: seed.textPosition,
    overlayStyle: seed.overlayStyle,
    logoUrl: brand.logoUrl ?? null,
  };

  return {
    ok: true,
    data: {
      imageDataUrl,
      sourceImageUrl,
      caption: captionPayload.caption ?? '',
      hashtags: captionPayload.hashtags ?? '',
      hookText: hookText.slice(0, 60),
      seed,
      suggestedPostTime: seed.suggestedPostTime,
      scheduledAt,
      sourceInsightId: insightId ?? null,
      contributions,
      candidates,
      renderParams,
    },
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/smart-posts/__tests__/generate.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 7: Run the full test suite to catch regressions**

Run: `npx vitest run`
Expected: PASS for everything that was passing before. Pre-existing failure in `src/lib/meta/__tests__/deep-profile.test.ts` is unrelated (documented type mismatch, not your code).

- [ ] **Step 8: Commit**

```bash
git add src/lib/smart-posts/generate.ts src/lib/smart-posts/__tests__/generate.test.ts
git commit -m "feat(smart-posts): return image candidates and renderParams from generate"
```

---

## Task 3: New `POST /api/smart-posts/render` endpoint

**Files:**
- Create: `src/app/api/smart-posts/render/route.ts`
- Test: `src/app/api/smart-posts/render/__tests__/route.test.ts`

**Why this matters:** Re-rendering only the overlay (not regenerating caption/seed) is what makes thumb-clicks feel instant. This endpoint is the single point of truth for that operation.

- [ ] **Step 1: Write failing tests**

```ts
// src/app/api/smart-posts/render/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  getUserId: vi.fn().mockResolvedValue('u1'),
}));

vi.mock('@/lib/image-processing', () => ({
  createInstagramImageWithText: vi.fn(),
}));

import { POST } from '../route';
import { getUserId } from '@/lib/auth-helpers';
import { createInstagramImageWithText } from '@/lib/image-processing';

function makeReq(body: unknown) {
  return new NextRequest('http://test/api/smart-posts/render', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(getUserId).mockResolvedValue('u1');
  vi.mocked(createInstagramImageWithText).mockResolvedValue(Buffer.from('IMG'));
});

describe('POST /api/smart-posts/render', () => {
  it('returns a data URL on happy path', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'http://example.com/a.jpg',
      hookText: 'Hello',
      brand: 'affectly',
      textPosition: 'center',
      overlayStyle: 'editorial',
      logoUrl: null,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeReq({
      sourceImageUrl: 'http://example.com/a.jpg',
      hookText: 'Hi',
      brand: 'affectly',
      textPosition: 'center',
      overlayStyle: 'editorial',
      logoUrl: null,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when sourceImageUrl is missing', async () => {
    const res = await POST(makeReq({
      hookText: 'Hi', brand: 'affectly', textPosition: 'center', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('sourceImageUrl_required');
  });

  it('returns 400 when brand is invalid', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'http://x.jpg', hookText: 'Hi',
      brand: 'mystery-brand', textPosition: 'center', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_brand');
  });

  it('returns 400 when textPosition is invalid', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'http://x.jpg', hookText: 'Hi', brand: 'affectly',
      textPosition: 'left', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 502 when overlay throws', async () => {
    vi.mocked(createInstagramImageWithText).mockRejectedValueOnce(new Error('sharp boom'));
    const res = await POST(makeReq({
      sourceImageUrl: 'http://x.jpg', hookText: 'Hi', brand: 'affectly',
      textPosition: 'center', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('render_failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/smart-posts/render/__tests__/route.test.ts`
Expected: FAIL with "Cannot find module '../route'"

- [ ] **Step 3: Write the route**

```ts
// src/app/api/smart-posts/render/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { createInstagramImageWithText } from '@/lib/image-processing';

// Allow extra headroom — sharp + remote image fetch can be slow.
export const maxDuration = 30;

const VALID_BRANDS = ['affectly', 'pacebrain'] as const;
type Brand = (typeof VALID_BRANDS)[number];
const VALID_POSITIONS = ['top', 'center', 'bottom'] as const;
type TextPosition = (typeof VALID_POSITIONS)[number];
const VALID_STYLES = ['editorial', 'bold-card', 'gradient-bar', 'full-tint'] as const;
type OverlayStyle = (typeof VALID_STYLES)[number];

interface RenderBody {
  sourceImageUrl?: string;
  hookText?: string;
  brand?: string;
  textPosition?: string;
  overlayStyle?: string;
  logoUrl?: string | null;
}

function isOneOf<T extends string>(allowed: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  try {
    await getUserId();

    const body = (await req.json().catch(() => ({}))) as RenderBody;

    if (!body.sourceImageUrl || typeof body.sourceImageUrl !== 'string') {
      return NextResponse.json(
        { error: 'sourceImageUrl_required', message: 'sourceImageUrl is required.' },
        { status: 400 },
      );
    }
    if (!isOneOf<Brand>(VALID_BRANDS, body.brand)) {
      return NextResponse.json(
        { error: 'invalid_brand', message: `brand must be one of ${VALID_BRANDS.join(', ')}.` },
        { status: 400 },
      );
    }
    if (!isOneOf<TextPosition>(VALID_POSITIONS, body.textPosition)) {
      return NextResponse.json(
        { error: 'invalid_text_position', message: `textPosition must be one of ${VALID_POSITIONS.join(', ')}.` },
        { status: 400 },
      );
    }
    if (!isOneOf<OverlayStyle>(VALID_STYLES, body.overlayStyle)) {
      return NextResponse.json(
        { error: 'invalid_overlay_style', message: `overlayStyle must be one of ${VALID_STYLES.join(', ')}.` },
        { status: 400 },
      );
    }

    const hookText = (body.hookText ?? '').slice(0, 60);
    const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl : null;

    try {
      const buf = await createInstagramImageWithText(
        body.sourceImageUrl,
        body.brand,
        hookText,
        body.textPosition,
        '#FFFFFF',
        64,
        body.overlayStyle,
        logoUrl,
      );
      return NextResponse.json({ imageDataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` });
    } catch (err) {
      console.error('[SmartPosts/render] overlay failed:', err);
      return NextResponse.json(
        { error: 'render_failed', message: err instanceof Error ? err.message : 'Render failed.' },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[SmartPosts/render] Error:', error);
    return NextResponse.json(
      { error: 'unknown', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/smart-posts/render/__tests__/route.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/smart-posts/render/route.ts src/app/api/smart-posts/render/__tests__/route.test.ts
git commit -m "feat(smart-posts): /api/smart-posts/render endpoint for image swaps"
```

---

## Task 4: Forward `igUserId` from god-mode + generate routes

**Files:**
- Modify: `src/app/api/smart-posts/god-mode/route.ts` (route POST handler — pass `igUserId` to both real call and `generateFallback`)
- Modify: `src/app/api/smart-posts/generate/route.ts` (accept `igUserId` in body, forward to seed)

**Why this matters:** Without forwarding `igUserId`, `generateFromSeed` never has the value it needs to fetch past images. Today the dashboard already passes `igUserId` to the god-mode body; we extend the contract to the regular generate route too so the candidate strip works in both modes.

- [ ] **Step 1: Patch god-mode to forward igUserId on success and fallback paths**

Modify `src/app/api/smart-posts/god-mode/route.ts`:

In `generateFallback`, add `igUserId?: string` to the opts type and pass it to `generateFromSeed`:

```ts
async function generateFallback(opts: {
  brandId: string;
  userId: string;
  origin: string;
  cookie: string;
  profile: DeepProfile;
  reason: string;
  raw: string;
  igUserId?: string;
}) {
  console.warn(
    `[SmartPosts/god-mode/fallback] reason=${opts.reason}, falling back to standard generate. Raw (first 500):`,
    opts.raw.slice(0, 500),
  );
  const outcome = await generateFromSeed({
    brandId: opts.brandId,
    userId: opts.userId,
    origin: opts.origin,
    cookie: opts.cookie,
    igUserId: opts.igUserId,
  });
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.err.error, message: outcome.err.message },
      { status: outcome.err.status },
    );
  }
  return NextResponse.json({
    ...outcome.data,
    deepProfile: opts.profile,
    godModeFellBack: true,
    godModeFellBackReason: opts.reason,
  });
}
```

In each `generateFallback({...})` call site, add `, igUserId`. In the success path's `generateFromSeed` call, add `igUserId`:

```ts
    const outcome = await generateFromSeed({
      brandId,
      metaOverrides: sanitized,
      userId,
      origin,
      cookie,
      igUserId,
    });
```

- [ ] **Step 2: Patch the regular generate route**

Modify `src/app/api/smart-posts/generate/route.ts`. Replace the body-destructure and `generateFromSeed` call:

```ts
    const body = await request.json();
    const { insightId, brandId, metaOverrides, igUserId } = body as {
      insightId?: string;
      brandId?: string;
      metaOverrides?: unknown;
      igUserId?: string;
    };

    const origin = request.nextUrl.origin;
    const cookie = request.headers.get('cookie') ?? '';

    const outcome = await generateFromSeed({
      insightId, brandId, metaOverrides, userId, origin, cookie, igUserId,
    });
```

- [ ] **Step 3: Verify god-mode tests still pass**

Run: `npx vitest run src/app/api/smart-posts/god-mode/__tests__/route.test.ts`
Expected: PASS (existing assertions don't care about igUserId being optional).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/smart-posts/god-mode/route.ts src/app/api/smart-posts/generate/route.ts
git commit -m "feat(smart-posts): forward igUserId so candidates include past posts"
```

---

## Task 5: `<CandidateStrip>` component

**Files:**
- Create: `src/components/smart-posts/candidate-strip.tsx`
- Test: `src/components/smart-posts/__tests__/candidate-strip.test.tsx`

**Why this matters:** This is the user-visible part of the gallery — 6 thumbs with active highlight + "More options" button. It owns the `/render` POST and notifies the parent via `onImageChange`.

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/smart-posts/__tests__/candidate-strip.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CandidateStrip } from '../candidate-strip';
import type { ImageCandidate, RenderParams } from '@/lib/smart-posts/generate';

const candidates: ImageCandidate[] = [
  { url: 'http://a.jpg', source: 'stock' },
  { url: 'http://b.jpg', source: 'stock' },
  { url: 'http://c.jpg', source: 'past', permalink: 'http://ig/c' },
];
const renderParams: RenderParams = {
  brand: 'affectly',
  hookText: 'Hi',
  textPosition: 'center',
  overlayStyle: 'editorial',
  logoUrl: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('<CandidateStrip>', () => {
  it('renders one thumb per candidate', () => {
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={vi.fn()}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /image candidate/i })).toHaveLength(3);
  });

  it('marks the active candidate visually (data-active=true)', () => {
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://b.jpg"
        renderParams={renderParams}
        onImageChange={vi.fn()}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    const thumbs = screen.getAllByRole('button', { name: /image candidate/i });
    expect(thumbs[0].getAttribute('data-active')).toBe('false');
    expect(thumbs[1].getAttribute('data-active')).toBe('true');
    expect(thumbs[2].getAttribute('data-active')).toBe('false');
  });

  it('clicking a non-active thumb POSTs to /render and calls onImageChange', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: 'data:image/jpeg;base64,XYZ' }),
    }));
    const onImageChange = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={onImageChange}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /image candidate/i })[1]);
    await waitFor(() => expect(onImageChange).toHaveBeenCalledWith('data:image/jpeg;base64,XYZ', 'http://b.jpg'));
  });

  it('clicking the active thumb is a no-op', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onImageChange = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={onImageChange}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /image candidate/i })[0]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onImageChange).not.toHaveBeenCalled();
  });

  it('keeps existing image when /render fails (no onImageChange)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }));
    const onImageChange = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={onImageChange}
        onOpenMoreOptions={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /image candidate/i })[1]);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn.?t swap/i);
    });
    expect(onImageChange).not.toHaveBeenCalled();
  });

  it('"More options" button calls onOpenMoreOptions', () => {
    const onOpen = vi.fn();
    render(
      <CandidateStrip
        candidates={candidates}
        activeUrl="http://a.jpg"
        renderParams={renderParams}
        onImageChange={vi.fn()}
        onOpenMoreOptions={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    expect(onOpen).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/smart-posts/__tests__/candidate-strip.test.tsx`
Expected: FAIL with "Cannot find module '../candidate-strip'"

- [ ] **Step 3: Write the component**

```tsx
// src/components/smart-posts/candidate-strip.tsx
'use client';

import { useState } from 'react';
import { Loader2, ImagePlus } from 'lucide-react';
import type { ImageCandidate, RenderParams } from '@/lib/smart-posts/generate';

interface CandidateStripProps {
  candidates: ImageCandidate[];
  activeUrl: string;
  renderParams: RenderParams;
  onImageChange: (newImageDataUrl: string, newSourceUrl: string) => void;
  onOpenMoreOptions: () => void;
}

export function CandidateStrip({
  candidates,
  activeUrl,
  renderParams,
  onImageChange,
  onOpenMoreOptions,
}: CandidateStripProps) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(c: ImageCandidate) {
    if (c.url === activeUrl) return;
    setError(null);
    setPendingUrl(c.url);
    try {
      const res = await fetch('/api/smart-posts/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageUrl: c.url,
          ...renderParams,
        }),
      });
      if (!res.ok) {
        setError("Couldn't swap image — try again.");
        return;
      }
      const body = (await res.json()) as { imageDataUrl?: string };
      if (!body.imageDataUrl) {
        setError("Couldn't swap image — try again.");
        return;
      }
      onImageChange(body.imageDataUrl, c.url);
    } catch {
      setError("Couldn't swap image — try again.");
    } finally {
      setPendingUrl(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {candidates.map((c) => {
          const isActive = c.url === activeUrl;
          const isPending = pendingUrl === c.url;
          return (
            <button
              key={c.url}
              type="button"
              aria-label={`Image candidate from ${c.source}`}
              data-active={isActive}
              onClick={() => void handlePick(c)}
              disabled={isPending || pendingUrl !== null}
              className={`relative h-14 w-14 overflow-hidden rounded-lg border transition disabled:opacity-60 ${
                isActive
                  ? 'border-teal-400 ring-2 ring-teal-400/40'
                  : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.url} alt="" className="h-full w-full object-cover" />
              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              )}
              {c.source === 'past' && !isPending && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wide text-teal-200">
                  Past
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMoreOptions}
          disabled={pendingUrl !== null}
          className="inline-flex h-14 items-center gap-1 rounded-lg border border-dashed border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-60"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          More options
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/smart-posts/__tests__/candidate-strip.test.tsx`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/smart-posts/candidate-strip.tsx src/components/smart-posts/__tests__/candidate-strip.test.tsx
git commit -m "feat(smart-posts): CandidateStrip component for in-place image swaps"
```

---

## Task 6: `<MoreOptionsDialog>` modal

**Files:**
- Create: `src/components/smart-posts/more-options-dialog.tsx`

**Why this matters:** The "More options" button needs to open the existing `<ImageSourceSelector>` so the user can search any provider and pick anything. We wrap it in a Dialog so it doesn't disrupt the dashboard layout, and we forward the picked image through the same `/render` flow as the strip.

- [ ] **Step 1: Write the dialog component**

```tsx
// src/components/smart-posts/more-options-dialog.tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImageSourceSelector } from '@/components/image-source-selector';
import type { ImageResult } from '@/lib/image-sources';
import type { RenderParams } from '@/lib/smart-posts/generate';

interface MoreOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderParams: RenderParams;
  onImageChange: (newImageDataUrl: string, newSourceUrl: string) => void;
}

export function MoreOptionsDialog({
  open,
  onOpenChange,
  renderParams,
  onImageChange,
}: MoreOptionsDialogProps) {
  const [results, setResults] = useState<ImageResult[]>([]);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(url: string) {
    setError(null);
    setPendingUrl(url);
    try {
      const res = await fetch('/api/smart-posts/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceImageUrl: url, ...renderParams }),
      });
      if (!res.ok) {
        setError("Couldn't swap image — try again.");
        return;
      }
      const body = (await res.json()) as { imageDataUrl?: string };
      if (!body.imageDataUrl) {
        setError("Couldn't swap image — try again.");
        return;
      }
      onImageChange(body.imageDataUrl, url);
      onOpenChange(false);
    } catch {
      setError("Couldn't swap image — try again.");
    } finally {
      setPendingUrl(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick a different image</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ImageSourceSelector
            brand={renderParams.brand}
            onImagesLoaded={(imgs) => setResults(imgs)}
          />
          {results.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {results.map((img) => {
                const url = img.largeImageURL ?? img.previewURL;
                const isPending = pendingUrl === url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => void pick(url)}
                    disabled={pendingUrl !== null}
                    className="relative aspect-square overflow-hidden rounded-lg border border-zinc-700 hover:border-teal-400 disabled:opacity-60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewURL} alt="" className="h-full w-full object-cover" />
                    {isPending && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Confirm the file type-checks against existing exports**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "more-options-dialog"`
Expected: NO output (no errors in this file). The pre-existing `deep-profile.test.ts` error is unrelated and may still appear in the full output — ignore it.

- [ ] **Step 3: Commit**

```bash
git add src/components/smart-posts/more-options-dialog.tsx
git commit -m "feat(smart-posts): MoreOptionsDialog wraps ImageSourceSelector for full search"
```

---

## Task 7: Wire `<CandidateStrip>` + `<MoreOptionsDialog>` into the dashboard

**Files:**
- Modify: `src/components/smart-posts-dashboard.tsx`

**Why this matters:** Connecting the new pieces is where the user actually sees the gallery. The `PerfectPost` interface gains the new fields, and the post-preview block renders the strip plus the dialog with shared swap logic.

- [ ] **Step 1: Extend the `PerfectPost` interface (top of file, around line 34-49)**

Add `candidates` and `renderParams` to the existing `PerfectPost` interface:

```ts
interface PerfectPost {
  imageDataUrl: string;
  sourceImageUrl: string;
  caption: string;
  hashtags: string;
  hookText: string;
  suggestedPostTime?: { day: string; hour: number };
  scheduledAt?: string | null;
  contributions: Record<string, string>;
  godModeRationale?: string;
  deepProfile?: DeepProfile;
  candidates?: ImageCandidate[];
  renderParams?: RenderParams;
}
```

Add the imports at the top of the file (next to existing smart-posts imports):

```ts
import { CandidateStrip } from '@/components/smart-posts/candidate-strip';
import { MoreOptionsDialog } from '@/components/smart-posts/more-options-dialog';
import type { ImageCandidate, RenderParams } from '@/lib/smart-posts/generate';
```

- [ ] **Step 2: Add dialog state inside `SmartPostsDashboard`**

Right after `const [scheduleOk, setScheduleOk] = useState(false);` add:

```ts
const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
```

- [ ] **Step 3: Add a swap handler that updates the post in place**

Right above `handleSchedule`, add:

```ts
const handleImageSwap = (newImageDataUrl: string, newSourceUrl: string) => {
  setPost((prev) =>
    prev
      ? { ...prev, imageDataUrl: newImageDataUrl, sourceImageUrl: newSourceUrl }
      : prev,
  );
};
```

- [ ] **Step 4: Forward `igUserId` in the regular generate body**

In `handleGenerate`, change the non-god-mode body so the regular path also benefits from past-image candidates:

```ts
const body = useGodMode
  ? { brandId, igUserId: ig, likeOfMediaId: likeOf }
  : { brandId, metaOverrides, igUserId: ig };
```

- [ ] **Step 5: Render the strip + dialog inside the post preview block**

Find the post preview JSX (currently lines ~525-592 — the `{post && (...)} ` block). Inside the `<div className="space-y-3 text-sm">` (right after the `<WhyThisWorks ... />` element, BEFORE the action buttons row), insert:

```tsx
{post.candidates && post.candidates.length > 1 && post.renderParams && (
  <div className="pt-2">
    <p className="mb-1.5 text-xs uppercase tracking-wide text-zinc-400">
      Swap image
    </p>
    <CandidateStrip
      candidates={post.candidates}
      activeUrl={post.sourceImageUrl}
      renderParams={post.renderParams}
      onImageChange={handleImageSwap}
      onOpenMoreOptions={() => setMoreOptionsOpen(true)}
    />
  </div>
)}
```

At the bottom of the component's return (just before the closing `</div>` of the outer `<div className="space-y-6">` wrapper, OR as a sibling to the post preview), mount the dialog:

```tsx
{post?.renderParams && (
  <MoreOptionsDialog
    open={moreOptionsOpen}
    onOpenChange={setMoreOptionsOpen}
    renderParams={post.renderParams}
    onImageChange={handleImageSwap}
  />
)}
```

- [ ] **Step 6: Verify the dashboard type-checks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "smart-posts-dashboard"`
Expected: NO output (no errors in this file).

- [ ] **Step 7: Manual smoke test in a browser**

```bash
# Kill any running dev server for this codebase first, then:
rm -rf .next
npm run dev
```

Open `http://localhost:3000/smart-posts`. Verify:
1. Generate a post.
2. Strip shows 1-6 thumbs under the post (depending on stock + past availability).
3. The first thumb has a teal ring (active state).
4. Clicking a different thumb shows a spinner on it, then swaps the preview image without changing caption/hook.
5. Clicking the already-active thumb is a no-op.
6. Clicking "More options" opens the dialog, search works, picking a result swaps the image and closes the dialog.
7. If you stop the dev server mid-swap, the strip shows "Couldn't swap image — try again." in red instead of breaking.

- [ ] **Step 8: Commit**

```bash
git add src/components/smart-posts-dashboard.tsx
git commit -m "feat(smart-posts): mount CandidateStrip and MoreOptionsDialog on the dashboard"
```

---

## Task 8: Final verification + deploy

**Files:** none modified.

- [ ] **Step 1: Run the full unit + component test suite**

Run: `npx vitest run`
Expected: PASS for everything except the pre-existing `src/lib/meta/__tests__/deep-profile.test.ts` type mismatch (unrelated to this work — do NOT try to fix as part of this plan).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -vE "deep-profile.test.ts"`
Expected: NO output. (deep-profile.test.ts is pre-existing and grep'd out.)

- [ ] **Step 3: Lint changed files**

Run: `npx eslint src/lib/smart-posts/past-images.ts src/lib/smart-posts/generate.ts src/app/api/smart-posts/render/route.ts src/app/api/smart-posts/generate/route.ts src/app/api/smart-posts/god-mode/route.ts src/components/smart-posts/candidate-strip.tsx src/components/smart-posts/more-options-dialog.tsx src/components/smart-posts-dashboard.tsx`
Expected: clean.

- [ ] **Step 4: Push develop**

```bash
git push origin develop
```

- [ ] **Step 5: Merge develop into main and push (production deploy)**

```bash
git checkout main
git merge develop --no-ff -m "Merge develop: smart-posts image gallery"
git push origin main
git checkout develop
```

- [ ] **Step 6: Production smoke test**

Open the prod URL (e.g. `https://goviraleza.vercel.app/smart-posts`), generate a post, click a different thumb, verify swap works on production. Open the "More options" dialog and verify search returns results.

---
