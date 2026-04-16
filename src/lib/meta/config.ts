// Single source of truth for Meta OAuth config. Keeps env-var reads in one
// place so the error message is consistent and the scope list is defined once.

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Phase 1 scopes. Everything here is analytics / read-only.
//
// Only scopes that are "Ready for testing" in the Meta app's customized use
// cases can be granted in Dev Mode without App Review. The Marketing API use
// case on the GoViraleza app already has these four ready:
//   ads_read              — required for /insights on ad accounts
//   ads_management        — read (and later: write) ad campaigns
//   pages_read_engagement — read posts + insights on Pages the user manages
//   business_management   — needed when assets live under a Business Manager
//
// Instagram scopes (instagram_basic, instagram_manage_insights) and
// pages_show_list require adding an additional use case in the Meta console
// before they can be tested. Add them back here once that use case exists.
export const META_SCOPES = [
  'ads_read',
  'ads_management',
  'pages_read_engagement',
  'business_management',
];

// Builds the Meta OAuth callback URL.
//
// Facebook validates redirect URIs character-for-character against the app's
// whitelist, so any drift (www vs. non-www, trailing slash, preview subdomain)
// produces "URL Blocked". To avoid that:
//   1. If META_OAUTH_REDIRECT_URI is set, use it verbatim. This is what prod
//      should do — pin to one canonical URL and whitelist only that one.
//   2. Otherwise fall back to the request origin, which keeps dev and preview
//      working without per-env config.
//
// Both /oauth/start and /oauth/callback must call this with the same request,
// so they produce identical strings (Facebook requires an exact match between
// the redirect_uri sent at auth-dialog time and at token-exchange time).
export function buildRedirectUri(origin: string): string {
  const pinned = process.env.META_OAUTH_REDIRECT_URI;
  if (pinned && pinned.length > 0) return pinned;
  return `${origin}/api/meta/oauth/callback`;
}

export function getMetaConfig(redirectUri: string): MetaOAuthConfig {
  const appId = process.env.META_APP_ID ?? process.env.FB_APP_ID;
  const appSecret = process.env.META_APP_SECRET ?? process.env.FB_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Meta OAuth not configured. Set META_APP_ID and META_APP_SECRET (or FB_APP_ID / FB_APP_SECRET).'
    );
  }
  return { appId, appSecret, redirectUri, scopes: META_SCOPES };
}

export function isMetaConfigured(): boolean {
  return Boolean(
    (process.env.META_APP_ID || process.env.FB_APP_ID) &&
      (process.env.META_APP_SECRET || process.env.FB_APP_SECRET)
  );
}
