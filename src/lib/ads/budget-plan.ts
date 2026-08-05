// "Run it for N days at X a day" — the way a person actually thinks about ad
// spend, rather than two date pickers and a per-day figure you have to
// multiply in your head.
//
// Meta's ad sets take a daily budget plus a start and end time, so days are a
// derived view over the dates rather than a stored field. All arithmetic is
// inclusive of both the first and last day, which is how Meta bills.
//
// Pure, no I/O.

const DAY_MS = 86_400_000;

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  CAD: 'CA$',
  AUD: 'A$',
};

/** Midnight UTC for a date, so the time of day cannot shift the day count. */
function startOfDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Days the ad will run, counting both the first and last day. Returns 0 when
 * the dates are missing, unparseable, or the wrong way round.
 */
export function runDays(startDate: string, endDate: string): number {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  if (start === null || end === null) return 0;
  const days = Math.round((end - start) / DAY_MS) + 1;
  return days > 0 ? days : 0;
}

/** The end date that produces exactly `days` of running from `startDate`. */
export function endDateForDays(startDate: string, days: number): string {
  const start = startOfDay(startDate) ?? startOfDay(new Date().toISOString())!;
  const safeDays = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  return new Date(start + (safeDays - 1) * DAY_MS).toISOString();
}

export function totalSpendMinor(dailyBudgetMinor: number, days: number): number {
  const total = dailyBudgetMinor * days;
  return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
}

export function formatMoney(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${amount}` : `${currency} ${amount}`;
}

function formatDay(iso: string, withYear: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/**
 * The one line that answers "what is this going to cost me?" — the question
 * the builder previously left the user to work out themselves.
 */
export function describeRun(opts: {
  startDate: string;
  endDate: string;
  dailyBudgetMinor: number;
  currency: string;
}): string {
  const days = runDays(opts.startDate, opts.endDate);
  if (days === 0) return 'Set an end date on or after the start date.';
  if (opts.dailyBudgetMinor <= 0) return 'Set a daily budget to see what this will cost.';

  const total = formatMoney(totalSpendMinor(opts.dailyBudgetMinor, days), opts.currency);
  const daily = formatMoney(opts.dailyBudgetMinor, opts.currency);
  const unit = days === 1 ? 'day' : 'days';
  return `${total} total: ${daily} a day for ${days} ${unit}, ${formatDay(opts.startDate, false)} to ${formatDay(opts.endDate, true)}.`;
}
