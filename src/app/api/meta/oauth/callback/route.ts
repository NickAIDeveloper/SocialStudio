import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { encrypt } from '@/lib/encryption';
import { buildRedirectUri, getMetaConfig } from '@/lib/meta/config';
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getMe,
  getAdAccounts,
  getPages,
} from '@/lib/meta/client';

// GET /api/meta/oauth/callback?code=...&state=...
//
// Exchanges the authorization code for a long-lived token, fetches the user's
// ad accounts + pages, and stores everything in meta_accounts. Then redirects
// to /meta with a success or error query param.

function redirectBack(req: NextRequest, params: Record<string, string>) {
  const url = new URL('/analytics', req.nextUrl.origin);
  url.searchParams.set('source', 'meta');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  // Handle Facebook's "user clicked Cancel" response up front.
  const error = req.nextUrl.searchParams.get('error');
  if (error) {
    const reason = req.nextUrl.searchParams.get('error_description') ?? error;
    return redirectBack(req, { error: reason });
  }

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) {
    return redirectBack(req, { error: 'Missing code or state' });
  }

  // Validate state against cookie (CSRF protection).
  const cookieStore = await cookies();
  const cookieState = cookieStore.get('meta_oauth_state')?.value;
  cookieStore.delete('meta_oauth_state');
  if (!cookieState || cookieState !== state) {
    return redirectBack(req, { error: 'Invalid OAuth state' });
  }

  try {
    const userId = await getUserId();
    const cfg = getMetaConfig(buildRedirectUri(req.nextUrl.origin));

    // Step 1: code → short-lived user token
    const shortLived = await exchangeCodeForShortLivedToken({
      appId: cfg.appId,
      appSecret: cfg.appSecret,
      redirectUri: cfg.redirectUri,
      code,
    });

    // Step 2: short-lived → long-lived (~60 day) token
    const longLived = await exchangeForLongLivedToken({
      appId: cfg.appId,
      appSecret: cfg.appSecret,
      shortLivedToken: shortLived.access_token,
    });

    const token = longLived.access_token;

    // Step 3: identify who authorized and discover their assets
    const [me, adAccounts, pages] = await Promise.all([
      getMe(token),
      getAdAccounts(token).catch(() => []), // may 403 if ads_read not granted
      getPages(token).catch(() => []),
    ]);

    const tokenExpiresAt =
      typeof longLived.expires_in === 'number'
        ? new Date(Date.now() + longLived.expires_in * 1000)
        : null;

    const assets = {
      adAccounts,
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        instagramBusinessAccountId: p.instagram_business_account?.id ?? null,
      })),
    };

    // Default-select the first ad account so the Insights tab shows data
    // immediately after connect, without a manual pick.
    const defaultAdAccountId = adAccounts[0]?.id ?? null;

    const now = new Date();
    await db
      .insert(metaAccounts)
      .values({
        userId,
        fbUserId: me.id,
        fbUserName: me.name ?? null,
        accessToken: encrypt(token),
        tokenExpiresAt,
        scopes: cfg.scopes.join(','),
        assets,
        selectedAdAccountId: defaultAdAccountId,
        connectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: metaAccounts.userId,
        set: {
          fbUserId: me.id,
          fbUserName: me.name ?? null,
          accessToken: encrypt(token),
          tokenExpiresAt,
          scopes: cfg.scopes.join(','),
          assets,
          selectedAdAccountId: defaultAdAccountId,
          updatedAt: now,
        },
      });

    return redirectBack(req, { connected: '1' });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : 'OAuth callback failed';
    return redirectBack(req, { error: message });
  }
}
