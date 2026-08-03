import { describe, it, expect } from 'vitest';
import {
  resolveAudienceMode,
  advantageAudienceFlag,
  DEFAULT_AUDIENCE_MODE,
} from '../audience-mode';

// The ad builder hard-codes `advantage_audience: 0` — we opt OUT of Meta's
// automated audience and hand-pick interests. The method described on the
// podcast does the opposite: no targeting at all, creative and landing page
// decide who sees it. This makes that a choice rather than a hidden constant,
// so both can be run and compared instead of argued about.

describe('resolveAudienceMode', () => {
  it('defaults to detailed targeting', () => {
    // The existing behaviour. An ad published before this field existed must
    // keep spending exactly the way it did.
    expect(resolveAudienceMode(undefined)).toBe('detailed');
    expect(resolveAudienceMode(null)).toBe('detailed');
    expect(DEFAULT_AUDIENCE_MODE).toBe('detailed');
  });

  it('accepts an explicit broad choice', () => {
    expect(resolveAudienceMode('broad')).toBe('broad');
  });

  it('accepts an explicit detailed choice', () => {
    expect(resolveAudienceMode('detailed')).toBe('detailed');
  });

  it('falls back to detailed on an unrecognised value', () => {
    // This is the safety property that matters: a typo, a stale client, or a
    // renamed enum must never silently flip how money is spent. Unknown input
    // resolves to the narrower, more conservative option.
    expect(resolveAudienceMode('BROAD')).toBe('detailed');
    expect(resolveAudienceMode('advantage')).toBe('detailed');
    expect(resolveAudienceMode(1)).toBe('detailed');
    expect(resolveAudienceMode({})).toBe('detailed');
    expect(resolveAudienceMode('')).toBe('detailed');
  });
});

describe('advantageAudienceFlag', () => {
  it('opts out for detailed targeting', () => {
    expect(advantageAudienceFlag('detailed')).toBe(0);
  });

  it('opts in for broad targeting', () => {
    expect(advantageAudienceFlag('broad')).toBe(1);
  });

  it('never returns anything but 0 or 1', () => {
    // Meta rejects the ad set with subcode 1870227 unless this is explicitly
    // 0 or 1 — a boolean or a missing value is not accepted.
    for (const mode of ['detailed', 'broad'] as const) {
      expect([0, 1]).toContain(advantageAudienceFlag(mode));
    }
  });
});
