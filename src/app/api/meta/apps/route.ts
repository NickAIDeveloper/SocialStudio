import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { getAdvertisableApps } from '@/lib/meta/client';

// GET /api/meta/apps
// Returns the list of promotable iOS applications attached to the user's
// selected ad account. Returns { success: true, apps: [] } rather than 500
// when Meta returns an error — an empty list is a valid "no apps configured"
// state that the UI handles gracefully.
export async function GET() {
  try {
    const userId = await getUserId();

    const [account] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, userId))
      .limit(1);

    if (!account) {
      return NextResponse.json(
        { error: 'Meta account not connected' },
        { status: 400 }
      );
    }

    // Prefer the explicitly selected ad account; fall back to the first asset.
    const assets = account.assets as
      | { adAccounts?: Array<{ id: string }> }
      | null;
    const adAccountId =
      account.selectedAdAccountId ??
      assets?.adAccounts?.[0]?.id ??
      null;

    if (!adAccountId) {
      return NextResponse.json({ success: true, apps: [] });
    }

    const accessToken = decrypt(account.accessToken);

    let apps: Awaited<ReturnType<typeof getAdvertisableApps>> = [];
    try {
      apps = await getAdvertisableApps(accessToken, adAccountId);
    } catch {
      // Meta may reject the call if the token lacks ads_management or if the
      // account has no apps. Return an empty list — the UI shows a guidance
      // note rather than crashing.
      apps = [];
    }

    return NextResponse.json({ success: true, apps });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch promotable apps' },
      { status: 500 }
    );
  }
}
