import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt, encrypt } from '@/lib/encryption';
import {
  getIgMe,
  getIgMedia,
  getIgAccountInsights,
  getIgMediaInsights,
  refreshIgLongLivedToken,
  shouldRefreshIgToken,
} from '@/lib/meta/instagram-client';

// GET /api/meta/instagram/insights?igUserId=...
//
// Returns a bundle: profile + account-level insights + recent media with
// per-media insights. Opportunistically refreshes the token if it has
// <7 days left so the user doesn't hit a surprise disconnect.
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const igUserId = req.nextUrl.searchParams.get('igUserId');
    if (!igUserId) {
      return NextResponse.json({ error: 'igUserId required' }, { status: 400 });
    }

    const rows = await db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.userId, userId),
          eq(instagramAccounts.igUserId, igUserId)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: 'IG account not connected' }, { status: 404 });
    }

    let token = decrypt(row.accessToken);

    // Refresh-before-read if token is near expiry. Don't fail the request if
    // refresh itself errors — fall through with the existing token; the real
    // read below will surface the auth error if it's actually dead.
    if (shouldRefreshIgToken(row.tokenExpiresAt)) {
      try {
        const refreshed = await refreshIgLongLivedToken(token);
        token = refreshed.access_token;
        await db
          .update(instagramAccounts)
          .set({
            accessToken: encrypt(refreshed.access_token),
            tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
            updatedAt: new Date(),
          })
          .where(eq(instagramAccounts.id, row.id));
      } catch {
        // Swallow: surfacing the downstream 401 gives a better error to the user.
      }
    }

    // Fan out the three reads in parallel. The "recent 12 posts" cap is a
    // UI-friendly default — enough to see engagement trends, cheap enough
    // that N+1 media-insight calls don't blow the rate-limit budget.
    const [profile, accountInsights, mediaList] = await Promise.all([
      getIgMe(token),
      getIgAccountInsights(token, { igUserId }).catch(() => ({ data: [] })),
      getIgMedia(token, 12),
    ]);

    // Per-media insights in parallel. Wrap each so one 400 on a Story
    // doesn't kill the whole response.
    const mediaInsights = await Promise.all(
      mediaList.map(async (m) => {
        try {
          const res = await getIgMediaInsights(token, m.id);
          return { mediaId: m.id, data: res.data };
        } catch {
          return { mediaId: m.id, data: [] };
        }
      })
    );

    return NextResponse.json({
      data: {
        profile,
        accountInsights: accountInsights.data,
        media: mediaList.map((m) => {
          const ins = mediaInsights.find((x) => x.mediaId === m.id);
          return { ...m, insights: ins?.data ?? [] };
        }),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : 'Failed to load IG insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
