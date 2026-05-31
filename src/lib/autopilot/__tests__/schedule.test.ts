// src/lib/autopilot/__tests__/schedule.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeNextRunAt,
  isDueNow,
  nextSlotAfter,
  nextHourAfter,
  nextPostSlot,
} from '../schedule';

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

describe('nextHourAfter', () => {
  it('returns same day at hour when the hour is still ahead', () => {
    const from = new Date('2026-05-31T09:00:00Z'); // Sunday
    expect(nextHourAfter(from, 21).toISOString()).toBe('2026-05-31T21:00:00.000Z');
  });

  it('rolls to the next day when the hour has already passed', () => {
    const from = new Date('2026-05-31T22:00:00Z');
    expect(nextHourAfter(from, 21).toISOString()).toBe('2026-06-01T21:00:00.000Z');
  });

  it('ignores day-of-week entirely', () => {
    // Five different start days all land on "today/tomorrow at hour", never a
    // fixed weekday.
    const next = nextHourAfter(new Date('2026-05-27T08:00:00Z'), 19); // Wed
    expect(next.toISOString()).toBe('2026-05-27T19:00:00.000Z');
  });
});

describe('nextPostSlot (frequency-aware)', () => {
  const bestSlot = { dow: 3, hour: 21 }; // brain says Wednesday 21:00

  it('every_other_day uses the best HOUR, NOT the best weekday', () => {
    // The reported bug: from Sunday, weekday-snap pushed the next post to the
    // following Wednesday. Hour-only keeps it same-day.
    const from = new Date('2026-05-31T09:00:00Z'); // Sunday
    const next = nextPostSlot('every_other_day', bestSlot, from);
    expect(next.toISOString()).toBe('2026-05-31T21:00:00.000Z'); // today, not 3 June
  });

  it('daily uses the best hour', () => {
    const from = new Date('2026-05-31T22:00:00Z');
    expect(nextPostSlot('daily', bestSlot, from).toISOString()).toBe(
      '2026-06-01T21:00:00.000Z',
    );
  });

  it('three_per_week uses the best hour', () => {
    const from = new Date('2026-05-31T09:00:00Z');
    expect(nextPostSlot('three_per_week', bestSlot, from).toISOString()).toBe(
      '2026-05-31T21:00:00.000Z',
    );
  });

  it('weekly DOES pin to the brain best weekday', () => {
    const from = new Date('2026-05-31T09:00:00Z'); // Sunday → next Wed
    expect(nextPostSlot('weekly', bestSlot, from).toISOString()).toBe(
      '2026-06-03T21:00:00.000Z',
    );
  });
});

describe('computeNextRunAt', () => {
  it('every_other_day fires ~2 days out at the best hour, not the best weekday (regression)', () => {
    // Exactly the production bug: last ran 26 May, brain best slot = Wed 21:00,
    // now is 31 May. Old code returned 3 June (next Wednesday). It must instead
    // fire today/tonight (overdue) at 21:00 — never snap a week out.
    const next = computeNextRunAt({
      frequency: 'every_other_day',
      lastRunAt: new Date('2026-05-26T10:58:00Z'),
      bestSlot: { dow: 3, hour: 21 },
      now: new Date('2026-05-31T11:00:00Z'),
    });
    expect(next.toISOString()).toBe('2026-05-31T21:00:00.000Z');
    // And critically it is NOT 3 June.
    expect(next.getUTCDate()).not.toBe(3);
  });

  it('every_other_day respects the 2-day gap from a recent run', () => {
    // Ran today 08:00, best hour 21:00. Earliest = +2 days. Lands 2 days out at 21:00.
    const next = computeNextRunAt({
      frequency: 'every_other_day',
      lastRunAt: new Date('2026-05-31T08:00:00Z'),
      bestSlot: { dow: 3, hour: 21 },
      now: new Date('2026-05-31T08:05:00Z'),
    });
    expect(next.toISOString()).toBe('2026-06-02T21:00:00.000Z');
  });

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
