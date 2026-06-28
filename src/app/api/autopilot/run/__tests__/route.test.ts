import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Fix 2 regression tests: every early-return failure path must (a) record a
// descriptive lastError and (b) ADVANCE nextRunAt one cadence — never leave it
// frozen — while leaving lastRunAt untouched (it marks the last SUCCESS).
//
// The real @/lib/autopilot/schedule is used (not mocked) so we verify actual
// nextRunAt computation, not a stub.
// ---------------------------------------------------------------------------
const {
  state,
  verifyBrainSignatureFn,
  readBrandBrainFn,
  dbSelectFn,
  dbUpdateFn,
  updateSetFn,
  updateWhereFn,
} = vi.hoisted(() => {
  const updateWhereFn = vi.fn().mockResolvedValue(undefined);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const dbUpdateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  const state = {
    brandRows: [] as Array<Record<string, unknown>>,
    settingsRows: [] as Array<Record<string, unknown>>,
    igRows: [] as Array<Record<string, unknown>>,
    selectCallCount: 0,
  };

  const dbSelectFn = vi.fn().mockImplementation(() => {
    state.selectCallCount++;
    const idx = state.selectCallCount;
    return {
      from: (_t: unknown) => ({
        where: (_c: unknown) => {
          if (idx === 1) return Promise.resolve(state.brandRows); // brand (no .limit)
          if (idx === 2) return Promise.resolve(state.settingsRows); // settings (no .limit)
          return { limit: (_n: unknown) => Promise.resolve(state.igRows) }; // igAccount
        },
      }),
    };
  });

  const verifyBrainSignatureFn = vi.fn().mockResolvedValue(true);
  const readBrandBrainFn = vi.fn().mockResolvedValue(null);

  return {
    state,
    verifyBrainSignatureFn,
    readBrandBrainFn,
    dbSelectFn,
    dbUpdateFn,
    updateSetFn,
    updateWhereFn,
  };
});

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/brain/auth', () => ({ verifyBrainSignature: verifyBrainSignatureFn }));
vi.mock('@/lib/brain/consume', () => ({ readBrandBrain: readBrandBrainFn }));
vi.mock('@/lib/db', () => ({
  db: { select: dbSelectFn, update: dbUpdateFn, insert: vi.fn() },
}));
vi.mock('@/lib/db/schema', () => ({
  brands: { __t: 'brands', id: 'id', userId: 'userId' },
  autopilotSettings: { __t: 'autopilotSettings', brandId: 'brandId' },
  posts: { __t: 'posts', brandId: 'brandId', sourceImageUrl: 'sourceImageUrl', processedImageUrl: 'processedImageUrl' },
  linkedAccounts: { __t: 'linkedAccounts', userId: 'userId', provider: 'provider' },
  instagramAccounts: { __t: 'instagramAccounts', userId: 'userId', igUserId: 'igUserId' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));
// Side-effect-free stubs for modules only reached on the success path.
vi.mock('@/lib/buffer', () => ({
  createPost: vi.fn(),
  getOrganizationsAndChannels: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn() }));
vi.mock('@/lib/github-images', () => ({ uploadImageToGitHub: vi.fn() }));

import { POST } from '../route';

const BRAND_ID = '11111111-1111-1111-1111-111111111111';

function makeReq(): NextRequest {
  return new NextRequest(
    new URL(`http://localhost/api/autopilot/run?brandId=${BRAND_ID}`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-brain-signature': 'sig' },
      body: '{}',
    },
  );
}

function lastSetPayload(): Record<string, unknown> {
  const calls = updateSetFn.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('POST /api/autopilot/run — failure-path visibility (Fix 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.selectCallCount = 0;
    state.brandRows = [{ id: BRAND_ID, userId: 'user-1' }];
    // enabled + due (nextRunAt in the past), gap cadence.
    state.settingsRows = [
      {
        brandId: BRAND_ID,
        enabled: true,
        mode: 'auto',
        frequency: 'every_other_day',
        nextRunAt: new Date(Date.now() - 2 * 86_400_000),
        lastRunAt: new Date(Date.now() - 4 * 86_400_000),
        totalGenerated: 5,
      },
    ];
    state.igRows = [];

    updateWhereFn.mockResolvedValue(undefined);
    updateSetFn.mockReturnValue({ where: updateWhereFn });
    dbUpdateFn.mockReturnValue({ set: updateSetFn });
    verifyBrainSignatureFn.mockResolvedValue(true);
    readBrandBrainFn.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no_ig_account: sets descriptive lastError AND advances nextRunAt, leaving lastRunAt untouched', async () => {
    state.igRows = []; // no connected IG account

    const res = await POST(makeReq());
    const json = await res.json();

    expect(json.status).toBe('failed');
    expect(json.reason).toBe('no_ig_account');
    // nextRunAt advanced (returned + in the future, not the frozen past value).
    expect(typeof json.nextRunAt).toBe('string');
    expect(new Date(json.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    const payload = lastSetPayload();
    expect(payload.lastError).toBe('no_ig_account');
    expect(payload.nextRunAt).toBeInstanceOf(Date);
    expect((payload.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
    // lastRunAt must NOT be overwritten on a failure (still = last success).
    expect(payload).not.toHaveProperty('lastRunAt');
  });

  it('god_mode non-2xx: persists verbose detail but returns a short reason code, and advances nextRunAt', async () => {
    state.igRows = [{ igUserId: 'ig-123' }];
    process.env.BRAIN_CRON_SECRET = 'test-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'upstream exploded',
      }),
    );

    const res = await POST(makeReq());
    const json = await res.json();

    expect(json.status).toBe('failed');
    expect(json.reason).toBe('god_mode_502');
    expect(new Date(json.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    const payload = lastSetPayload();
    // Verbose detail stored for debugging; short code returned to caller.
    expect(payload.lastError).toContain('god_mode_502');
    expect(payload.lastError).toContain('upstream exploded');
    expect(payload.nextRunAt).toBeInstanceOf(Date);
    expect(payload).not.toHaveProperty('lastRunAt');
  });
});
