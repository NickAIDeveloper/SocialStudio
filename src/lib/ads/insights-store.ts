// src/lib/ads/insights-store.ts
// Pure helpers for persisting + comparing ad insight snapshots. The actual DB
// upsert is performed by callers (Drizzle .onConflictDoUpdate on the
// (meta_ads_id, snapshot_date) unique index) using buildSnapshotRow's output.
import type { AdInsight } from '@/lib/meta/ad-insights';

export interface SnapshotRow {
  metaAdsId: string;
  adId: string;
  snapshotDate: string; // 'YYYY-MM-DD' (UTC)
  currency: string | null;
  spend: string;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: string;
  cpc: string;
  frequency: string;
  results: number;
  resultType: string;
  raw: AdInsight;
}

export function buildSnapshotRow(
  metaAdsId: string,
  adId: string,
  snapshotDate: string,
  insight: AdInsight,
): SnapshotRow {
  return {
    metaAdsId,
    adId,
    snapshotDate,
    currency: insight.currency,
    spend: String(insight.spend),
    impressions: insight.impressions,
    reach: insight.reach,
    clicks: insight.clicks,
    inlineLinkClicks: insight.inlineLinkClicks,
    ctr: String(insight.ctr),
    cpc: String(insight.cpc),
    frequency: String(insight.frequency),
    results: insight.results,
    resultType: insight.resultType,
    raw: insight,
  };
}

export interface Trend {
  direction: 'up' | 'down' | 'flat';
  delta: number | null;
}

export function computeTrend(current: number, prior: number | null): Trend {
  if (prior == null) return { direction: 'flat', delta: null };
  const delta = current - prior;
  if (Math.abs(delta) < 1e-9) return { direction: 'flat', delta: 0 };
  return { direction: delta > 0 ? 'up' : 'down', delta };
}
