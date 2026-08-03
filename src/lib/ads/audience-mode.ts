// src/lib/ads/audience-mode.ts
//
// Whether an ad set hand-picks its audience or lets Meta find it.
//
// The builder has always hard-coded `advantage_audience: 0` — opting OUT of
// Meta's automated audience so our own interest/geo/age/gender targeting
// decides who sees the ad. The method described on the podcast does the exact
// opposite: post-Andromeda he runs no targeting at all and lets the creative
// and the landing page select the audience.
//
// Both positions are defensible and we have zero delivery data to settle it, so
// this makes the choice explicit and per-ad rather than a constant buried in
// the publish route. Run one of each and let the numbers decide.
//
// Note on interests under 'broad': Meta treats detailed targeting as
// SUGGESTIONS when Advantage+ audience is on, and will deliver outside them if
// it finds better results. We keep sending them for that reason — they seed the
// search rather than fence it. Setting the flag is the whole change.

export type AudienceMode = 'detailed' | 'broad';

// Existing behaviour. Anything unrecognised resolves here.
export const DEFAULT_AUDIENCE_MODE: AudienceMode = 'detailed';

const VALID: readonly AudienceMode[] = ['detailed', 'broad'];

// Parse whatever arrived from a client, a stored draft, or an older row.
//
// Unknown input deliberately resolves to 'detailed' rather than throwing: this
// value decides how real money is spent, and a typo, a stale client or a
// renamed enum must never silently widen an audience. Failing closed to the
// narrower option is the safe direction.
export function resolveAudienceMode(raw: unknown): AudienceMode {
  return VALID.includes(raw as AudienceMode) ? (raw as AudienceMode) : DEFAULT_AUDIENCE_MODE;
}

// Meta requires this flag to be explicitly 0 or 1 in targeting_automation, or
// it rejects the ad set with subcode 1870227 ("Advantage Audience Flag
// Required"). A boolean or an omitted value is not accepted.
export function advantageAudienceFlag(mode: AudienceMode): 0 | 1 {
  return mode === 'broad' ? 1 : 0;
}
