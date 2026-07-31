import { describe, it, expect, vi } from 'vitest';
import { needsMetaRefresh, META_REFRESH_WINDOW_MS, describeMetaTokenState } from '../meta-token';

const NOW = new Date('2026-07-31T00:00:00Z').getTime();
const days = (n: number) => new Date(NOW + n * 86_400_000);

describe('needsMetaRefresh', () => {
  it('refreshes a token inside the pre-expiry window', () => {
    expect(needsMetaRefresh(days(3), NOW)).toBe(true);
  });

  it('leaves a token alone when expiry is comfortably away', () => {
    expect(needsMetaRefresh(days(40), NOW)).toBe(false);
  });

  it('refreshes exactly at the window boundary', () => {
    expect(needsMetaRefresh(new Date(NOW + META_REFRESH_WINDOW_MS), NOW)).toBe(true);
  });

  it('attempts a refresh when expiry is unknown', () => {
    // A null expiry means we cannot prove the token is safe. Trying and failing
    // is harmless; assuming it is fine is how tokens die silently.
    expect(needsMetaRefresh(null, NOW)).toBe(true);
  });

  it('does not attempt to refresh an already-expired token', () => {
    // Facebook cannot exchange a dead token — only a valid one can be extended.
    // Attempting it would produce a misleading error; the honest answer is that
    // this needs a human reconnect.
    expect(needsMetaRefresh(days(-1), NOW)).toBe(false);
  });
});

describe('describeMetaTokenState', () => {
  it('reports an expired token as needing reconnection', () => {
    const state = describeMetaTokenState(days(-3), NOW);
    expect(state.status).toBe('expired');
    expect(state.actionable).toBe(true);
    expect(state.message).toMatch(/reconnect/i);
  });

  it('warns when expiry is near but the token still works', () => {
    const state = describeMetaTokenState(days(4), NOW);
    expect(state.status).toBe('expiring_soon');
    expect(state.daysRemaining).toBe(4);
  });

  it('reports a healthy token', () => {
    expect(describeMetaTokenState(days(45), NOW).status).toBe('healthy');
  });

  it('treats unknown expiry as unknown rather than healthy', () => {
    const state = describeMetaTokenState(null, NOW);
    expect(state.status).toBe('unknown');
    expect(state.daysRemaining).toBeNull();
  });

  it('reproduces the real 2026-07-28 expiry as expired', () => {
    // The actual failure: the ads token expired on 28 Jul and every nightly
    // snapshot.ads has returned "failed" since, with the reason never logged.
    const state = describeMetaTokenState(new Date('2026-07-28T20:01:58Z'), NOW);
    expect(state.status).toBe('expired');
  });
});
