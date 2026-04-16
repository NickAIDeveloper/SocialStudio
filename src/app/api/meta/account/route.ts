import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

// GET /api/meta/account
// Returns the current user's linked Meta account (without the access token).
export async function GET() {
  try {
    const userId = await getUserId();

    const [row] = await db
      .select({
        fbUserId: metaAccounts.fbUserId,
        fbUserName: metaAccounts.fbUserName,
        scopes: metaAccounts.scopes,
        assets: metaAccounts.assets,
        selectedAdAccountId: metaAccounts.selectedAdAccountId,
        tokenExpiresAt: metaAccounts.tokenExpiresAt,
        connectedAt: metaAccounts.connectedAt,
      })
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, userId))
      .limit(1);

    return NextResponse.json({ success: true, data: row ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch Meta account' },
      { status: 500 }
    );
  }
}

// PATCH /api/meta/account
// Update fields that the user controls client-side. For now: selectedAdAccountId.
export async function PATCH(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = (await req.json()) as { selectedAdAccountId?: string | null };

    const update: Partial<typeof metaAccounts.$inferInsert> = {
      updatedAt: new Date(),
    };
    if ('selectedAdAccountId' in body) {
      update.selectedAdAccountId = body.selectedAdAccountId ?? null;
    }

    await db
      .update(metaAccounts)
      .set(update)
      .where(eq(metaAccounts.userId, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to update Meta account' },
      { status: 500 }
    );
  }
}

// DELETE /api/meta/account
// Unlinks the Meta account (local only — does not revoke the token on Meta's side).
export async function DELETE() {
  try {
    const userId = await getUserId();
    await db.delete(metaAccounts).where(eq(metaAccounts.userId, userId));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to disconnect Meta account' },
      { status: 500 }
    );
  }
}
