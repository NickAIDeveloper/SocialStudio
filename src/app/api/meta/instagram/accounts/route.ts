import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

// GET /api/meta/instagram/accounts
// Returns the list of connected IG accounts for the current user.
// Never returns the access_token — only metadata safe for the client.
export async function GET() {
  try {
    const userId = await getUserId();
    const rows = await db
      .select({
        id: instagramAccounts.id,
        igUserId: instagramAccounts.igUserId,
        igUsername: instagramAccounts.igUsername,
        igAccountType: instagramAccounts.igAccountType,
        name: instagramAccounts.name,
        profilePictureUrl: instagramAccounts.profilePictureUrl,
        tokenExpiresAt: instagramAccounts.tokenExpiresAt,
        connectedAt: instagramAccounts.connectedAt,
      })
      .from(instagramAccounts)
      .where(eq(instagramAccounts.userId, userId));

    return NextResponse.json({ data: rows });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : 'Failed to load IG accounts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/meta/instagram/accounts?igUserId=...
// Removes a single connection. Takes igUserId rather than row id because
// the UI already has it and it's stable across reconnects.
export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserId();
    const igUserId = req.nextUrl.searchParams.get('igUserId');
    if (!igUserId) {
      return NextResponse.json({ error: 'igUserId required' }, { status: 400 });
    }

    await db
      .delete(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.userId, userId),
          eq(instagramAccounts.igUserId, igUserId)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : 'Failed to disconnect';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
