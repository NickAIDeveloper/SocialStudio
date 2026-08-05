import { describe, it, expect } from 'vitest';
import {
  adsReward, organicReward, organicEngagementScore, scoreIngredients,
  SHRINKAGE_K, LIKE_WEIGHT,
  type Observation, type IngredientScore,
} from '../scoring';

const obs = (ingredientId: string, reward: number, surface: 'ads' | 'organic' = 'ads'): Observation =>
  ({ ingredientId, surface, reward });

describe('reward definitions', () => {
  it('computes ads reward as click-through rate', () => {
    expect(adsReward(50, 1000)).toBeCloseTo(0.05);
  });

  it('returns null for ads with no impressions rather than dividing by zero', () => {
    expect(adsReward(0, 0)).toBeNull();
  });

  it('computes organic reward relative to the brand median composite score', () => {
    // NOT reach/followers: follower counts are not linked to brands, and raw
    // reach would make every pacebrain ingredient (median 14) beat every
    // affectly one (median 3) regardless of the creative. The composite
    // score (reach + LIKE_WEIGHT*likes) is normalised the same way.
    expect(organicReward(28, 14)).toBeCloseTo(2);
    expect(organicReward(3, 3)).toBeCloseTo(1);
  });

  it('returns 1.0 for a post exactly at its brand median', () => {
    expect(organicReward(20, 20)).toBeCloseTo(1.0);
  });

  it('returns null when the brand has no history to normalise against', () => {
    expect(organicReward(10, 0)).toBeNull();
  });
});

describe('organicEngagementScore', () => {
  it('weights likes at LIKE_WEIGHT relative to reach', () => {
    // Hardcoded to 5, not LIKE_WEIGHT*2: this must fail if LIKE_WEIGHT is
    // ever changed to something else without an intentional test update.
    expect(LIKE_WEIGHT).toBe(5);
    expect(organicEngagementScore(10, 2)).toBe(20);
  });

  it('scores a post with reach and no likes below one with equal reach and several likes', () => {
    const noLikes = organicEngagementScore(20, 0);
    const someLikes = organicEngagementScore(20, 3);
    expect(someLikes).toBeGreaterThan(noLikes);
  });

  it('is unaffected by comments, shares or saves — the signature has no room for them', () => {
    // Regression guard: production data shows comments, shares and saves are
    // zero or near-zero on every post (see scoring.ts header), and
    // creative-stats.ts already learned this lesson once — scoreOutcome
    // weights saves at 20x and that weighting has never contributed
    // anything because the metric is always zero. Two analytics rows
    // differing ONLY in those fields must score identically.
    type Analytics = { reach: number; likes: number; comments: number; shares: number; saves: number };
    const quiet: Analytics = { reach: 20, likes: 3, comments: 0, shares: 0, saves: 0 };
    const noisy: Analytics = { reach: 20, likes: 3, comments: 5, shares: 5, saves: 5 };
    expect(organicEngagementScore(quiet.reach, quiet.likes)).toBe(
      organicEngagementScore(noisy.reach, noisy.likes),
    );
  });
});

describe('scoreIngredients — shrinkage', () => {
  it('pulls a thin estimate toward the prior', () => {
    // One observation at 10x the global mean must not be reported as 10x.
    const scored = scoreIngredients([
      obs('rare', 1.0),
      ...Array.from({ length: 20 }, () => obs('common', 0.1)),
    ]);
    const rare = scored.find(s => s.ingredientId === 'rare')!;
    expect(rare.meanReward).toBeCloseTo(1.0);
    expect(rare.shrunkScore).toBeLessThan(0.5);
  });

  it('lets a well-sampled estimate dominate its prior', () => {
    const scored = scoreIngredients([
      ...Array.from({ length: 40 }, () => obs('proven', 1.0)),
      ...Array.from({ length: 40 }, () => obs('weak', 0.0)),
    ]);
    const proven = scored.find(s => s.ingredientId === 'proven')!;
    expect(proven.shrunkScore).toBeGreaterThan(0.9);
  });

  it('reports the sample count it used', () => {
    const scored = scoreIngredients([obs('a', 0.2), obs('a', 0.4)]);
    expect(scored.find(s => s.ingredientId === 'a')!.n).toBe(2);
  });

  it('shrinks exactly per the documented formula', () => {
    // (n*mean + k*prior) / (n + k). A single-ingredient fixture can't pin this:
    // with one ingredient the global mean IS that ingredient's own mean, so
    // prior == m and the formula collapses to m regardless of k — the test
    // would pass even with the shrinkage deleted. Using two ingredients so the
    // prior differs from 'rare's own mean:
    //   globalMean = (1*1.0 + 20*0.1) / 21 = 3/21
    //   rare.shrunkScore = (1*1.0 + 5*(3/21)) / (1+5) = (12/7) / 6 = 2/7
    const scored = scoreIngredients([
      obs('rare', 1.0),
      ...Array.from({ length: 20 }, () => obs('common', 0.1)),
    ]);
    const rare = scored.find(s => s.ingredientId === 'rare')!;
    expect(rare.shrunkScore).toBeCloseTo(2 / 7);
    expect(SHRINKAGE_K).toBe(5);
  });
});

describe('scoreIngredients — borrowed priors', () => {
  const organic: IngredientScore[] = [
    { ingredientId: 'x', surface: 'organic', n: 30, meanReward: 2.0, shrunkScore: 2.0, borrowed: false },
  ];

  it('borrows the organic score as the prior when ad data is thin', () => {
    const scored = scoreIngredients([obs('x', 0.1)], { organicScores: organic });
    const x = scored.find(s => s.ingredientId === 'x')!;
    expect(x.borrowed).toBe(true);
    // Pulled up toward the organic prior rather than sitting at its own mean.
    expect(x.shrunkScore).toBeGreaterThan(0.1);
  });

  it('lets the borrowed influence fade as real ad data arrives', () => {
    const thin = scoreIngredients([obs('x', 0.1)], { organicScores: organic });
    const thick = scoreIngredients(
      Array.from({ length: 50 }, () => obs('x', 0.1)),
      { organicScores: organic },
    );
    const thinX = thin.find(s => s.ingredientId === 'x')!.shrunkScore;
    const thickX = thick.find(s => s.ingredientId === 'x')!.shrunkScore;
    // No threshold, no mode switch: the formula does this on its own.
    expect(thickX).toBeLessThan(thinX);
    expect(thickX).toBeCloseTo(0.1, 1);
  });

  it('does not mark a score borrowed when no organic score exists', () => {
    const scored = scoreIngredients([obs('y', 0.1)], { organicScores: organic });
    expect(scored.find(s => s.ingredientId === 'y')!.borrowed).toBe(false);
  });

  it('never borrows for the organic surface itself', () => {
    const scored = scoreIngredients([obs('x', 1.5, 'organic')], { organicScores: organic });
    expect(scored.find(s => s.ingredientId === 'x')!.borrowed).toBe(false);
  });
});

describe('scoreIngredients — edges', () => {
  it('returns nothing for no observations', () => {
    expect(scoreIngredients([])).toEqual([]);
  });

  it('scores each surface separately', () => {
    const scored = scoreIngredients([obs('a', 0.1, 'ads'), obs('a', 2.0, 'organic')]);
    expect(scored).toHaveLength(2);
    expect(scored.map(s => s.surface).sort()).toEqual(['ads', 'organic']);
  });
});
