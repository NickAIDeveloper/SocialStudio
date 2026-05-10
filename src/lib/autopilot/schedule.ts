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

export function computeNextRunAt(input: ScheduleInput): Date {
  const gap = minDaysGap(input.frequency);
  const earliest = input.lastRunAt
    ? new Date(input.lastRunAt.getTime() + gap * MS_PER_DAY)
    : input.now;
  if (!input.bestSlot) {
    // No slot yet — defer one day.
    return new Date(Math.max(earliest.getTime(), input.now.getTime() + MS_PER_DAY));
  }
  return nextSlotAfter(
    new Date(Math.max(earliest.getTime(), input.now.getTime())),
    input.bestSlot.dow,
    input.bestSlot.hour
  );
}

export function isDueNow(nextRunAt: Date | null, now: Date): boolean {
  if (!nextRunAt) return true; // never run before — fire on first cron tick
  return nextRunAt.getTime() <= now.getTime();
}
