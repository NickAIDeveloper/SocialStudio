// Meta Graph API client wrapper.
//
// Covers the three things we need for Phase 1:
//  1. OAuth token exchange (authorization_code → short-lived → long-lived)
//  2. Listing the user's ad accounts / pages / IG business accounts
//  3. Reading Marketing API /insights data
//
// All public functions accept a plaintext access token. Token encryption for
// storage/retrieval lives in lib/encryption.ts — this module stays stateless.

const META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ── OAuth URL builders ───────────────────────────────────────────────────────

export interface BuildAuthUrlParams {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[]; // e.g. ['ads_read', 'pages_show_list']
}

export function buildAuthDialogUrl(params: BuildAuthUrlParams): string {
  const u = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  u.searchParams.set('client_id', params.appId);
  u.searchParams.set('redirect_uri', params.redirectUri);
  u.searchParams.set('state', params.state);
  u.searchParams.set('scope', params.scopes.join(','));
  u.searchParams.set('response_type', 'code');
  return u.toString();
}

// ── Token exchange ───────────────────────────────────────────────────────────

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number; // seconds
}

export async function exchangeCodeForShortLivedToken(args: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<AccessTokenResponse> {
  const u = new URL(`${GRAPH_BASE}/oauth/access_token`);
  u.searchParams.set('client_id', args.appId);
  u.searchParams.set('client_secret', args.appSecret);
  u.searchParams.set('redirect_uri', args.redirectUri);
  u.searchParams.set('code', args.code);

  const res = await fetch(u, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta code-exchange failed (${res.status}): ${body}`);
  }
  return (await res.json()) as AccessTokenResponse;
}

// A long-lived user token lasts ~60 days. There's no native "refresh token" on
// Meta — to renew, you must re-exchange or re-authorize before expiry.
export async function exchangeForLongLivedToken(args: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<AccessTokenResponse> {
  const u = new URL(`${GRAPH_BASE}/oauth/access_token`);
  u.searchParams.set('grant_type', 'fb_exchange_token');
  u.searchParams.set('client_id', args.appId);
  u.searchParams.set('client_secret', args.appSecret);
  u.searchParams.set('fb_exchange_token', args.shortLivedToken);

  const res = await fetch(u, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta long-lived exchange failed (${res.status}): ${body}`);
  }
  return (await res.json()) as AccessTokenResponse;
}

// ── Authed Graph requests ────────────────────────────────────────────────────

async function graphGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const u = new URL(`${GRAPH_BASE}${path}`);
  u.searchParams.set('access_token', accessToken);
  if (params) {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  }

  const res = await fetch(u, { method: 'GET' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta Graph error ${res.status} on ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

// ── Me / identity ────────────────────────────────────────────────────────────

export interface MeResponse {
  id: string;
  name?: string;
}

export function getMe(accessToken: string): Promise<MeResponse> {
  return graphGet<MeResponse>('/me', accessToken, { fields: 'id,name' });
}

// ── Ad accounts ──────────────────────────────────────────────────────────────

export interface AdAccount {
  id: string; // "act_123456789"
  account_id: string; // "123456789"
  name: string;
  currency?: string;
  account_status?: number; // 1 = active, 2 = disabled, etc.
  timezone_name?: string;
}

export async function getAdAccounts(accessToken: string): Promise<AdAccount[]> {
  const data = await graphGet<{ data: AdAccount[] }>(
    '/me/adaccounts',
    accessToken,
    { fields: 'id,account_id,name,currency,account_status,timezone_name', limit: '200' }
  );
  return data.data ?? [];
}

// ── Pages + Instagram business accounts ──────────────────────────────────────

export interface Page {
  id: string;
  name: string;
  category?: string;
  instagram_business_account?: { id: string };
}

export async function getPages(accessToken: string): Promise<Page[]> {
  const data = await graphGet<{ data: Page[] }>('/me/accounts', accessToken, {
    fields: 'id,name,category,instagram_business_account',
    limit: '200',
  });
  return data.data ?? [];
}

// ── Insights ─────────────────────────────────────────────────────────────────

export type InsightsLevel = 'account' | 'campaign' | 'adset' | 'ad';
export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_90d'
  | 'this_month'
  | 'last_month'
  | 'maximum';

export interface InsightsQuery {
  adAccountId: string; // "act_123" or just "123"
  level?: InsightsLevel;
  datePreset?: DatePreset;
  fields?: string[];
  breakdowns?: string[];
  timeIncrement?: number; // 1 = daily series
  limit?: number;
}

export interface InsightsRow {
  // Field list below is illustrative — actual fields returned depend on the
  // `fields` you pass. Record<string, unknown> keeps this honest.
  [key: string]: unknown;
  impressions?: string;
  reach?: string;
  spend?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  date_start?: string;
  date_stop?: string;
}

export interface InsightsResponse {
  data: InsightsRow[];
  paging?: { cursors?: { before?: string; after?: string } };
}

// The default metric set. Keep it small — every extra field adds to the
// Marketing API's "per-call complexity" budget, which affects rate limits.
// If you need a richer set later, pass `fields` explicitly per query.
export const DEFAULT_INSIGHTS_FIELDS = [
  'impressions',
  'reach',
  'spend',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'frequency',
  'date_start',
  'date_stop',
];

export async function getInsights(
  accessToken: string,
  query: InsightsQuery
): Promise<InsightsResponse> {
  const accId = query.adAccountId.startsWith('act_')
    ? query.adAccountId
    : `act_${query.adAccountId}`;

  const params: Record<string, string> = {
    fields: (query.fields ?? DEFAULT_INSIGHTS_FIELDS).join(','),
    level: query.level ?? 'account',
    date_preset: query.datePreset ?? 'last_30d',
    limit: String(query.limit ?? 25),
  };
  if (query.breakdowns?.length) params.breakdowns = query.breakdowns.join(',');
  if (query.timeIncrement != null) params.time_increment = String(query.timeIncrement);

  return graphGet<InsightsResponse>(`/${accId}/insights`, accessToken, params);
}
