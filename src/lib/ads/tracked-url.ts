// src/lib/ads/tracked-url.ts
//
// Tags a destination URL so a click can later be tied back to the exact ad or
// post that produced it.
//
// Why this is the first piece of the revenue loop: this platform takes no
// payments itself — the money is earned in the products it markets
// (pacebrain.app, affectly.app). So attribution can only ever work by carrying
// an identifier ACROSS to those products. Every possible approach — a Meta
// pixel on the destination site, that product's own analytics, or a conversion
// event posted back to us — needs a tagged link first. This primitive is
// therefore common to all of them and blocked by none.
//
// Two layers are written deliberately:
//   utm_*   — read by whatever analytics the destination site already runs.
//   gv_cid  — our own click id. Survives sites that strip or rewrite utm_*, and
//             is the key our first-party attribution joins on rather than
//             trusting Meta's own reporting of itself.

// App Store / Play Store links must never be tagged: APP-objective ads use them
// as the creative link and Meta validates the URL against the registered
// promoted_object. Appending query params breaks that match (error 1487810).
const APP_STORE_RE = /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com|play\.google\.com)\//i;

export interface TrackingParams {
  // Where the click comes from: 'meta', 'instagram', …
  source: string;
  // Defaults to 'paid_social'; pass 'organic_social' for autopilot posts.
  medium?: string;
  brandSlug: string;
  // The ad id or post id this link is embedded in.
  contentId: string;
}

// Lowercase, alphanumerics, dashes and underscores — analytics tools group on
// exact string match, so "Pace Brain!" and "pace-brain" must not become two
// rows. Underscores are preserved because the conventional utm_medium values
// ("paid_social", "organic_social") use them and would otherwise be rewritten.
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildTrackedUrl(destinationUrl: string, params: TrackingParams): string {
  if (!destinationUrl || APP_STORE_RE.test(destinationUrl)) return destinationUrl;

  let url: URL;
  try {
    url = new URL(destinationUrl);
  } catch {
    // Malformed URL: hand it back untouched. Tagging is an enhancement and must
    // never be the reason an ad publish or a post fails.
    return destinationUrl;
  }

  // `set` (not `append`) so re-tagging replaces stale values instead of
  // accumulating a second copy — re-publishing an edited ad is routine.
  url.searchParams.set('utm_source', slug(params.source));
  url.searchParams.set('utm_medium', slug(params.medium ?? 'paid_social'));
  url.searchParams.set('utm_campaign', slug(params.brandSlug));
  url.searchParams.set('utm_content', params.contentId);
  url.searchParams.set('gv_cid', params.contentId);

  return url.toString();
}
