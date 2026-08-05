// Post-level leaderboard for the paid (Meta ads) surface.
//
// Ads rank by COST PER RESULT ascending, because that is the question a
// marketer with a budget is actually asking. Ads that have not produced a
// result yet cannot be costed, so they sit below the ones that have, ordered
// by IMPRESSIONS (times shown, including repeats) rather than reach.
//
// Every figure here comes from the newest insights snapshot, which is a
// TRAILING 14-DAY aggregate, not lifetime. See api/creative/leaderboard.
//
// Pure, no I/O.

import { formatCount } from '@/lib/format-number';

export interface LeaderboardAdInput {
  adId: string;
  label: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
  resultType: string | null;
}

export interface LeaderboardAdRow {
  adId: string;
  rank: number;
  label: string;
  spend: number;
  impressions: number;
  reach: number;
  results: number;
  resultType: string | null;
  /**
   * Spend divided by results. Null until the ad has produced a result, which
   * is load-bearing: it sinks the ad in the sort and switches the verdict
   * sentence. Do not "simplify" it to 0.
   */
  costPerResult: number | null;
  /** Clicks per impression. Never null: rankAds drops unshown ads first. */
  clickRate: number;
}

/** "link_click" reads as machinery; "link click" reads as English. */
export function humanResultType(resultType: string | null): string {
  const cleaned = String(resultType ?? '').replace(/_/g, ' ').trim();
  return cleaned || 'result';
}

export function rankAds(inputs: readonly LeaderboardAdInput[]): LeaderboardAdRow[] {
  return inputs
    .filter((a) => a.impressions > 0)
    .map((a) => ({
      adId: a.adId,
      rank: 0,
      label: a.label,
      spend: a.spend,
      impressions: a.impressions,
      reach: a.reach,
      results: a.results,
      resultType: a.resultType,
      costPerResult: a.results > 0 ? a.spend / a.results : null,
      clickRate: a.clicks / a.impressions,
    }))
    .sort((a, b) => {
      // Costed ads first; among them, cheapest wins.
      if (a.costPerResult === null && b.costPerResult === null) {
        return b.impressions - a.impressions;
      }
      if (a.costPerResult === null) return 1;
      if (b.costPerResult === null) return -1;
      return a.costPerResult - b.costPerResult;
    })
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

export function buildAdsVerdict(rows: readonly LeaderboardAdRow[]): string | null {
  if (rows.length === 0) return null;

  const best = rows[0];
  if (best.costPerResult !== null) {
    return `Your cheapest result so far is ${best.label} at $${best.costPerResult.toFixed(2)} per ${humanResultType(best.resultType)}. Put more budget there.`;
  }

  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  return `Your ads have been seen ${formatCount(impressions)} times but have produced no results yet.`;
}
