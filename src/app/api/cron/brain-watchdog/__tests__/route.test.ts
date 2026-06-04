import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { state, dbSelectFn, orderByFn, limitFn, sendAlertEmailFn } = vi.hoisted(() => {
  const state = { latestRows: [] as Array<{ createdAt: Date | null }> };
  const limitFn = vi.fn().mockImplementation(() => Promise.resolve(state.latestRows));
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
  const dbSelectFn = vi.fn().mockReturnValue({ from: fromFn });
  const sendAlertEmailFn = vi.fn().mockResolvedValue({ sent: true, to: 'ops@example.com' });
  return { state, dbSelectFn, orderByFn, limitFn, sendAlertEmailFn };
});

vi.mock('@/lib/db', () => ({ db: { select: dbSelectFn } }));
vi.mock('@/lib/db/schema', () => ({
  brainSnapshots: { __t: 'brainSnapshots', createdAt: 'createdAt' },
}));
vi.mock('drizzle-orm', () => ({ desc: vi.fn() }));
vi.mock('@/lib/alerts/email', () => ({ sendAlertEmail: sendAlertEmailFn }));

import { GET } from '../route';

function makeReq(auth?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new NextRequest(new URL('http://localhost/api/cron/brain-watchdog'), {
    method: 'GET',
    headers,
  });
}

describe('GET /api/cron/brain-watchdog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.latestRows = [];
    limitFn.mockImplementation(() => Promise.resolve(state.latestRows));
    orderByFn.mockReturnValue({ limit: limitFn });
    sendAlertEmailFn.mockResolvedValue({ sent: true, to: 'ops@example.com' });
    delete process.env.CRON_SECRET;
    delete process.env.CRON_MAX_AGE_HOURS;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.CRON_MAX_AGE_HOURS;
  });

  it('401s when CRON_SECRET is set and the bearer token does not match', async () => {
    process.env.CRON_SECRET = 'topsecret';
    const res = await GET(makeReq('Bearer wrong'));
    expect(res.status).toBe(401);
    expect(sendAlertEmailFn).not.toHaveBeenCalled();
  });

  it('passes auth and reports ok when the newest snapshot is fresh (no alert)', async () => {
    process.env.CRON_SECRET = 'topsecret';
    state.latestRows = [{ createdAt: new Date(Date.now() - 2 * 3_600_000) }]; // 2h old
    const res = await GET(makeReq('Bearer topsecret'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(sendAlertEmailFn).not.toHaveBeenCalled();
  });

  it('alerts and returns 503 when the newest snapshot is stale', async () => {
    state.latestRows = [{ createdAt: new Date(Date.now() - 40 * 3_600_000) }]; // 40h old
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe('stale');
    expect(sendAlertEmailFn).toHaveBeenCalledTimes(1);
    expect(json.alert.sent).toBe(true);
  });

  it('alerts when there are no snapshots at all (cron never ran)', async () => {
    state.latestRows = [];
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe('stale');
    expect(json.lastBrainRunAt).toBeNull();
    expect(sendAlertEmailFn).toHaveBeenCalledTimes(1);
  });

  it('honors CRON_MAX_AGE_HOURS override (tighter threshold flags a younger snapshot)', async () => {
    process.env.CRON_MAX_AGE_HOURS = '1';
    state.latestRows = [{ createdAt: new Date(Date.now() - 2 * 3_600_000) }]; // 2h old > 1h
    const res = await GET(makeReq());
    expect(res.status).toBe(503);
    expect(sendAlertEmailFn).toHaveBeenCalledTimes(1);
  });
});
