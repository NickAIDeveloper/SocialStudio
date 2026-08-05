import { describe, it, expect } from 'vitest';
import {
  runDays,
  endDateForDays,
  totalSpendMinor,
  formatMoney,
  describeRun,
} from '../budget-plan';

const START = '2026-08-05T00:00:00.000Z';

describe('runDays', () => {
  it('counts a same-day run as one day', () => {
    expect(runDays(START, START)).toBe(1);
  });

  it('counts inclusive days, so 5th to 11th is seven days', () => {
    expect(runDays(START, '2026-08-11T00:00:00.000Z')).toBe(7);
  });

  it('ignores the time of day on either end', () => {
    expect(runDays('2026-08-05T23:00:00Z', '2026-08-06T01:00:00Z')).toBe(2);
  });

  it('returns 0 rather than a negative run when the dates are backwards', () => {
    expect(runDays('2026-08-11T00:00:00Z', START)).toBe(0);
  });

  it('returns 0 for unusable dates', () => {
    expect(runDays('', START)).toBe(0);
    expect(runDays(START, 'not a date')).toBe(0);
  });
});

describe('endDateForDays', () => {
  it('a one-day run ends on the day it starts', () => {
    expect(endDateForDays(START, 1).slice(0, 10)).toBe('2026-08-05');
  });

  it('a seven-day run starting the 5th ends on the 11th', () => {
    expect(endDateForDays(START, 7).slice(0, 10)).toBe('2026-08-11');
  });

  it('round-trips with runDays', () => {
    for (const days of [1, 3, 7, 14, 30, 90]) {
      expect(runDays(START, endDateForDays(START, days))).toBe(days);
    }
  });

  it('treats a nonsense day count as a single day', () => {
    expect(endDateForDays(START, 0).slice(0, 10)).toBe('2026-08-05');
    expect(endDateForDays(START, -5).slice(0, 10)).toBe('2026-08-05');
  });
});

describe('totalSpendMinor', () => {
  it('multiplies the daily budget by the number of days', () => {
    expect(totalSpendMinor(1000, 7)).toBe(7000);
  });

  it('is zero when the run has no days', () => {
    expect(totalSpendMinor(1000, 0)).toBe(0);
  });

  it('never returns a negative total', () => {
    expect(totalSpendMinor(-1000, 7)).toBe(0);
  });
});

describe('formatMoney', () => {
  it('renders minor units with the currency symbol', () => {
    expect(formatMoney(7000, 'GBP')).toBe('£70.00');
    expect(formatMoney(500, 'USD')).toBe('$5.00');
    expect(formatMoney(1250, 'EUR')).toBe('€12.50');
  });

  it('falls back to the code for a currency it has no symbol for', () => {
    expect(formatMoney(1000, 'BRL')).toBe('BRL 10.00');
  });
});

describe('describeRun', () => {
  it('states the total, the daily rate and the dates in one sentence', () => {
    const out = describeRun({ startDate: START, endDate: '2026-08-11T00:00:00Z', dailyBudgetMinor: 1000, currency: 'GBP' });
    expect(out).toBe('£70.00 total: £10.00 a day for 7 days, 5 Aug to 11 Aug 2026.');
  });

  it('says one day rather than 1 days', () => {
    const out = describeRun({ startDate: START, endDate: START, dailyBudgetMinor: 1000, currency: 'GBP' });
    expect(out).toContain('for 1 day,');
  });

  it('refuses to quote a total when the dates make no sense', () => {
    const out = describeRun({ startDate: '2026-08-11T00:00:00Z', endDate: START, dailyBudgetMinor: 1000, currency: 'GBP' });
    expect(out).toBe('Set an end date on or after the start date.');
  });

  it('asks for a budget rather than quoting zero', () => {
    const out = describeRun({ startDate: START, endDate: '2026-08-11T00:00:00Z', dailyBudgetMinor: 0, currency: 'GBP' });
    expect(out).toBe('Set a daily budget to see what this will cost.');
  });
});
