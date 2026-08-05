// Creative-genome wiring on the ORGANIC (autopilot) rail.
//
// god-mode publishes to real Instagram accounts unattended, so the load-bearing
// assertion in this file is the FIRST one: with CREATIVE_GENOME_ENABLED unset,
// nothing is sampled, the prompt keeps its exact pre-genome shape, and the
// response gains no keys. Everything after that only matters if the flag is on.
//
// Kept separate from route.test.ts because the steering queries need a richer
// db stub than that file's (which deliberately lets steering fail, exercising
// the degraded path).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';
import type { SampledGenome, SamplableIngredient } from '@/lib/creative/sampling';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { state, sampleGenomeFn, readMocks } = vi.hoisted(() => ({
  state: {
    hookRows: [] as Array<{ hookText: string | null }>,
    painRows: [] as Array<Record<string, unknown>>,
  },
  sampleGenomeFn: vi.fn(),
  readMocks: {
    loadSamplableIngredients: vi.fn(),
    refreshScores: vi.fn(),
    loadRecentGenomeIngredientIds: vi.fn(),
    nextGenomeIndex: vi.fn(),
  },
}));

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/meta/deep-profile', () => ({ buildDeepProfile: vi.fn() }));
vi.mock('@/lib/cerebras', () => ({
  cerebrasChatCompletion: vi.fn(),
  isCerebrasAvailable: () => true,
}));
vi.mock('@/lib/smart-posts/generate', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/smart-posts/generate')>();
  return { ...orig, generateFromSeed: vi.fn() };
});
vi.mock('@/lib/brain/competitor-intel', () => ({ buildCompetitorIntel: vi.fn().mockResolvedValue(null) }));

// db stub shaped for BOTH steering queries off one `.where()`:
//   posts:           .where(...).orderBy(...).limit(n)  → hook rows
//   brandPainPoints: .where(...).then(rows => rows[0])   → pain rows
// A thenable carrying an `orderBy` method satisfies both without knowing which
// table was asked for.
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => {
          const p = Promise.resolve(state.painRows) as Promise<unknown> & {
            orderBy?: (...a: unknown[]) => { limit: (n: number) => Promise<unknown> };
            limit?: (n: number) => Promise<unknown>;
          };
          p.orderBy = () => ({ limit: () => Promise.resolve(state.hookRows) });
          p.limit = () => Promise.resolve([]);
          return p;
        },
      }),
    })),
  },
}));
vi.mock('@/lib/db/schema', () => ({
  brands: {}, scrapedPosts: {}, posts: { brandId: 'brandId', hookText: 'hookText', createdAt: 'createdAt' },
  instagramAccounts: {}, brandPainPoints: { brandId: 'brandId' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), desc: vi.fn() }));
vi.mock('@/lib/image-processing', () => ({ createInstagramImageWithText: vi.fn() }));
vi.mock('@/lib/smart-posts', () => ({ seedFromInsight: vi.fn(), mergePerfectSeed: vi.fn() }));

vi.mock('@/lib/creative/sampling', () => ({ sampleGenome: sampleGenomeFn }));
vi.mock('@/lib/creative/genome-read', () => readMocks);

import { buildDeepProfile } from '@/lib/meta/deep-profile';
import { cerebrasChatCompletion } from '@/lib/cerebras';
import { generateFromSeed } from '@/lib/smart-posts/generate';
import { POST } from '../route';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(): NextRequest {
  return new NextRequest(new URL('http://localhost/api/smart-posts/god-mode'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify({ brandId: 'b1', igUserId: 'ig1' }),
  });
}

function makeProfile(): DeepProfile {
  return {
    igUserId: 'ig1',
    handle: 'testhandle',
    followerCount: 1000,
    sampleSize: 30,
    medians: { reach: 100, views: 200, likes: 10, comments: 1, saves: 1, shares: 1 },
    formatPerformance: [],
    hookPatterns: [],
    captionLengthSweetSpot: { shortMedian: 50, mediumMedian: 100, longMedian: 200, winner: 'long' },
    timing: {
      heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null)),
      bestSlots: [{ day: 'Sunday', hour: 9, medianReach: 200 }],
    },
    topicSignals: { winning: ['#growth'], losing: [] },
  };
}

