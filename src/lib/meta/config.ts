// Single source of truth for Meta OAuth config. Keeps env-var reads in one
// place so the error message is consistent and the scope list is defined once.

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Phase 1 scopes. Everything here is analytics / read-only — narrowest possible
// App Review story. If you later add ads-management UI, extend with
// 'ads_management' and re-submit for review.
//
// ads_read            — required for /insights on ad accounts
// pages_show_list     — list Pages the user manages (needed to discover IG accounts)
// pages_read_engagement — read posts + insights on Pages the user manages
// instagram_basic     — locate the IG Business account linked to a Page
// instagram_manage_insights — per-post IG insights (saves, reach, follows-from-post)
// business_management — needed when the assets live under a Business Manager
export const META_SCOPES = [
  'ads_read',
  'pages_show_list',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_insights',
  'business_management',
];

// Builds the Meta OAuth callback URL from a request origin. Deriving it from
// the incoming request lets the same code work in dev/preview/prod without an
// env var per environment — and guarantees the start and callback routes
// produce the exact same URL (Facebook validates it character-for-character).
export function buildRedirectUri(origin: string): string {
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
