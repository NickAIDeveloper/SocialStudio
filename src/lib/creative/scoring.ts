// src/lib/creative/scoring.ts
//
// Turns raw outcomes into per-ingredient scores. Pure: no DB, no network, so
// the rules can be tested exhaustively before anything acts on them — the same
// discipline as lib/ads/agent-policy.ts.
//
// The hard problem here is SAMPLE SIZE, not maths. Ads have never delivered and
// organic posts reach single or low double digits, so almost every estimate
// starts life at n=1 or n=2. A raw mean over two observations is noise wearing
// a number's clothing, and a system that chased it would be worse than having
// no loop at all.

export type Surface = 'ads' | 'organic';

export interface Observation {
  ingredientId: string;
  surface: Surface;
  reward: number;
}

export interface IngredientScore {
  ingredientId: string;
  surface: Surface;
  n: number;
  meanReward: number;
  // What the sampler uses. Shrunk toward a prior in proportion to how little
  // data backs it.
  shrunkScore: number;
  // True when the prior came from the other surface (organic informing ads).
  borrowed: boolean;
}

// How many "prior observations" the prior is worth. At k=5, two observations
// barely move off the prior and thirty dominate it. Tunable, in the same style
// as the benchmark constants in lib/ads/signals.ts.
export const SHRINKAGE_K = 5;

// Ads: click-through rate. Deliberately NOT cost per result — cost folds in
// auction pressure, audience size and bid competition, none of which the copy
// caused, so attributing them to a framework teaches a superstition.
// agent-policy.ts keeps cost-per-result for budget decisions.
export function adsReward(clicks: number, impressions: number): number | null {
  if (impressions <= 0) return null;
  return clicks / impressions;
}

// Organic composite: reach plus a like bonus.
//
// Measured across all 63 production posts: comments, shares and saves are
// zero or near-zero on every post on both brands (pacebrain and affectly),
// so including them adds noise and no signal — creative-stats.ts already
// learned this once (scoreOutcome weights saves at 20x and that weighting
// has contributed nothing). Views are excluded for now too: they were only
// persisted starting 2026-07-31, so on older posts they'd read as a failure
// rather than as missing data. Revisit once view history fills in. Likes are
// included because they genuinely vary on pacebrain (0-4, median 2).
//
// A like is a deliberate act; an impression is not. Weighting a like at 5
// makes engagement and distribution comparable in size at current volume
// (pacebrain median reach 14, median likes 2 -> 14 vs 10), so neither term
// swamps the other.
export const LIKE_WEIGHT = 5;

export function organicEngagementScore(reach: number, likes: number): number {
  return reach + LIKE_WEIGHT * likes;
}

// Organic: composite score relative to the brand's OWN median composite
// score.
//
// Not reach/followers, as the spec first proposed: follower counts exist only
// on scraped_accounts rows with brand_id NULL, so there is no reliable join.
// And scores pool across brands, so a raw composite would rank every
// ingredient pacebrain uses (median reach 14) above every ingredient affectly
// uses (median reach 3) regardless of the creative. This normalises that
// away for free.
export function organicReward(score: number, brandMedianScore: number): number | null {
  if (brandMedianScore <= 0) return null;
  return score / brandMedianScore;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function scoreIngredients(
  observations: readonly Observation[],
  opts: { organicScores?: readonly IngredientScore[] } = {},
): IngredientScore[] {
  if (observations.length === 0) return [];

  const organicById = new Map(
    (opts.organicScores ?? [])
      .filter(s => s.surface === 'organic')
      .map(s => [s.ingredientId, s]),
  );

  const out: IngredientScore[] = [];

  for (const surface of ['ads', 'organic'] as const) {
    const forSurface = observations.filter(o => o.surface === surface);
    if (forSurface.length === 0) continue;

    // The fallback prior: this surface's own global mean.
    const globalMean = mean(forSurface.map(o => o.reward));

    const grouped = new Map<string, number[]>();
    for (const o of forSurface) {
      const list = grouped.get(o.ingredientId) ?? [];
      list.push(o.reward);
      grouped.set(o.ingredientId, list);
    }

    for (const [ingredientId, rewards] of grouped) {
      const n = rewards.length;
      const m = mean(rewards);

      // Cold start is only a CHOICE OF PRIOR — no special case, no mode flag.
      // Ads with thin data borrow that ingredient's organic belief; as n grows
      // the formula fades the borrowed influence to nothing on its own.
      //
      // The organic score is NOT injected as an absolute prior mean — organic
      // reward lives on a "times the brand's median reach" scale (values
      // cluster around 1-2), while ads reward is a click-through rate (values
      // cluster around 0.01-0.1). Plugging organic's raw shrunkScore straight
      // into the ads formula would make the prior's absolute contribution
      // dominate at any realistic k, so it would never fade back to the ads
      // mean as ad data accrued. Instead the organic score is read as a
      // RELATIVE multiplier on the ads baseline: "this ingredient did ~2x its
      // surface's median elsewhere, so expect ~2x this surface's own mean
      // here" — consistent with what organicReward() already measures.
      const organic = surface === 'ads' ? organicById.get(ingredientId) : undefined;
      const borrowed = organic != null;
      const prior = borrowed ? globalMean * organic!.shrunkScore : globalMean;

      out.push({
        ingredientId,
        surface,
        n,
        meanReward: m,
        shrunkScore: (n * m + SHRINKAGE_K * prior) / (n + SHRINKAGE_K),
        borrowed,
      });
    }
  }

  return out;
}
