import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { searchAdGeoLocations } from '@/lib/meta/client';

// GET /api/meta/geo-search?q=<query>&types=<csv>
// Typeahead for Meta ad geo locations (cities by default), used by the ad
// builder's audience step. Returns { success: true, locations: [] } for short
// queries or when Meta returns nothing — an empty list is a valid state the UI
// handles gracefully (mirrors /api/meta/apps). No ad account is needed for the
// /search endpoint, only a valid user access token.
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, locations: [] });
    }
    const typesParam = request.nextUrl.searchParams.get('types');
    const types = typesParam
      ? typesParam.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const [account] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, userId))
      .limit(1);

    if (!account) {
      return NextResponse.json({ success: false, tokenExpired: true, locations: [] });
    }

    if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) {
      return NextResponse.json({ success: false, tokenExpired: true, locations: [] });
    }

    const accessToken = decrypt(account.accessToken);
    const locations = await searchAdGeoLocations(accessToken, q, types);

    return NextResponse.json({ success: true, locations });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to search geo locations' },
      { status: 500 }
    );
  }
}