function ing(dimension: string, value: string, promptFragment: string): SamplableIngredient {
  return { id: `${dimension}:${value}`, dimension: dimension as SamplableIngredient['dimension'], value, promptFragment };
}

const ANGLE = ing('angle', 'loss_aversion', 'Frame the cost of NOT acting rather than the upside of acting.');
const IMAGE_STYLE = ing('image_style', 'stock_photo', 'record-only: selected stock photograph with a text overlay');
const SHAPE_PERSONAL = ing('hook_shape', 'personal', 'Open with a first-person admission or confession.');

function makeGenome(ingredients: SamplableIngredient[]): SampledGenome {
  return {
    ingredients,
    wasWildcard: false,
    noveltyDistance: 0.75,
    noveltyExhausted: false,
    borrowedPriors: ['angle:loss_aversion'],
    temperature: 1,
  };
}

const okOutcome = {
  ok: true as const,
  data: {
    imageDataUrl: 'data:image/jpeg;base64,abc',
    sourceImageUrl: 'https://example.com/img.jpg',
    imageHash: '0000000000000000',
    caption: 'Caption here',
    angle: null,
    hashtags: '#growth',
    hookText: 'Save this',
    seed: { contentType: 'tip' },
    suggestedPostTime: null,
    scheduledAt: null,
    sourceInsightId: null,
    contributions: {},
    candidates: [],
    renderParams: {
      brand: 'affectly' as const,
      hookText: '',
      textPosition: 'center' as const,
      overlayStyle: 'editorial' as const,
      logoUrl: null,
    },
  },
};

function llmOk() {
  return JSON.stringify({
    overrides: { format: 'IMAGE', day: 'Sunday', hour: 9, pattern: 'how to', preset: 'growth' },
    rationale: 'Because the numbers say so.',
  });
}

