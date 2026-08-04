import { describe, it, expect } from 'vitest';
import {
  sampleGenome, softmaxWithFloor, jaccardDistance,
  DEFAULT_ENTROPY_CONFIG, type SamplableIngredient,
} from '../sampling';
import type { IngredientScore } from '../scoring';

const ing = (id: string, dimension: string, value: string): SamplableIngredient =>
  ({ id, dimension: dimension as SamplableIngredient['dimension'], value, promptFragment: `do ${value}` });

const AVAILABLE: SamplableIngredient[] = [
  ing('f1', 'framework', 'PAS'), ing('f2', 'framework', 'AIDA'), ing('f3', 'framework', 'BAB'),
  ing('h1', 'hook_shape', 'question'), ing('h2', 'hook_shape', 'number'), ing('h3', 'hook_shape', 'statement'),
];

const score = (ingredientId: string, shrunkScore: number, n = 10): IngredientScore =>
  ({ ingredientId, surface: 'ads', n, meanReward: shrunkScore, shrunkScore, borrowed: false });

// Deterministic RNG so every assertion below is reproducible.
const seeded = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('softmaxWithFloor', () => {
  it('produces a probability distribution', () => {
    const p = softmaxWithFloor([1, 2, 3], 1, 0.05);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('never lets any option fall below the floor', () => {
    // The anti-convergence guarantee. One good early result must not be able
    // to condemn every other ingredient permanently.
    const p = softmaxWithFloor([0, 0, 100], 1, 0.05);
    for (const x of p) expect(x).toBeGreaterThanOrEqual(0.04);
  });

  it('still ranks a stronger option above a weaker one', () => {
    const [weak, strong] = softmaxWithFloor([0, 5], 1, 0.05);
    expect(strong).toBeGreaterThan(weak);
  });

  it('flattens toward uniform as temperature rises', () => {
    const cold = softmaxWithFloor([0, 5], 0.2, 0.01);
    const hot = softmaxWithFloor([0, 5], 10, 0.01);
    expect(Math.abs(hot[0] - hot[1])).toBeLessThan(Math.abs(cold[0] - cold[1]));
  });

  it('handles a single option', () => {
    expect(softmaxWithFloor([3], 1, 0.05)).toEqual([1]);
  });

  it('returns nothing for no options', () => {
    expect(softmaxWithFloor([], 1, 0.05)).toEqual([]);
  });

  it('gives the same distribution regardless of the scale of the scores', () => {
    // Ads scores are click rates (~0.02) and organic scores are reach ratios
    // (~1-3). Without standardising, one temperature cannot serve both: at ad
    // scale every exponent is nearly equal and the sampler would never exploit.
    const adsScale = softmaxWithFloor([0.01, 0.02, 0.03], 1, 0.05);
    const organicScale = softmaxWithFloor([1, 2, 3], 1, 0.05);
    for (let i = 0; i < adsScale.length; i++) {
      expect(adsScale[i]).toBeCloseTo(organicScale[i], 5);
    }
  });

  it('still differentiates strongly at ad-sized score gaps', () => {
    // The concrete failure this guards: raw-score softmax returned ~0.497 vs
    // ~0.503 here, i.e. the scores were ignored entirely.
    const [weak, strong] = softmaxWithFloor([0.02, 0.03], 1, 0.01);
    expect(strong - weak).toBeGreaterThan(0.3);
  });

  it('is uniform when every option scores identically', () => {
    // Standard deviation is zero, so there is no evidence to exploit.
    const p = softmaxWithFloor([0.02, 0.02, 0.02], 1, 0.05);
    for (const x of p) expect(x).toBeCloseTo(1 / 3, 10);
  });
});

describe('jaccardDistance', () => {
  it('is zero for identical sets', () => {
    expect(jaccardDistance(['a', 'b'], ['b', 'a'])).toBe(0);
  });

  it('is one for disjoint sets', () => {
    expect(jaccardDistance(['a'], ['b'])).toBe(1);
  });

  it('is a half when half the recipe overlaps', () => {
    expect(jaccardDistance(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 - 1 / 3);
  });

  it('treats two empty sets as identical', () => {
    expect(jaccardDistance([], [])).toBe(0);
  });
});

describe('sampleGenome — shape', () => {
  it('picks exactly one ingredient per available dimension', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [], index: 1, rng: seeded([0.5]),
    });
    expect(g.ingredients).toHaveLength(2);
    expect(g.ingredients.map(i => i.dimension).sort()).toEqual(['framework', 'hook_shape']);
  });

  it('reports the temperature it used', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [], index: 1, rng: seeded([0.5]),
    });
    expect(g.temperature).toBe(DEFAULT_ENTROPY_CONFIG.temperature);
  });

  it('lists which ingredients used a borrowed prior', () => {
    const scores: IngredientScore[] = [
      { ingredientId: 'f1', surface: 'ads', n: 1, meanReward: 0.1, shrunkScore: 0.5, borrowed: true },
    ];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: [], index: 1, rng: seeded([0.0]),
    });
    // Legibility: "why did it write this?" must always be answerable.
    expect(Array.isArray(g.borrowedPriors)).toBe(true);
  });

  it('returns an empty genome when nothing is available', () => {
    const g = sampleGenome({ available: [], scores: [], recentGenomes: [], index: 1 });
    expect(g.ingredients).toEqual([]);
  });
});

