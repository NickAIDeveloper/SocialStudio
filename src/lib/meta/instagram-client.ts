// Instagram Graph API client (Instagram Login for Business flow).
//
// All IG calls go through graph.instagram.com — distinct from the FB
// Graph API's graph.facebook.com. Token exchange hosts are:
//   - Short-lived code exchange → api.instagram.com
//   - Long-lived exchange + refresh + data reads → graph.instagram.com

const IG_GRAPH_BASE = 'https://graph.instagram.com';
const IG_OAUTH_BASE = 'https://api.instagram.com';

// ── OAuth URL builders ───────────────────────────────────────────────────────

export interface BuildIgAuthUrlParams {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}

export function buildIgAuthDialogUrl(params: BuildIgAuthUrlParams): string {
  const u = new URL('https://www.instagram.com/oauth/authorize');
  u.searchParams.set('client_id', params.appId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', params.scopes.join(','));
  u.searchParams.set('state', params.state);
  return u.toString();
}

// ── Token exchange ───────────────────────────────────────────────────────────

export interface IgShortLivedResponse {
  access_token: string;
  user_id: number; // IG-scoped user ID
  permissions?: string[];
}

// Short-lived exchange uses application/x-www-form-urlencoded POST, unlike the
// FB flow which uses GET. It returns a JSON body on success and a plain error
// envelope on failure. Tokens from this call last ~1 hour.
export async function exchangeIgCodeForShortLivedToken(args: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<IgShortLivedResponse> {
  const body = new URLSearchParams({
    client_id: args.appId,
    client_secret: args.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: args.redirectUri,
    code: args.code,
  });

  const res = await fetch(`${IG_OAUTH_BASE}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`IG short-lived exchange failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as IgShortLivedResponse;
}

export interface IgLongLivedResponse {
  access_token: string;
  token_type: string; // "bearer"
  expires_in: number; // seconds — ~60 days (5,184,000)
}

// Exchanges a short-lived token for a ~60-day long-lived one.
// Meta's IG path has no separate "refresh token" — the same long-lived
// token can be refreshed before expiry via refreshIgLongLivedToken().
export async function exchangeForIgLongLivedToken(args: {
  appSecret: string;
  shortLivedToken: string;
}): Promise<IgLongLivedResponse> {
  const u = new URL(`${IG_GRAPH_BASE}/access_token`);
  u.searchParams.set('grant_type', 'ig_exchange_token');
  u.searchParams.set('client_secret', args.appSecret);
  u.searchParams.set('access_token', args.shortLivedToken);

  const res = await fetch(u, { method: 'GET' });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`IG long-lived exchange failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as IgLongLivedResponse;
}

// Renew a long-lived token without user re-consent. The token must be at
// least 24h old, unexpired, and the user must still have granted
// instagram_business_basic. Tokens unused for 60 days die permanently.
export async function refreshIgLongLivedToken(
  longLivedToken: string
): Promise<IgLongLivedResponse> {
  const u = new URL(`${IG_GRAPH_BASE}/refresh_access_token`);
  u.searchParams.set('grant_type', 'ig_refresh_token');
  u.searchParams.set('access_token', longLivedToken);

  const res = await fetch(u, { method: 'GET' });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`IG token refresh failed (${res.status}): ${errText}`);
  }
  return (await res.json()) as IgLongLivedResponse;
}

// ── Authed Graph requests ────────────────────────────────────────────────────

async function igGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const u = new URL(`${IG_GRAPH_BASE}${path}`);
  u.searchParams.set('access_token', accessToken);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  const res = await fetch(u, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`IG Graph error ${res.status} on ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

// ── Me / identity ────────────────────────────────────────────────────────────

export interface IgMe {
  user_id: string; // returned as string here even though short-lived gives number
  username: string;
  account_type: 'BUSINESS' | 'CREATOR' | 'PERSONAL';
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export function getIgMe(accessToken: string): Promise<IgMe> {
  return igGet<IgMe>('/me', accessToken, {
    fields:
      'user_id,username,account_type,name,profile_picture_url,followers_count,follows_count,media_count',
  });
}

// ── Media list ───────────────────────────────────────────────────────────────

export interface IgMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'FEED' | 'REELS' | 'STORY' | 'AD';
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}

export async function getIgMedia(
  accessToken: string,
  limit = 25
): Promise<IgMedia[]> {
  const data = await igGet<{ data: IgMedia[] }>('/me/media', accessToken, {
    fields:
      'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: String(limit),
  });
  return data.data ?? [];
}

// ── Insights ─────────────────────────────────────────────────────────────────

// Account-level insight metrics that work as total_value for a time window.
// Intentionally avoids `impressions` (deprecated April 2025) — `views` is the
// canonical replacement on v22+.
export const IG_ACCOUNT_METRICS_TOTAL = [
  'reach',
  'views',
  'accounts_engaged',
  'total_interactions',
  'likes',
  'comments',
  'saves',
  'shares',
  'replies',
  'profile_links_taps',
];

export interface IgInsightRow {
  name: string;
  period: string;
  values: Array<{ value: number | Record<string, number>; end_time?: string }>;
  title?: string;
  description?: string;
  id: string;
  total_value?: { value: number };
}

export interface IgInsightsResponse {
  data: IgInsightRow[];
}

export interface IgAccountInsightsQuery {
  igUserId: string;
  metrics?: string[];
  // ISO date strings. IG insights have a rolling 2-year window and require
  // `since` + `until` within 30 days of each other for total_value.
  since?: string; // unix seconds as string or ISO
  until?: string;
}

export async function getIgAccountInsights(
  accessToken: string,
  query: IgAccountInsightsQuery
): Promise<IgInsightsResponse> {
  const params: Record<string, string> = {
    metric: (query.metrics ?? IG_ACCOUNT_METRICS_TOTAL).join(','),
    metric_type: 'total_value',
    period: 'day',
  };
  if (query.since) params.since = query.since;
  if (query.until) params.until = query.until;

  return igGet<IgInsightsResponse>(`/${query.igUserId}/insights`, accessToken, params);
}

// Per-media insight metrics vary by media_type. This set works for Feed
// posts (IMAGE, CAROUSEL_ALBUM) and Reels (VIDEO / media_product_type=REELS).
// Stories have a different metric set and expire at 24h so they're fetched
// separately if/when we add that UI.
export const IG_MEDIA_METRICS_FEED = [
  'reach',
  'likes',
  'comments',
  'saves',
  'shares',
  'total_interactions',
  'views',
];

export async function getIgMediaInsights(
  accessToken: string,
  mediaId: string,
  metrics: string[] = IG_MEDIA_METRICS_FEED
): Promise<IgInsightsResponse> {
  return igGet<IgInsightsResponse>(`/${mediaId}/insights`, accessToken, {
    metric: metrics.join(','),
  });
}

// ── Token freshness helper ───────────────────────────────────────────────────

// Returns true if the token has <7 days left — a good signal to refresh it on
// the next read to avoid surprise disconnects. Caller decides whether to act.
export function shouldRefreshIgToken(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return expiresAt.getTime() - Date.now() < sevenDays;
}
