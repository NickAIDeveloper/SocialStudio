import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { encrypt } from '@/lib/encryption';
import {
  buildInstagramRedirectUri,
  getInstagramConfig,
  IG_SCOPES,
} from '@/lib/meta/instagram-config';
import {
  exchangeIgCodeForShortLivedToken,
  exchangeForIgLongLivedToken,
  getIgMe,
} from '@/lib/meta/instagram-client';

// GET /api/meta/instagram/oauth/callback?code=...&state=...
//
// Mirrors /api/meta/oauth/callback but for the Instagram Login for Business
// flow. On success, upserts a row in instagram_accounts keyed on
// (userId, igUserId) — so reconnecting the same IG updates the token, and
// connecting a second IG creates a separate row.

function redirectBack(req: NextRequest, params: Record<string, string>) {
  const url = new URL('/meta', req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  // User clicked Cancel on the IG dialog, or Meta declined the app.
  const error = req.nextUrl.searchParams.get('error');
  if (error) {
    const reason =
      req.nextUrl.searchParams.get('error_description') ??
      req.nextUrl.searchParams.get('error_reason') ??
      error;
    return redirectBack(req, { igError: reason });
  }

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) {
    return redirectBack(req, { igError: 'Missing code or state' });
  }

  // CSRF: compare returned state to the cookie we set at /start.
  const cookieStore = await cookies();
  const cookieState = cookieStore.get('ig_oauth_state')?.value;
  cookieStore.delete('ig_oauth_state');
  if (!cookieState || cookieState !== state) {
    return redirectBack(req, { igError: 'Invalid OAuth state' });
  }

  try {
    const userId = await getUserId();
    const cfg = getInstagramConfig(buildInstagramRedirectUri(req.nextUrl.origin));

    // 1. code → short-lived IG user token (~1h)
    const shortLived = await exchangeIgCodeForShortLivedToken({
      appId: cfg.appId,
      appSecret: cfg.appSecret,
      redirectUri: cfg.redirectUri,
      code,
    });

    // 2. short-lived → long-lived (~60d)
    const longLived = await exchangeForIgLongLivedToken({
      appSecret: cfg.appSecret,
      shortLivedToken: shortLived.access_token,
    });

    // 3. identify who just authorized
    const me = await getIgMe(longLived.access_token);

    if (me.account_type === 'PERSONAL') {
      // Should never happen because IG Login for Business won't let a
      // Personal account through the dialog — but guard in case Meta relaxes
      // that and we'd otherwise store a token we can't do anything with.
      return redirectBack(req, {
        igError: 'Instagram account must be Business or Creator — not Personal.',
      });
    }

    const tokenExpiresAt = new Date(Date.now() + longLived.expires_in * 1000);

    const now = new Date();
    await db
      .insert(instagramAccounts)
      .values({
        userId,
        igUserId: String(me.user_id),
        igUsername: me.username,
        igAccountType: me.account_type,
        name: me.name ?? null,
        profilePictureUrl: me.profile_picture_url ?? null,
        accessToken: encrypt(longLived.access_token),
        tokenExpiresAt,
        scopes: IG_SCOPES.join(','),
        connectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [instagramAccounts.userId, instagramAccounts.igUserId],
        set: {
          igUsername: me.username,
          igAccountType: me.account_type,
          name: me.name ?? null,
          profilePictureUrl: me.profile_picture_url ?? null,
          accessToken: encrypt(longLived.access_token),
          tokenExpiresAt,
          scopes: IG_SCOPES.join(','),
          updatedAt: now,
        },
      });

    return redirectBack(req, { igConnected: me.username });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : 'IG OAuth callback failed';
    return redirectBack(req, { igError: message });
  }
}
