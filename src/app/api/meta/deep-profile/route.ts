import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { buildDeepProfile } from '@/lib/meta/deep-profile';
import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const igUserId = request.nextUrl.searchParams.get('igUserId');

    if (!igUserId) {
      return NextResponse.json({ error: 'igUserId is required' }, { status: 400 });
    }

    // Verify this IG account belongs to the authenticated user
    const rows = await db
      .select()
      .from(instagramAccounts)
      .where(and(eq(instagramAccounts.userId, userId), eq(instagramAccounts.igUserId, igUserId)))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const profile = await buildDeepProfile({ userId, igUserId });
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'IG account not connected') {
      return NextResponse.json({ error: 'IG account not connected' }, { status: 404 });
    }
    console.error('[meta/deep-profile] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load deep profile', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
