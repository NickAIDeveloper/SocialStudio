// POST /api/ads/sync-insights — cron-only (HMAC via verifyBrainSignature).
// For every non-archived ad with an adId: refresh live status and upsert today's
// insight snapshot. Best-effort per ad; a single ad failure never aborts the run.
import { NextResponse } from 'next/server';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAccounts, metaAdInsights } from '@/lib/db/schema';
import { decrypt } from '@/lib/encryption';
import { getAdInsights } from '@/lib/meta/ad-insights';
import { getAd } from '@/lib/meta/ads';
import { buildSnapshotRow } from '@/lib/ads/insights-store';
import { verifyBrainSignature } from '@/lib/brain/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

  const rows = await db
    .select({
      id: metaAds.id,
      userId: metaAds.userId,
      adId: metaAds.adId,
      objective: metaAds.objective,
    })
    .from(metaAds)
    .where(and(isNotNull(metaAds.adId), ne(metaAds.status, 'ARCHIVED')));

  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  let synced = 0;
  for (const [userId, userRows] of byUser) {
    try {
      const [account] = await db
        .select({ accessToken: metaAccounts.accessToken, tokenExpiresAt: metaAccounts.tokenExpiresAt })
        .from(metaAccounts)
        .where(eq(metaAccounts.userId, userId))
        .limit(1);
      if (!account) continue;
      if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) continue;
      const token = decrypt(account.accessToken);

      for (const r of userRows) {
        const adId = r.adId as string;
        try {
          const insights = await getAdInsights(token, [adId], r.objective, 'last_14d');
          const insight = insights[adId];

          const verdict = await getAd(token, adId);
          if (verdict?.effectiveStatus) {
            await db.update(metaAds)
              .set({ status: verdict.effectiveStatus, updatedAt: new Date() })
              .where(eq(metaAds.id, r.id));
          }

          if (insight) {
            const row = buildSnapshotRow(r.id, adId, today, insight);
            await db.insert(metaAdInsights).values(row).onConflictDoUpdate({
              target: [metaAdInsights.metaAdsId, metaAdInsights.snapshotDate],
              set: {
                currency: row.currency,
                spend: row.spend,
                impressions: row.impressions,
                reach: row.reach,
                clicks: row.clicks,
                inlineLinkClicks: row.inlineLinkClicks,
                ctr: row.ctr,
                cpc: row.cpc,
                frequency: row.frequency,
                results: row.results,
                resultType: row.resultType,
                raw: row.raw,
                fetchedAt: new Date(),
              },
            });
            synced++;
          }
        } catch {
          // best-effort per ad
        }
      }
    } catch {
      // best-effort per user
    }
  }

  return NextResponse.json({ success: true, synced });
}
