// GET /api/ads/dashboard[?refresh=1] — ads + latest insight snapshot + trend +
// signals + Ads Manager link. Best-effort; never 500s on a Meta failure.
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAccounts, metaAdInsights } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { buildAdsManagerUrl, getAdLiveStatus } from '@/lib/meta/ads';
import { getAdInsights, type AdInsight } from '@/lib/meta/ad-insights';
import { buildSnapshotRow, computeTrend } from '@/lib/ads/insights-store';
import { evaluateSignals } from '@/lib/ads/signals';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    const refresh = new URL(req.url).searchParams.get('refresh') === '1';

    let rows = await db
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
          // Refresh each ad concurrently — every getAdInsights call has its own
          // 8s internal timeout, so a sequential loop over many ads would blow
          // the function timeout. Each ad's work is isolated in a try/catch so a
          // single ad failure never rejects the Promise.all.
          await Promise.all(rows.map(async (r) => {
            try {
              if (!r.adId) return;
              // Reconcile status with Meta: pick up real effective_status and, for
              // ads deleted in Ads Manager, drop them to ARCHIVED so the queue stops
              // showing a phantom PAUSED. 'unknown' leaves the stored status as-is.
              const live = await getAdLiveStatus(token, r.adId);
              if (live.kind === 'status' && live.effectiveStatus) {
                await db.update(metaAds)
                  .set({ status: live.effectiveStatus, updatedAt: new Date() })
                  .where(eq(metaAds.id, r.id));
              } else if (live.kind === 'deleted') {
                await db.update(metaAds)
                  .set({ status: 'ARCHIVED', updatedAt: new Date() })
                  .where(eq(metaAds.id, r.id));
              }
              const res = await getAdInsights(token, [r.adId], r.objective, 'last_14d');
              const insight = res[r.adId];
              if (!insight) return;
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
            } catch {
              // best-effort — skip this ad, keep refreshing the rest
            }
          }));
        }
      } catch {
        // best-effort — fall through to render stored data
      }
      // Re-read so the rendered cards reflect any status updates from the refresh.
      rows = await db
        .select()
        .from(metaAds)
        .where(eq(metaAds.userId, userId))
        .orderBy(desc(metaAds.createdAt))
        .limit(50);
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