describe('sampleGenome — wildcard slot', () => {
  it('fires on every Nth creative', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [],
      index: DEFAULT_ENTROPY_CONFIG.wildcardEveryN, rng: seeded([0.5]),
    });
    expect(g.wasWildcard).toBe(true);
  });

  it('does not fire on other creatives', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [], index: 1, rng: seeded([0.5]),
    });
    expect(g.wasWildcard).toBe(false);
  });

  it('picks the least-tested ingredient, ignoring score', () => {
    // Anti-neglect: an ingredient with one unlucky early result must not be
    // confused with one that does not work.
    const scores: IngredientScore[] = [
      score('f1', 10, 100), score('f2', 0, 1), score('f3', 9, 50),
    ];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: [],
      index: DEFAULT_ENTROPY_CONFIG.wildcardEveryN, rng: seeded([0.5]),
    });
    expect(g.ingredients.find(i => i.dimension === 'framework')!.id).toBe('f2');
  });

  it('treats a never-tested ingredient as the least tested', () => {
    const scores: IngredientScore[] = [score('f1', 10, 100), score('f2', 5, 3)];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: [],
      index: DEFAULT_ENTROPY_CONFIG.wildcardEveryN, rng: seeded([0.5]),
    });
    expect(g.ingredients.find(i => i.dimension === 'framework')!.id).toBe('f3');
  });
});

describe('sampleGenome — combination novelty', () => {
  it('avoids repeating a recent recipe when an alternative exists', () => {
    const scores = [score('f1', 100), score('h1', 100)];
    const recent = [['f1', 'h1']];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: recent, index: 1, rng: seeded([0.01, 0.99]),
    });
    const ids = g.ingredients.map(i => i.id).sort();
    expect(ids).not.toEqual(['f1', 'h1']);
  });

  it('terminates and returns a valid genome when every recipe is too similar', () => {
    // The bound that matters. An unbounded retry loop that cannot find a novel
    // combination is the same defect shape as the empty-hook god-mode crash:
    // it must degrade to best effort, never hang.
    const onlyOne: SamplableIngredient[] = [ing('f1', 'framework', 'PAS')];
    const recent = Array.from({ length: 10 }, () => ['f1']);
    const g = sampleGenome({
      available: onlyOne, scores: [], recentGenomes: recent, index: 1, rng: seeded([0.5]),
    });
    expect(g.ingredients).toHaveLength(1);
    expect(g.ingredients[0].id).toBe('f1');
  });

  it('reports the novelty distance it achieved', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [['f1', 'h1']], index: 1, rng: seeded([0.5]),
    });
    expect(typeof g.noveltyDistance === 'number' || g.noveltyDistance === null).toBe(true);
  });

  it('only compares against the novelty window, not all history', () => {
    const ancient = Array.from({ length: 50 }, () => ['f1', 'h1']);
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: ancient, index: 1, rng: seeded([0.5]),
    });
    expect(g.ingredients).toHaveLength(2);
  });
});

describe('sampleGenome — convergence (the acceptance test for this spec)', () => {
  it('keeps selecting alternatives even when one ingredient dominates', () => {
    // The property the whole feature exists to guarantee. With one ingredient
    // scored far above every other, a naive argmax sampler would pick it 100%
    // of the time and every ad would end up identical.
    const scores: IngredientScore[] = [
      score('f1', 1000), score('f2', 0.001), score('f3', 0.001),
      score('h1', 1000), score('h2', 0.001), score('h3', 0.001),
    ];
    // Classic LCG. The seed must stay an INTEGER: with a fractional seed,
    // state*9301 never reaches the modulus, the recurrence contracts to the
    // fixed point 0.22009, and the "random" stream becomes a constant — which
    // no pure sampler can turn into variety.
    let rngState = 123456789;
    const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };

    const picks = new Set<string>();
    let dominantCount = 0;
    for (let i = 1; i <= 200; i++) {
      const g = sampleGenome({ available: AVAILABLE, scores, recentGenomes: [], index: i, rng });
      const framework = g.ingredients.find(x => x.dimension === 'framework')!;
      picks.add(framework.id);
      if (framework.id === 'f1') dominantCount++;
    }

    expect(picks.size).toBe(3);            // nothing is permanently condemned
    expect(dominantCount).toBeLessThan(190); // and the leader does not take all
  });

  it('produces a variety of distinct combinations across a run', () => {
    const scores: IngredientScore[] = [score('f1', 100), score('h1', 100)];
    let rngState = 4242;
    const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };

    const recent: string[][] = [];
    const combos = new Set<string>();
    for (let i = 1; i <= 40; i++) {
      const g = sampleGenome({ available: AVAILABLE, scores, recentGenomes: recent, index: i, rng });
      const key = g.ingredients.map(x => x.id).sort().join('+');
      combos.add(key);
      recent.unshift(g.ingredients.map(x => x.id));
    }
    expect(combos.size).toBeGreaterThanOrEqual(4);
  });
});
