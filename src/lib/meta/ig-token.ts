// Shared Instagram long-lived token freshness helper.
//
// Why this exists: the IG long-lived token has a ~60-day lifetime but is
// renewable without user re-consent (ig_refresh_token) AS LONG AS it is
// refreshed before it expires. Historically the only code path that refreshed
// it was the manual browser insights route — so every *automated* path
// (autopilot/god-mode deep profile, daily brain snapshot) read the stored token
// directly and never renewed it. If a user relied on autopilot and never opened
// the insights page, the token silently aged past 60 days, expired permanently,
// and every autopilot run died with a 400 "Session has expired" → god_mode_500.
//
// This helper centralises "refresh-before-read": call getFreshIgToken() on any
// automated read path and the token renews itself with ~53 days of slack while
// the daily cron runs. It can never block a read — if refresh fails it returns
// the existing token and lets the downstream call surface the real auth error.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/encryption';
import { refreshIgLongLivedToken } from './instagram-client';

// Renew once the token is within this window of expiry. The daily cron then
// renews with ~53 days of slack, so the token only dies if the cron is down for
// 7+ consecutive days (e.g. a billing-locked GitHub Actions runner).
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface RefreshableIgAccount {
  id: string;
  accessToken: string; // encrypted ciphertext as stored in the DB
  tokenExpiresAt: Date | null;
}

// Injectable seams keep getFreshIgToken unit-testable without DB or network.
export interface GetFreshIgTokenDeps {
  refresh?: (longLivedToken: string) => Promise<{ access_token: string; expires_in: number }>;
  persist?: (id: string, encryptedToken: string, expiresAt: Date) => Promise<void>;
  now?: () => number;
}

async function defaultPersist(id: string, encryptedToken: string, expiresAt: Date): Promise<void> {
  await db
    .update(instagramAccounts)
    .set({ accessToken: encryptedToken, tokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(instagramAccounts.id, id));
}

export interface FreshIgToken {
  token: string;
  // true when a renewal actually happened (and was persisted) this call.
  refreshed: boolean;
}

// Returns a usable IG access token, renewing it first when it's inside the
// 7-day pre-expiry window. Never throws on refresh failure — the stale token is
// returned so the caller's real read surfaces the authoritative auth error.
export async function getFreshIgToken(
  account: RefreshableIgAccount,
  deps: GetFreshIgTokenDeps = {},
): Promise<FreshIgToken> {
  const refresh = deps.refresh ?? refreshIgLongLivedToken;
  const persist = deps.persist ?? defaultPersist;
  const nowMs = deps.now ? deps.now() : Date.now();

  const token = decrypt(account.accessToken);

  // Unknown expiry → can't reason about the window; read with what we have.
  const expiresAt = account.tokenExpiresAt;
  if (!expiresAt || expiresAt.getTime() - nowMs >= REFRESH_WINDOW_MS) {
    return { token, refreshed: false };
  }

  try {
    const renewed = await refresh(token);
    const expiresAt = new Date(nowMs + renewed.expires_in * 1000);
    await persist(account.id, encrypt(renewed.access_token), expiresAt);
    return { token: renewed.access_token, refreshed: true };
  } catch (err) {
    // Swallow: a refresh failure must not block the read. If the token is truly
    // dead the downstream Graph call returns the actionable auth error and
    // isIgAuthError() lets callers translate it into "reconnect Instagram".
    console.warn(
      `[ig-token] refresh failed for account ${account.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { token, refreshed: false };
  }
}

// Detects an expired / invalid IG access-token error from a thrown Error or raw
// Graph error body. The IG client throws messages like:
//   IG Graph error 400 on /me/media: {"error":{"message":"Error validating
//   access token: Session has expired ...","type":"OAuthException","code":190}}
export function isIgAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /validating access token/i.test(msg) ||
    /session has expired/i.test(msg) ||
    /OAuthException/i.test(msg) ||
    /"code"\s*:\s*190/.test(msg) ||
    /\baccess token has expired\b/i.test(msg) ||
    /\binvalid.{0,20}access token\b/i.test(msg)
  );
}
