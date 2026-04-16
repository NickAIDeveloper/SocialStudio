import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { getUserId } from '@/lib/auth-helpers';
import { buildIgAuthDialogUrl } from '@/lib/meta/instagram-client';
import { buildInstagramRedirectUri, getInstagramConfig } from '@/lib/meta/instagram-config';

// GET /api/meta/instagram/oauth/start
//
// Kicks off Instagram Login for Business. Distinct cookie name from the FB
// flow (ig_oauth_state) so the two can coexist if a user is mid-flow on one
// when they start the other.
export async function GET(req: NextRequest) {
  try {
    await getUserId();

    const cfg = getInstagramConfig(buildInstagramRedirectUri(req.nextUrl.origin));
    const state = randomBytes(32).toString('hex');

    const cookieStore = await cookies();
    cookieStore.set('ig_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });

    const dialogUrl = buildIgAuthDialogUrl({
      appId: cfg.appId,
      redirectUri: cfg.redirectUri,
      state,
      scopes: cfg.scopes,
    });

    return NextResponse.redirect(dialogUrl);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'IG OAuth start failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
