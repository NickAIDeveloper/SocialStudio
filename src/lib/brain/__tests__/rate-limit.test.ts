import { describe, it, expect } from 'vitest';
import { parseUsage, isThrottled } from '../rate-limit';
import fixture from './fixtures/meta-headers-80pct.json';

describe('parseUsage', () => {
  it('returns the highest dimension across all three usage headers', () => {
    const headers = new Headers(fixture as Record<string, string>);
    const usage = parseUsage(headers);
    expect(usage.maxPct).toBeGreaterThanOrEqual(78);
    expect(usage.maxPct).toBeLessThanOrEqual(82);
  });

  it('returns 0 when no usage headers are present', () => {
    expect(parseUsage(new Headers()).maxPct).toBe(0);
  });
});

describe('isThrottled', () => {
  it('returns true when any dimension is at or above threshold', () => {
    const headers = new Headers(fixture as Record<string, string>);
    expect(isThrottled(headers, 80)).toBe(true);
  });

  it('returns false when all dimensions are below threshold', () => {
    const headers = new Headers(fixture as Record<string, string>);
    expect(isThrottled(headers, 99)).toBe(false);
  });
});
