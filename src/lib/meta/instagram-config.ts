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

// Read-only scope set. `instagram_business_basic` is required — covers
// /me and /me/media. `instagram_business_manage_insights` is needed to
// hit the /insights endpoints (both account-level and per-media).
export const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
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
