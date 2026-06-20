// Tests for the shared IG token freshness helper. DB + network are injected so
// the suite runs offline and never touches encryption env beyond the mock.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({ instagramAccounts: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
// decrypt strips an "enc_" prefix; encrypt adds it — mirrors deep-profile.test.
vi.mock('@/lib/encryption', () => ({
  decrypt: (t: string) => t.replace('enc_', ''),
  encrypt: (t: string) => `enc_${t}`,
}));

import { getFreshIgToken, isIgAuthError } from '../ig-token';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe('getFreshIgToken', () => {
  it('returns the stored token untouched when expiry is far away', async () => {
    const refresh = vi.fn();
    const persist = vi.fn();
    const out = await getFreshIgToken(
      { id: 'a1', accessToken: 'enc_live', tokenExpiresAt: new Date(NOW + 30 * DAY) },
      { refresh, persist, now: () => NOW },
    );
    expect(out).toEqual({ token: 'live', refreshed: false });
    expect(refresh).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('renews and persists when inside the 7-day pre-expiry window', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValue({ access_token: 'renewed', expires_in: 5_184_000 });
    const persist = vi.fn().mockResolvedValue(undefined);

    const out = await getFreshIgToken(
      { id: 'a1', accessToken: 'enc_old', tokenExpiresAt: new Date(NOW + 2 * DAY) },
      { refresh, persist, now: () => NOW },
    );

    expect(refresh).toHaveBeenCalledWith('old');
    expect(out).toEqual({ token: 'renewed', refreshed: true });
    // Persisted re-encrypted token + new expiry computed from expires_in.
    expect(persist).toHaveBeenCalledWith(
      'a1',
      'enc_renewed',
      new Date(NOW + 5_184_000 * 1000),
    );
  });

  it('falls back to the stale token (no throw) when refresh fails', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('IG token refresh failed (400)'));
    const persist = vi.fn();
    const out = await getFreshIgToken(
      { id: 'a1', accessToken: 'enc_stale', tokenExpiresAt: new Date(NOW + 1 * DAY) },
      { refresh, persist, now: () => NOW },
    );
    expect(out).toEqual({ token: 'stale', refreshed: false });
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not refresh when expiry is unknown (null)', async () => {
    const refresh = vi.fn();
    const out = await getFreshIgToken(
      { id: 'a1', accessToken: 'enc_t', tokenExpiresAt: null },
      { refresh, persist: vi.fn(), now: () => NOW },
    );
    expect(out.refreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('isIgAuthError', () => {
  it('detects the real expired-session Graph error', () => {
    const real =
      'IG Graph error 400 on /me/media: {"error":{"message":"Error validating access token: Session has expired on Monday, 15-Jun-26 19:41:43 PDT","type":"OAuthException","code":190}}';
    expect(isIgAuthError(new Error(real))).toBe(true);
  });

  it('detects raw OAuthException / code 190 bodies', () => {
    expect(isIgAuthError('{"error":{"type":"OAuthException","code":190}}')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isIgAuthError(new Error('IG Graph error 500 on /me/media: server error'))).toBe(false);
    expect(isIgAuthError(new Error('ECONNRESET'))).toBe(false);
    expect(isIgAuthError(null)).toBe(false);
  });
});
