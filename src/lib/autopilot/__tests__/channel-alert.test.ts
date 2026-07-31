import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state, dbSelectFn, dbUpdateFn, updateSetFn, updateWhereFn } = vi.hoisted(() => {
  const updateWhereFn = vi.fn().mockResolvedValue(undefined);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  const dbUpdateFn = vi.fn().mockReturnValue({ set: updateSetFn });

  const state = { rows: [] as Array<Record<string, unknown>> };

  const dbSelectFn = vi.fn().mockImplementation(() => ({
    from: () => ({ where: () => Promise.resolve(state.rows) }),
  }));

  return { state, dbSelectFn, dbUpdateFn, updateSetFn, updateWhereFn };
});

vi.mock('@/lib/db', () => ({ db: { select: dbSelectFn, update: dbUpdateFn } }));
vi.mock('@/lib/db/schema', () => ({
  autopilotSettings: { brandId: 'brandId', channelAlertAt: 'channelAlertAt', lastError: 'lastError' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

import { recordChannelDisconnected, clearChannelAlert } from '../channel-alert';

const BRAND = 'brand-1';
const REASON = 'buffer_channel_disconnected: Buffer has lost authorization to post to pacebrain.app.';

describe('recordChannelDisconnected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rows = [];
    updateWhereFn.mockResolvedValue(undefined);
    updateSetFn.mockReturnValue({ where: updateWhereFn });
    dbUpdateFn.mockReturnValue({ set: updateSetFn });
  });

  it('stamps the latch and records the reason on first detection', async () => {
    state.rows = [{ channelAlertAt: null }];

    const result = await recordChannelDisconnected(BRAND, REASON);

    expect(result.firstDetection).toBe(true);
    expect(result.firstSeenAt).toBeInstanceOf(Date);
    expect(updateSetFn.mock.calls[0][0]).toMatchObject({
      channelAlertAt: expect.any(Date),
      lastError: REASON,
    });
  });

  it('keeps the original first-seen time on later runs of the same outage', async () => {
    const firstSeen = new Date('2026-07-26T02:00:00Z');
    state.rows = [{ channelAlertAt: firstSeen }];

    const result = await recordChannelDisconnected(BRAND, REASON);

    // Outage AGE is the point — moving this timestamp would erase it.
    expect(result).toEqual({ firstDetection: false, firstSeenAt: firstSeen });
    expect(updateSetFn.mock.calls[0][0]).not.toHaveProperty('channelAlertAt');
    expect(updateSetFn.mock.calls[0][0]).toMatchObject({ lastError: REASON });
  });

  it('never throws when the database is unavailable', async () => {
    dbSelectFn.mockImplementationOnce(() => { throw new Error('connection refused'); });
    await expect(recordChannelDisconnected(BRAND, REASON)).resolves.toEqual({
      firstDetection: false,
      firstSeenAt: null,
    });
  });
});

describe('clearChannelAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateWhereFn.mockResolvedValue(undefined);
    updateSetFn.mockReturnValue({ where: updateWhereFn });
    dbUpdateFn.mockReturnValue({ set: updateSetFn });
  });

  it('re-arms the latch once the channel works again', async () => {
    state.rows = [{ channelAlertAt: new Date('2026-07-26T02:00:00Z') }];
    await clearChannelAlert(BRAND);
    expect(updateSetFn.mock.calls[0][0]).toMatchObject({ channelAlertAt: null });
  });

  it('does not write on a healthy run when the latch is already clear', async () => {
    state.rows = [{ channelAlertAt: null }];
    await clearChannelAlert(BRAND);
    expect(dbUpdateFn).not.toHaveBeenCalled();
  });
});
