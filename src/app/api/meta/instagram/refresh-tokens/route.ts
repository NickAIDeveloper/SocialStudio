// POST /api/meta/instagram/refresh-tokens
//
// Daily sweep that proactively renews every connected Instagram long-lived
// token that is inside its pre-expiry window. This is the durable guarantee
// behind autopilot: as long as this runs at least once every ~7 days, no IG
// token ever expires, so god-mode / the deep profile never dies with a
// "Session has expired" 400.
//
// HMAC-authenticated (server-to-server) — called from scripts/brain/run-daily.mjs
// before the per-brand loop, so a renewed token is in place for the snapshot and
// autopilot steps that follow.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { instagramAccounts } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { getFreshIgToken } from '@/lib/meta/ig-token';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const accounts = await db
    .select({
      id: instagramAccounts.id,
      igUsername: instagramAccounts.igUsername,
      accessToken: instagramAccounts.accessToken,
      tokenExpiresAt: instagramAccounts.tokenExpiresAt,
    })
    .from(instagramAccounts);

  let refreshed = 0;
  let skipped = 0;
  const failures: Array<{ id: string; igUsername: string | null }> = [];

  // Sequential, not parallel: token counts are tiny and serial avoids hammering
  // Meta's refresh endpoint. Each call is self-contained and never throws.
  for (const acct of accounts) {
    try {
      const res = await getFreshIgToken(acct);
      if (res.refreshed) refreshed += 1;
      else skipped += 1;
    } catch (err) {
      // getFreshIgToken swallows refresh errors, but guard the loop regardless
      // so one bad row can't abort the sweep for the others.
      console.warn(
        `[refresh-tokens] unexpected error for ${acct.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      failures.push({ id: acct.id, igUsername: acct.igUsername });
    }
  }

  return NextResponse.json({
    status: 'ok',
    total: accounts.length,
    refreshed,
    skipped,
    failures,
  });
}
