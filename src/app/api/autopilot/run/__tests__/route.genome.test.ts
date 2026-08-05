// Creative-genome recording on the ORGANIC (autopilot) rail.
//
// The single most important assertion here is the subjectId one. genome-read's
// loadObservations('organic') resolves outcomes with
// eq(postAnalytics.postId, g.subjectId), so recording ANY other identifier
// writes a row that can never be joined to reach — the loop would look wired
// and learn nothing, forever. The ads side made exactly this mistake with
// Meta's ad id, so the test below asserts not only "is a uuid" but "is not any
// of the other ids in scope".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SampledGenome } from '@/lib/creative/sampling';

const {
  state,
  dbSelectFn,
  dbUpdateFn,
  updateSetFn,
  insertValuesFn,
  dbInsertFn,
  recordGenomeFn,
  recordCreativeGenerationFn,
} = vi.hoisted(() => {
  const state = {
    brandRows: [] as Array<Record<string, unknown>>,
    settingsRows: [] as Array<Record<string, unknown>>,
    igRows: [] as Array<Record<string, unknown>>,
    insertedId: '' as string,
    selectCallCount: 0,
  };

  const updateWhereFn = vi.fn().mockResolvedValue(undefined);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const dbUpdateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  const insertReturningFn = vi.fn(() => Promise.resolve([{ id: state.insertedId }]));
  const insertValuesFn = vi.fn(() => ({ returning: insertReturningFn }));
  const dbInsertFn = vi.fn(() => ({ values: insertValuesFn }));

  const dbSelectFn = vi.fn().mockImplementation(() => {
    state.selectCallCount++;
    const idx = state.selectCallCount;
    return {
      from: () => ({
        where: () => {
          if (idx === 1) return Promise.resolve(state.brandRows);
          if (idx === 2) return Promise.resolve(state.settingsRows);
          return { limit: () => Promise.resolve(state.igRows) };
        },
      }),
    };
  });

  return {
    state,
    dbSelectFn,
    dbUpdateFn,
    updateSetFn,
    insertValuesFn,
    dbInsertFn,
    recordGenomeFn: vi.fn().mockResolvedValue('genome-row-1'),
    recordCreativeGenerationFn: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/brain/auth', () => ({ verifyBrainSignature: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/brain/consume', () => ({ readBrandBrain: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/autopilot/reconcile', () => ({
  reconcileAutopilotStatuses: vi.fn().mockResolvedValue({ checked: 0, published: 0, failed: 0 }),
}));
vi.mock('@/lib/db', () => ({
  db: { select: dbSelectFn, update: dbUpdateFn, insert: dbInsertFn },
}));
vi.mock('@/lib/db/schema', () => ({
  brands: { __t: 'brands' }, autopilotSettings: { __t: 'autopilotSettings' },
  posts: { __t: 'posts', id: 'id' }, linkedAccounts: { __t: 'linkedAccounts' },
  instagramAccounts: { __t: 'instagramAccounts' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock('@/lib/cerebras', () => ({ cerebrasChatCompletion: vi.fn() }));
vi.mock('@/lib/brain/grade', () => ({
  runGrade: vi.fn().mockResolvedValue(null),
  shouldHoldForQuality: vi.fn().mockReturnValue(false),
  keepBetterDraft: vi.fn((_prev: unknown, cur: unknown) => cur),
  shouldStopGenerating: vi.fn().mockReturnValue(true),
}));
vi.mock('@/lib/brain/record-generation', () => ({
  recordCreativeGeneration: recordCreativeGenerationFn,
}));
vi.mock('@/lib/creative/genome-record', () => ({ recordGenome: recordGenomeFn }));
vi.mock('@/lib/buffer', () => ({ createPost: vi.fn() }));
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn() }));
vi.mock('@/lib/github-images', () => ({ uploadImageToGitHub: vi.fn() }));
vi.mock('@/lib/autopilot/push-to-buffer', () => ({ pushScheduledPost: vi.fn() }));
vi.mock('@/lib/autopilot/buffer-image', () => ({ ensureInstagramReadyImageUrl: vi.fn() }));
vi.mock('@/lib/autopilot/channel-alert', () => ({
  recordChannelDisconnected: vi.fn(), clearChannelAlert: vi.fn(),
}));

import { POST } from '../route';

const BRAND_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const IG_USER_ID = '17841400000000000';
const POST_ID = '33333333-3333-3333-3333-333333333333';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENOME: SampledGenome = {
  ingredients: [
    { id: 'angle:loss_aversion', dimension: 'angle', value: 'loss_aversion', promptFragment: 'Frame the cost of NOT acting.' },
    { id: 'hook_shape:personal', dimension: 'hook_shape', value: 'personal', promptFragment: 'Open with a confession.' },
  ],
  wasWildcard: false,
  noveltyDistance: 0.8,
  noveltyExhausted: false,
  borrowedPriors: [],
  temperature: 1,
};

function makeReq(): NextRequest {
  return new NextRequest(
    new URL(`http://localhost/api/autopilot/run?brandId=${BRAND_ID}`),
    { method: 'POST', headers: { 'content-type': 'application/json', 'x-brain-signature': 'sig' }, body: '{}' },
  );
}

// A god-mode response with no image URLs at all, which keeps the run on the
// shortest path to the insert: no GitHub upload, no dedup query, no Buffer.
function godResponse(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      caption: 'A caption that exists.',
      hashtags: '#a',
      hookText: 'A hook that exists.',
      angle: null,
      ...extra,
    }),
    text: async () => '',
  };
}

