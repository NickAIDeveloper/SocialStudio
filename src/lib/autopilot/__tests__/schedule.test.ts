// src/lib/autopilot/__tests__/schedule.test.ts
import { describe, it, expect } from 'vitest';
import { computeNextRunAt, isDueNow, nextSlotAfter } from '../schedule';

describe('nextSlotAfter', () => {
  it('returns same day at slot hour when slot is in future', () => {
    // 2026-05-10 is Sunday (dow=0). 09:00 → next slot Sun 19:00 = same day.
    const from = new Date('2026-05-10T09:00:00Z');
    const next = nextSlotAfter(from, 0, 19);
    expect(next.toISOString()).toBe('2026-05-10T19:00:00.000Z');
  });

  it('rolls forward 7 days when slot is the same dow but already passed today', () => {
    // Sun 20:00 → next Sun 19:00 → 7 days later
    const from = new Date('2026-05-10T20:00:00Z');
    const next = nextSlotAfter(from, 0, 19);
    expect(next.toISOString()).toBe('2026-05-17T19:00:00.000Z');
  });

  it('rolls to the next occurrence of a different dow', () => {
    // Sun → Tue (dow=2) at 19:00
    const from = new Date('2026-05-10T09:00:00Z');
    const next = nextSlotAfter(from, 2, 19);
    expect(next.toISOString()).toBe('2026-05-12T19:00:00.000Z');
  });
});

describe('computeNextRunAt', () => {
  it('respects min gap for daily frequency', () => {
    const lastRunAt = new Date('2026-05-10T19:00:00Z');
    const now = new Date('2026-05-10T20:00:00Z');
    const next = computeNextRunAt({
      frequency: 'daily',
      lastRunAt,
      bestSlot: { dow: 1, hour: 19 }, // Mon 19:00
      now,
    });
    // Earliest = lastRun + 1 day = 2026-05-11T19:00. Mon 19:00 same day.
    expect(next.toISOString()).toBe('2026-05-11T19:00:00.000Z');
  });

  it('weekly frequency forces a 7-day gap minimum', () => {
    const lastRunAt = new Date('2026-05-10T19:00:00Z');
    const now = new Date('2026-05-12T10:00:00Z');
    const next = computeNextRunAt({
      frequency: 'weekly',
      lastRunAt,
      bestSlot: { dow: 0, hour: 19 }, // Sun 19:00
      now,
    });
    // Earliest = lastRun + 7d = 2026-05-17T19:00 (Sun). Slot matches.
    expect(next.toISOString()).toBe('2026-05-17T19:00:00.000Z');
  });

  it('falls back to now+1day when no bestSlot', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const next = computeNextRunAt({
      frequency: 'daily',
      lastRunAt: null,
      bestSlot: null,
      now,
    });
    expect(next.getTime()).toBeGreaterThanOrEqual(now.getTime() + 86_400_000 - 1000);
  });
});

describe('isDueNow', () => {
  it('returns true when nextRunAt is null (never run)', () => {
    expect(isDueNow(null, new Date())).toBe(true);
  });

  it('returns true when now is past nextRunAt', () => {
    const now = new Date('2026-05-10T20:00:00Z');
    expect(isDueNow(new Date('2026-05-10T19:00:00Z'), now)).toBe(true);
  });

  it('returns false when nextRunAt is in the future', () => {
    const now = new Date('2026-05-10T18:00:00Z');
    expect(isDueNow(new Date('2026-05-10T19:00:00Z'), now)).toBe(false);
  });
});
