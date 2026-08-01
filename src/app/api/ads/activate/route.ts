// POST /api/ads/activate?adId=<meta ad id>
//
// Resumes ONE paused ad. This is the only code path in the app that can cause
// Meta to start spending money, so it is deliberately narrow and noisy:
//
//   - session-authenticated and brand-ownership checked (no HMAC/cron access —
//     nothing automated may ever start spend),
//   - one explicit ad id per call; there is no "activate all",
//   - refuses anything not currently PAUSED, so it cannot resurrect a FAILED
//     ad or re-activate something already running,
//   - refuses when the Meta token is expired, with an actionable message rather
//     than a raw Meta error.
//
// Context: four ads were created successfully on 2026-05-31 and left PAUSED —
// the publish route creates everything paused by design and nothing ever
// resumed them. That is why the account has zero impressions.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, metaAccounts, metaAds } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { describeMetaTokenState } from '@/lib/meta/meta-token';

export const dynamic = 'force-dynamic';

const GRAPH = 'https://graph.facebook.com/v21.0';

export async function POST(req: Request): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const adId = new URL(req.url).searchParams.get('adId');
  if (!adId) return NextResponse.json({ error: 'missing_adId' }, { status: 400 });

  // Ownership: the ad must belong to a brand this user owns.
  const [row] = await db
    .select({ ad: metaAds, brand: brands })
    .from(metaAds)
    .innerJoin(brands, eq(brands.id, metaAds.brandId))
    .where(and(eq(metaAds.adId, adId), eq(metaAds.userId, userId)));
  if (!row) return NextResponse.json({ error: 'ad_not_found' }, { status: 404 });

  // Only ever resume something explicitly PAUSED. A FAILED ad never finished
  // being created, and an ACTIVE one is already spending.
  if (row.ad.status !== 'PAUSED') {
    return NextResponse.json(
      {
        error: 'not_paused',
        message: `This ad is ${row.ad.status}, not PAUSED. Only a paused ad can be activated.`,
      },
      { status: 409 },
    );
  }

  const [account] = await db
    .select()
    .from(metaAccounts)
    .where(eq(metaAccounts.userId, userId));
  if (!account?.accessToken) {
    return NextResponse.json({ error: 'meta_not_connected' }, { status: 400 });
  }

  // Check the token BEFORE calling Meta, so an expired connection produces a
  // clear instruction rather than a raw OAuthException.
  const tokenState = describeMetaTokenState(account.tokenExpiresAt);
  if (tokenState.status === 'expired') {
    return NextResponse.json(
      { error: 'meta_token_expired', message: tokenState.message },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(account.accessToken);
  } catch {
    return NextResponse.json(
      { error: 'meta_token_unreadable', message: 'Reconnect Meta in Settings.' },
      { status: 400 },
    );
  }

  const res = await fetch(`${GRAPH}/${adId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ACTIVE', access_token: accessToken }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };

  if (!res.ok) {
    const message = body.error?.code === 190
      ? 'Your Meta connection has expired — reconnect Meta in Settings.'
      : (body.error?.message ?? `Meta rejected the change (HTTP ${res.status}).`);
    await db.update(metaAds).set({ lastError: message, updatedAt: new Date() }).where(eq(metaAds.id, row.ad.id));
    return NextResponse.json({ error: 'activate_failed', message }, { status: 400 });
  }

  await db
    .update(metaAds)
    .set({ status: 'ACTIVE', lastError: null, updatedAt: new Date() })
    .where(eq(metaAds.id, row.ad.id));

  return NextResponse.json({
    status: 'ok',
    adId,
    brand: row.brand.slug,
    message: 'Ad is now ACTIVE and will begin spending against its ad set budget.',
  });
}