function sentPrompt(): string {
  return vi.mocked(cerebrasChatCompletion).mock.calls[0][0][1].content;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('god-mode creative genome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CREATIVE_GENOME_ENABLED;
    state.hookRows = [];
    state.painRows = [];
    vi.mocked(buildDeepProfile).mockResolvedValue(makeProfile());
    vi.mocked(cerebrasChatCompletion).mockResolvedValue(llmOk());
    vi.mocked(generateFromSeed).mockResolvedValue(okOutcome);
    readMocks.loadSamplableIngredients.mockResolvedValue([]);
    readMocks.refreshScores.mockResolvedValue([]);
    readMocks.loadRecentGenomeIngredientIds.mockResolvedValue([]);
    readMocks.nextGenomeIndex.mockResolvedValue(1);
  });

  afterEach(() => {
    delete process.env.CREATIVE_GENOME_ENABLED;
  });

  it('flag OFF: samples nothing, leaves the prompt structurally unchanged, adds no response key', async () => {
    sampleGenomeFn.mockReturnValue(makeGenome([ANGLE]));

    const res = await POST(makeReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(sampleGenomeFn).not.toHaveBeenCalled();
    expect(readMocks.loadSamplableIngredients).not.toHaveBeenCalled();
    expect(readMocks.refreshScores).not.toHaveBeenCalled();
    expect(json).not.toHaveProperty('genome');

    const prompt = sentPrompt();
    expect(prompt).not.toContain('CREATIVE DIRECTION FOR THIS POST');
    expect(prompt).not.toContain(ANGLE.promptFragment);
    // Exact joint between the steering element and the capability note. The
    // genome section is concatenated INTO the steering element rather than
    // appended as its own array entry precisely so this spacing cannot drift;
    // an extra element would insert a fourth newline here.
    expect(prompt).toContain(
      'The "pattern" you return MUST follow the hook shape above.\n\n\nIMPORTANT CAPABILITY CONSTRAINT',
    );
  });

  it('flag ON: samples for surface=organic and injects the fragments', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    sampleGenomeFn.mockReturnValue(makeGenome([ANGLE]));

    const res = await POST(makeReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(sampleGenomeFn).toHaveBeenCalledTimes(1);
    expect(sampleGenomeFn.mock.calls[0][0]).toMatchObject({ surface: 'organic', index: 1 });
    expect(readMocks.loadRecentGenomeIngredientIds).toHaveBeenCalledWith('organic', 10);
    expect(readMocks.nextGenomeIndex).toHaveBeenCalledWith('organic');

    const prompt = sentPrompt();
    expect(prompt).toContain('CREATIVE DIRECTION FOR THIS POST');
    expect(prompt).toContain(`- ${ANGLE.promptFragment}`);
    expect(json.genome).toBeDefined();
  });

  it('returns a genome that survives the HMAC JSON hop unchanged', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    const genome = makeGenome([ANGLE, SHAPE_PERSONAL, IMAGE_STYLE]);
    sampleGenomeFn.mockReturnValue(genome);

    const res = await POST(makeReq());
    // res.json() IS the round trip /api/autopilot/run performs on the wire.
    const json = await res.json();

    expect(json.genome).toEqual(genome);
    expect(JSON.parse(JSON.stringify(json.genome))).toEqual(genome);
    // Every field recordGenome persists must arrive, including the falsey ones
    // an over-eager serialiser would drop.
    expect(json.genome.wasWildcard).toBe(false);
    expect(json.genome.noveltyExhausted).toBe(false);
    expect(json.genome.borrowedPriors).toEqual(['angle:loss_aversion']);
    expect(json.genome.temperature).toBe(1);
  });

  it("uses the GENOME's hook shape as the steering target, not pickUnderusedPattern's", async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    sampleGenomeFn.mockReturnValue(makeGenome([ANGLE, SHAPE_PERSONAL]));

    await POST(makeReq());
    const prompt = sentPrompt();

    // With no hook history, pickUnderusedPattern deterministically returns
    // 'question' (first of TARGETABLE_PATTERNS, all counts zero). The genome
    // chose 'personal'. Exactly one of them may reach the prompt.
    expect(prompt).toContain('HOOK SHAPE FOR THIS POST: personal');
    expect(prompt).not.toContain('HOOK SHAPE FOR THIS POST: question');
    // And it is said ONCE — the genome's own hook_shape fragment is suppressed
    // because the steering directive already states it, with overuse context.
    expect(prompt).not.toContain(`- ${SHAPE_PERSONAL.promptFragment}`);
    expect(prompt.match(/HOOK SHAPE FOR THIS POST:/g)).toHaveLength(1);
  });

  it('never injects RECORD_ONLY_DIMENSIONS fragments', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    sampleGenomeFn.mockReturnValue(makeGenome([ANGLE, IMAGE_STYLE]));

    await POST(makeReq());
    const prompt = sentPrompt();

    expect(prompt).toContain(`- ${ANGLE.promptFragment}`);
    expect(prompt).not.toContain(IMAGE_STYLE.promptFragment);
    expect(prompt).not.toContain('record-only');
  });

  it('a genome with ONLY record-only ingredients emits no direction block at all', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    sampleGenomeFn.mockReturnValue(makeGenome([IMAGE_STYLE]));

    await POST(makeReq());

    expect(sentPrompt()).not.toContain('CREATIVE DIRECTION FOR THIS POST');
  });

  it('sampling that throws still generates the post, with no genome in the response', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    readMocks.refreshScores.mockRejectedValue(new Error('scores table is on fire'));

    const res = await POST(makeReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.caption).toBe('Caption here');
    expect(json).not.toHaveProperty('genome');
    expect(generateFromSeed).toHaveBeenCalledTimes(1);
    // And the prompt degrades to exactly the un-genomed one.
    expect(sentPrompt()).not.toContain('CREATIVE DIRECTION FOR THIS POST');
  });

  it('sampleGenome itself throwing does not break generation', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    sampleGenomeFn.mockImplementation(() => {
      throw new Error('sampler exploded');
    });

    const res = await POST(makeReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.caption).toBe('Caption here');
    expect(json).not.toHaveProperty('genome');
  });

  it('an unrecognised hook_shape value falls back to pickUnderusedPattern', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    // The vocabulary is a DB table and can grow; a shape SHAPE_GUIDE has no
    // wording for must not be named as the target.
    sampleGenomeFn.mockReturnValue(
      makeGenome([ing('hook_shape', 'haiku', 'Open with a haiku.')]),
    );

    await POST(makeReq());
    const prompt = sentPrompt();

    expect(prompt).toContain('HOOK SHAPE FOR THIS POST: question');
    expect(prompt).not.toContain('HOOK SHAPE FOR THIS POST: haiku');
    // Unrecognised, so it was not promoted to the target and keeps its own voice.
    expect(prompt).toContain('- Open with a haiku.');
  });
});
