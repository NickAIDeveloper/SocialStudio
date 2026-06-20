import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import {
  getIgMe,
  getIgMedia,
  getIgAccountInsights,
  getIgMediaInsights,
} from '@/lib/meta/instagram-client';
import { getFreshIgToken } from '@/lib/meta/ig-token';

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

    // Refresh-before-read via the shared helper (renews if near expiry,
    // persists, and never throws — a dead token surfaces in the reads below).
    const { token } = await getFreshIgToken(row);

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
