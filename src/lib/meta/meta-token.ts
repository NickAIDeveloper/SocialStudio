// src/lib/meta/meta-token.ts
//
// Freshness helper for the FACEBOOK/META ads token (metaAccounts), the sibling
// of lib/meta/ig-token.ts.
//
// Why this exists: metaAccounts.tokenExpiresAt was READ in four places to show
// "expiring soon" warnings, but NOTHING ever renewed it. That is precisely the
// disease that killed the Instagram token — and it duly happened here too: the
// ads token expired on 2026-07-28 and every nightly `snapshot.ads` has returned
// "failed" since, with the reason never surfaced because run-daily.mjs logs only
// the status.
//
// Note the important asymmetry with Instagram: a Facebook long-lived user token
// can be extended by re-exchanging it while it is still VALID, but an expired
// one cannot be recovered — that needs a human to reconnect. So the honest
// contract here is "keep a living token alive", not "resurrect a dead one", and
// describeMetaTokenState exists to say which situation you are in.

// Renew once within this window of expiry. With a daily sweep that leaves ~53
// days of slack, so the token only dies if the sweep is down for 7+ days.
export const META_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Should we attempt a refresh right now?
//
// Returns false for an already-expired token: Facebook cannot exchange a dead
// token, so trying produces a misleading error when the real answer is "a human
// must reconnect".
export function needsMetaRefresh(expiresAt: Date | null | undefined, now: number = Date.now()): boolean {
  // Unknown expiry: we cannot prove the token is safe. Trying and failing is
  // harmless; assuming it is fine is how tokens die silently.
  if (!expiresAt) return true;

  const remaining = expiresAt.getTime() - now;
  if (remaining <= 0) return false; // dead — refresh cannot help
  return remaining <= META_REFRESH_WINDOW_MS;
}

export type MetaTokenStatus = 'healthy' | 'expiring_soon' | 'expired' | 'unknown';

export interface MetaTokenState {
  status: MetaTokenStatus;
  daysRemaining: number | null;
  // True when only a human can resolve it.
  actionable: boolean;
  message: string;
}

// Human-readable state, for dashboards and for the daily sweep's log line —
// so an expired ads token is never again a bare "failed".
export function describeMetaTokenState(
  expiresAt: Date | null | undefined,
  now: number = Date.now(),
): MetaTokenState {
  if (!expiresAt) {
    return {
      status: 'unknown',
      daysRemaining: null,
      actionable: false,
      message: 'Meta token expiry is unknown — it will be probed on next use.',
    };
  }

  const remainingMs = expiresAt.getTime() - now;
  const daysRemaining = Math.floor(remainingMs / 86_400_000);

  if (remainingMs <= 0) {
    return {
      status: 'expired',
      daysRemaining,
      actionable: true,
      message:
        'Your Meta ads connection has expired — reconnect Meta in Settings to resume ad insights and publishing.',
    };
  }
  if (remainingMs <= META_REFRESH_WINDOW_MS) {
    return {
      status: 'expiring_soon',
      daysRemaining,
      actionable: false,
      message: `Meta ads token expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}; it will renew automatically.`,
    };
  }
  return {
    status: 'healthy',
    daysRemaining,
    actionable: false,
    message: `Meta ads token is healthy (${daysRemaining} days remaining).`,
  };
}
