// Instagram Login for Business config.
//
// This is the *newer* IG auth path introduced in 2024 — completely distinct
// from the Facebook Login for Business flow in /meta/config.ts:
//   - Separate OAuth dialog host (instagram.com, not facebook.com)
//   - Separate Graph API base (graph.instagram.com, not graph.facebook.com)
//   - New scope taxonomy (instagram_business_*)
// The advantage: no FB Page dependency. A user with a Business or Creator IG
// account can connect directly.

export interface InstagramOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes: string[];
}

// `instagram_business_basic` is required — covers /me and /me/media.
// `instagram_business_manage_insights` is needed to hit the /insights
// endpoints (both account-level and per-media).
//
// `instagram_business_content_publish` lets us POST /me/media +
// /me/media_publish and publish straight to Instagram on this token. It exists
// so Buffer stops being a single point of failure: Buffer's own per-channel
// Meta credential expires every few weeks and Buffer's API has NO auth
// mutation, so reconnecting it is human-only, forever. This token, by
// contrast, we refresh ourselves (see ig-token.ts / getFreshIgToken) and it has
// not needed a manual reconnect since 2026-06-20.
//
// Adding a scope here does NOT retro-grant it: existing stored tokens keep
// whatever they were granted at consent time and must re-run the OAuth flow
// once to pick this up.
export const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'instagram_business_content_publish',
];

// Mirrors buildRedirectUri() in config.ts: pinned env var wins so prod can
// use a canonical URL that matches the Facebook app's whitelist exactly;
// otherwise derive from the request origin so dev/preview works.
export function buildInstagramRedirectUri(origin: string): string {
  const pinned = process.env.META_IG_OAUTH_REDIRECT_URI;
  if (pinned && pinned.length > 0) return pinned;
  return `${origin}/api/meta/instagram/oauth/callback`;
}

export function getInstagramConfig(redirectUri: string): InstagramOAuthConfig {
  // Instagram Login for Business requires the *Instagram* app ID + secret,
  // NOT the Facebook/Meta app credentials. Same Meta project, but the IG
  // product has its own app ID (shown as "Instagram app ID" in the Meta
  // console) and its own secret. Using the FB app ID here yields
  // "Invalid platform app" at /oauth/authorize.
  const appId = process.env.META_IG_APP_ID;
  const appSecret = process.env.META_IG_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Instagram OAuth not configured. Set META_IG_APP_ID and META_IG_APP_SECRET (from the Meta console → Instagram API Setup tab).'
    );
  }
  return { appId, appSecret, redirectUri, scopes: IG_SCOPES };
}
