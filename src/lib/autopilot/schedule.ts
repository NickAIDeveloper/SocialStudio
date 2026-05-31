// src/lib/autopilot/schedule.ts

export type Frequency = 'daily' | 'every_other_day' | 'three_per_week' | 'weekly';

export interface ScheduleInput {
  frequency: Frequency;
  lastRunAt: Date | null;
  // Best time slot from brain.formula.bestSlot. dow: 0=Sun..6=Sat. hour: 0-23 LOCAL.
  bestSlot: { dow: number; hour: number } | null;
  // Caller's "now" — usually new Date(). Injected for testability.
  now: Date;
  // Caller's local-tz offset in minutes (default 0 = UTC).
  // The autopilot runs in the brand's user's local time. For v1 we use UTC
  // (offset 0). Surfacing as a parameter so we can extend later.
  tzOffsetMinutes?: number;
}

const MS_PER_DAY = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

// How many days the cadence requires between runs.
function minDaysGap(freq: Frequency): number {
  switch (freq) {
    case 'daily':
      return 1;
    case 'every_other_day':
      return 2;
    case 'three_per_week':
      return 2; // ~Mon, Wed, Fri rhythm — close enough at 2-day gaps
    case 'weekly':
      return 7;
  }
}

// Returns the next time the slot occurs at or after `from`.
// dow: 0-6 (Sunday=0). hour: 0-23.
export function nextSlotAfter(from: Date, dow: number, hour: number): Date {
  const out = new Date(from.getTime());
  out.setUTCHours(hour, 0, 0, 0);
  let delta = (dow - out.getUTCDay() + 7) % 7;
  if (delta === 0 && out.getTime() < from.getTime()) delta = 7;
  out.setUTCDate(out.getUTCDate() + delta);
  return out;
}

// Returns the next time `hour` occurs at or after `from`, IGNORING day-of-week.
// Same day if the hour hasn't passed yet, otherwise the next day. Used by the
// gap-based cadences (daily / every_other_day / three_per_week) where the brain's
// best HOUR matters but its best WEEKDAY does not — pinning those to a weekday
// silently turns "every other day" into "next time that weekday comes round"
// (≈weekly). See pinsToWeekday below.
export function nextHourAfter(from: Date, hour: number): Date {
  const out = new Date(from.getTime());
  out.setUTCHours(hour, 0, 0, 0);
  if (out.getTime() < from.getTime()) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

// Whether a cadence pins posts to a fixed weekday (the brain's best DOW) or just
// spaces them by a day-gap. Only 'weekly' pins to a weekday: posting once a week,
// the specific day is the whole point. Daily / every_other_day / three_per_week
// fire on their day-gap and care only about the best HOUR.
function pinsToWeekday(freq: Frequency): boolean {
  return freq === 'weekly';
}

function startOfUTCDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

// First calendar day (UTC, 00:00) on or after `from` whose weekday is `dow`.
// Returns `from`'s own day when it already matches.
function nextWeekdayStart(from: Date, dow: number): Date {
  const out = startOfUTCDay(from);
  const delta = (dow - out.getUTCDay() + 7) % 7;
  out.setUTCDate(out.getUTCDate() + delta);
  return out;
}

// Next publish time for a freshly generated post: the brain's best DOW+hour for
// weekly, or just the best hour (today/tomorrow) for gap-based cadences. This is
// the single source of truth shared by the cron run (scheduledAt) and the manual
// "Schedule to Buffer" path, so they can never drift apart again.
export function nextPostSlot(
  frequency: Frequency,
  bestSlot: { dow: number; hour: number },
  from: Date
): Date {
  return pinsToWeekday(frequency)
    ? nextSlotAfter(from, bestSlot.dow, bestSlot.hour)
    : nextHourAfter(from, bestSlot.hour);
}

// When the GENERATOR may next run — a day-granular threshold at 00:00 UTC, NOT a
// precise minute. The generation cron fires once a day (well before any posting
// hour), so nextRunAt only needs to name the right *day*; isDueNow then trips on
// that day's tick. We deliberately do NOT bake the brain's best hour in here:
// doing so pushed isDueNow past the daily cron and silently stretched
// 'every other day' toward every third day. The best hour is applied to the
// Buffer publish time (scheduledAt in the run route) via nextPostSlot instead.
export function computeNextRunAt(input: ScheduleInput): Date {
  const gap = minDaysGap(input.frequency);
  const earliest = input.lastRunAt
    ? new Date(input.lastRunAt.getTime() + gap * MS_PER_DAY)
    : new Date(input.now.getTime() + MS_PER_DAY); // no history yet → wait a day
  const base = new Date(Math.max(earliest.getTime(), input.now.getTime()));
  if (input.frequency === 'weekly' && input.bestSlot) {
    // Once a week: pin to the brain's best weekday (the day is the whole point).
    return nextWeekdayStart(base, input.bestSlot.dow);
  }
  // Gap cadences: the day-gap is all that decides *when to generate*.
  return startOfUTCDay(base);
}

export function isDueNow(nextRunAt: Date | null, now: Date): boolean {
  if (!nextRunAt) return true; // never run before — fire on first cron tick
  return nextRunAt.getTime() <= now.getTime();
}
