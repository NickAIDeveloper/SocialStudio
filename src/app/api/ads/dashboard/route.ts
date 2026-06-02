// GET /api/ads/dashboard[?refresh=1] — ads + latest insight snapshot + trend +
// signals + Ads Manager link. Best-effort; never 500s on a Meta failure.
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAccounts, metaAdInsights } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { buildAdsManagerUrl } from '@/lib/meta/ads';
import { getAdInsights, type AdInsight } from '@/lib/meta/ad-insights';
import { buildSnapshotRow, computeTrend } from '@/lib/ads/insights-store';
import { evaluateSignals } from '@/lib/ads/signals';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    const refresh = new URL(req.url).searchParams.get('refresh') === '1';

    const rows = await db
      .select()
      .from(metaAds)
      .where(eq(metaAds.userId, userId))
      .orderBy(desc(metaAds.createdAt))
      .limit(50);

    if (refresh) {
      try {
        const [account] = await db
          .select({ accessToken: metaAccounts.accessToken, tokenExpiresAt: metaAccounts.tokenExpiresAt })
          .from(metaAccounts).where(eq(metaAccounts.userId, userId)).limit(1);
        if (account && !(account.tokenExpiresAt && account.tokenExpiresAt <= new Date())) {
          const token = decrypt(account.accessToken);
          const today = new Date().toISOString().slice(0, 10);
          for (const r of rows) {
            if (!r.adId) continue;
            const res = await getAdInsights(token, [r.adId], r.objective, 'last_14d');
            const insight = res[r.adId];
            if (!insight) continue;
            const row = buildSnapshotRow(r.id, r.adId, today, insight);
            await db.insert(metaAdInsights).values(row).onConflictDoUpdate({
              target: [metaAdInsights.metaAdsId, metaAdInsights.snapshotDate],
              set: {
                currency: row.currency, spend: row.spend, impressions: row.impressions,
                reach: row.reach, clicks: row.clicks, inlineLinkClicks: row.inlineLinkClicks,
                ctr: row.ctr, cpc: row.cpc, frequency: row.frequency, results: row.results,
                resultType: row.resultType, raw: row.raw, fetchedAt: new Date(),
              },
            });
          }
        }
      } catch {
        // best-effort — fall through to render stored data
      }
    }

    const ads = await Promise.all(rows.map(async (r) => {
      const snaps = await db
        .select()
        .from(metaAdInsights)
        .where(eq(metaAdInsights.metaAdsId, r.id))
        .orderBy(desc(metaAdInsights.snapshotDate))
        .limit(2);
      const latest = snaps[0] ?? null;
      const prior = snaps[1] ?? null;
      const draft = (r.draft ?? {}) as Record<string, unknown>;

      const insight: AdInsight | null = latest ? {
        spend: Number(latest.spend), impressions: latest.impressions, reach: latest.reach,
        clicks: latest.clicks, inlineLinkClicks: latest.inlineLinkClicks, ctr: Number(latest.ctr),
        cpc: Number(latest.cpc), frequency: Number(latest.frequency), results: latest.results,
        resultType: latest.resultType ?? 'link_click', currency: latest.currency,
      } : null;

      const signals = insight ? evaluateSignals(insight, r.objective)
        : { verdict: 'gathering' as const, reasons: ['No data yet.'], tips: [] };

      return {
        id: r.id,
        objective: r.objective,
        status: r.status,
        createdAt: r.createdAt,
        adsManagerUrl: r.campaignId ? buildAdsManagerUrl(r.adAccountId, r.campaignId) : null,
        lastError: r.lastError,
        preview: {
          headline: draft.headline ?? null,
          primaryText: draft.primaryText ?? null,
          imageUrl: draft.imageUrl ?? null,
          thumbnailUrl: draft.thumbnailUrl ?? null,
          mediaType: draft.mediaType ?? 'image',
          cta: draft.cta ?? 'LEARN_MORE',
          destinationUrl: draft.destinationUrl ?? null,
        },
        insight,
        ctrTrend: insight ? computeTrend(insight.ctr, prior ? Number(prior.ctr) : null) : null,
        signals,
      };
    }));

    return NextResponse.json({ success: true, ads });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
