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
  it('every_other_day that has stalled becomes due today (regression: was 3 June)', () => {
    // Exactly the production bug: last ran 26 May, brain best slot = Wed (dow 3),
    // now is 31 May. Old code returned 3 June (next Wednesday) and the brand
    // stayed stuck. nextRunAt must be a *day* threshold (00:00 UTC) so the next
    // daily cron tick fires it — here it's overdue → today at 00:00.
    const next = computeNextRunAt({
      frequency: 'every_other_day',
      lastRunAt: new Date('2026-05-26T10:58:00Z'),
      bestSlot: { dow: 3, hour: 21 },
      now: new Date('2026-05-31T11:00:00Z'),
    });
    expect(next.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    expect(next.getUTCDate()).not.toBe(3); // never the brain's weekday a week out
    expect(isDueNow(next, new Date('2026-06-01T03:00:00Z'))).toBe(true); // next cron fires it
  });

  it('every_other_day respects the 2-day gap from a recent run (day-granular)', () => {
    // Ran today 08:00. Earliest = +2 days → the trigger day is 2 June at 00:00,
    // so the 2 June 03:00 cron is the one that fires it. The best HOUR is not in
    // nextRunAt (it belongs to the Buffer publish time).
    const next = computeNextRunAt({
      frequency: 'every_other_day',
      lastRunAt: new Date('2026-05-31T08:00:00Z'),
      bestSlot: { dow: 3, hour: 21 },
      now: new Date('2026-05-31T08:05:00Z'),
    });
    expect(next.toISOString()).toBe('2026-06-02T00:00:00.000Z');
  });

  it('daily lands on the next day at 00:00 (cron-catchable)', () => {
    const next = computeNextRunAt({
      frequency: 'daily',
      lastRunAt: new Date('2026-05-10T19:00:00Z'),
      bestSlot: { dow: 1, hour: 19 },
      now: new Date('2026-05-10T20:00:00Z'),
    });
    // Earliest = lastRun + 1 day = 2026-05-11T19:00 → floored to the day.
    expect(next.toISOString()).toBe('2026-05-11T00:00:00.000Z');
  });

  it('weekly forces a 7-day gap and pins to the brain best weekday (00:00)', () => {
    const next = computeNextRunAt({
      frequency: 'weekly',
      lastRunAt: new Date('2026-05-10T19:00:00Z'), // Sunday
      bestSlot: { dow: 0, hour: 19 }, // Sun
      now: new Date('2026-05-12T10:00:00Z'),
    });
    // Earliest = lastRun + 7d = 2026-05-17 (Sun). Weekday matches → that day 00:00.
    expect(next.toISOString()).toBe('2026-05-17T00:00:00.000Z');
  });

  it('weekly rolls to the next best weekday when the gap day is a different dow', () => {
    const next = computeNextRunAt({
      frequency: 'weekly',
      lastRunAt: new Date('2026-05-10T19:00:00Z'), // Sun → +7 = Sun 17 May
      bestSlot: { dow: 3, hour: 19 }, // wants Wednesday
      now: new Date('2026-05-12T10:00:00Z'),
    });
    // +7 lands Sun 17 May; next Wednesday is 20 May.
    expect(next.toISOString()).toBe('2026-05-20T00:00:00.000Z');
  });

  it('defers ~a day when there is no run history', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const next = computeNextRunAt({
      frequency: 'daily',
      lastRunAt: null,
      bestSlot: null,
      now,
    });
    // now+1day = 11 May 12:00 → floored to 11 May 00:00, still in the future.
    expect(next.toISOString()).toBe('2026-05-11T00:00:00.000Z');
    expect(next.getTime()).toBeGreaterThan(now.getTime());
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
