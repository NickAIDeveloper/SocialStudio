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

export function getMetaConfig(): MetaOAuthConfig {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;

  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      'Meta OAuth not configured. Set META_APP_ID, META_APP_SECRET, and META_OAUTH_REDIRECT_URI.'
    );
  }
  return { appId, appSecret, redirectUri, scopes: META_SCOPES };
}

export function isMetaConfigured(): boolean {
  return Boolean(
    process.env.META_APP_ID &&
      process.env.META_APP_SECRET &&
      process.env.META_OAUTH_REDIRECT_URI
  );
}
