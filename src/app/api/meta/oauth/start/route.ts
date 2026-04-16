import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { getUserId } from '@/lib/auth-helpers';
import { buildAuthDialogUrl, type BuildAuthUrlParams } from '@/lib/meta/client';
import { getMetaConfig } from '@/lib/meta/config';

// GET /api/meta/oauth/start
// Generates a CSRF state token, stashes it in an httpOnly cookie, and
// redirects the user to Facebook's OAuth dialog.
export async function GET() {
  try {
    // Auth check — user must be logged in to link a Meta account to their user row.
    await getUserId();

    const cfg = getMetaConfig();
    const state = randomBytes(32).toString('hex');

    const cookieStore = await cookies();
    cookieStore.set('meta_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 min — OAuth round-trip should be seconds, not hours
      path: '/',
    });

    const params: BuildAuthUrlParams = {
      appId: cfg.appId,
      redirectUri: cfg.redirectUri,
      state,
      scopes: cfg.scopes,
    };

    return NextResponse.redirect(buildAuthDialogUrl(params));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'OAuth start failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