describe('POST /api/autopilot/run — creative genome recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CREATIVE_GENOME_ENABLED;
    process.env.BRAIN_CRON_SECRET = 'test-secret';
    state.selectCallCount = 0;
    state.brandRows = [{ id: BRAND_ID, userId: USER_ID }];
    state.settingsRows = [{
      brandId: BRAND_ID,
      enabled: true,
      mode: 'auto',
      frequency: 'every_other_day',
      nextRunAt: new Date(Date.now() - 2 * 86_400_000),
      lastRunAt: new Date(Date.now() - 4 * 86_400_000),
      totalGenerated: 5,
    }];
    state.igRows = [{ igUserId: IG_USER_ID }];
    state.insertedId = POST_ID;
    recordGenomeFn.mockResolvedValue('genome-row-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CREATIVE_GENOME_ENABLED;
  });

  it('flag OFF: does not record, even when god-mode returned a genome', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(godResponse({ genome: GENOME })));

    const res = await POST(makeReq());
    const json = await res.json();

    expect(json.status).toBe('ok');
    expect(json.postId).toBe(POST_ID);
    expect(recordGenomeFn).not.toHaveBeenCalled();
    // The rest of the run is untouched.
    expect(recordCreativeGenerationFn).toHaveBeenCalledTimes(1);
  });

  it('flag ON but no genome in the payload: does not record', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(godResponse()));

    const res = await POST(makeReq());

    expect((await res.json()).status).toBe('ok');
    expect(recordGenomeFn).not.toHaveBeenCalled();
  });

  it('flag ON with a genome: records post/organic against the INSERTED post uuid', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(godResponse({ genome: GENOME })));

    const res = await POST(makeReq());
    const json = await res.json();

    expect(json.status).toBe('ok');
    expect(recordGenomeFn).toHaveBeenCalledTimes(1);
    const arg = recordGenomeFn.mock.calls[0][0] as Record<string, unknown>;

    expect(arg.subjectType).toBe('post');
    expect(arg.surface).toBe('organic');
    expect(arg.brandId).toBe(BRAND_ID);
    expect(arg.genome).toEqual(GENOME);

    // The load-bearing assertion: subjectId is the internal posts.id uuid that
    // postAnalytics.postId joins to — and demonstrably NOT any other id here.
    expect(arg.subjectId).toBe(POST_ID);
    expect(arg.subjectId).toMatch(UUID_RE);
    expect(arg.subjectId).toBe(json.postId);
    expect(arg.subjectId).not.toBe(BRAND_ID);
    expect(arg.subjectId).not.toBe(USER_ID);
    expect(arg.subjectId).not.toBe(IG_USER_ID);
    expect(arg.subjectId).not.toBe(json.bufferPostId);
  });

  it('tracks the actual inserted row rather than a captured constant', async () => {
    // Same test as above but with a different uuid coming back from the insert,
    // so a hardcoded or stale id cannot pass.
    const OTHER_ID = '44444444-4444-4444-4444-444444444444';
    state.insertedId = OTHER_ID;
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(godResponse({ genome: GENOME })));

    await POST(makeReq());

    expect((recordGenomeFn.mock.calls[0][0] as { subjectId: string }).subjectId).toBe(OTHER_ID);
  });

  it('recordGenome throwing does not fail the run', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    // recordGenome swallows its own errors in production, so this simulates the
    // layer it cannot catch: the dynamic import or an unexpected throw.
    recordGenomeFn.mockRejectedValue(new Error('genome table is on fire'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(godResponse({ genome: GENOME })));

    const res = await POST(makeReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.postId).toBe(POST_ID);
    // The post is still scheduled/persisted and the run still advanced its
    // schedule — a lost data point cost nothing.
    const setPayload = updateSetFn.mock.calls[updateSetFn.mock.calls.length - 1][0] as Record<string, unknown>;
    expect(setPayload.totalGenerated).toBe(6);
    expect(typeof json.nextRunAt).toBe('string');
  });

  it('records AFTER the insert, so a genome never exists without its post', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    const order: string[] = [];
    insertValuesFn.mockImplementationOnce(() => {
      order.push('insert');
      return { returning: vi.fn(() => Promise.resolve([{ id: POST_ID }])) };
    });
    recordGenomeFn.mockImplementationOnce(async () => {
      order.push('recordGenome');
      return 'genome-row-1';
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(godResponse({ genome: GENOME })));

    await POST(makeReq());

    expect(order).toEqual(['insert', 'recordGenome']);
  });
});
