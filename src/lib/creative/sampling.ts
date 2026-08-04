// src/lib/creative/sampling.ts
//
// Chooses the ingredients for the next creative. Pure, and the RNG is injected
// rather than taken from Math.random, so every rule below is deterministically
// testable — including the convergence property the whole feature exists for.
//
// Three separate mechanisms, because there are three separate failure modes:
//
//   1. CONVERGENCE      — the sampler re-picks the same winner until every ad
//                         is identical. Fixed by weighted sampling with a
//                         probability floor: losing odds shrink, never vanish.
//   2. RECOMBINATION    — ingredients vary but the same RECIPE recurs. Fixed by
//      STALENESS          rejecting candidates too close to recent genomes.
//   3. NEGLECT          — an ingredient with one unlucky early result is never
//                         retried and looks like a failure forever. Fixed by a
//                         forced wildcard slot that samples the least-tested.
//
// A fourth failure mode — the vocabulary itself never growing — is NOT solved
// here. That needs outside DNA and is spec 2.

import type { CreativeDimension } from './vocabulary';
import type { IngredientScore, Surface } from './scoring';

export interface SamplableIngredient {
  id: string;
  dimension: CreativeDimension;
  value: string;
  promptFragment: string;
}

export interface EntropyConfig {
  temperature: number;
  floorProbability: number;
  wildcardEveryN: number;
  noveltyWindow: number;
  noveltyMinDistance: number;
  maxResampleAttempts: number;
}

export const DEFAULT_ENTROPY_CONFIG: EntropyConfig = {
  temperature: 1.0,
  floorProbability: 0.05,
  wildcardEveryN: 5,
  noveltyWindow: 10,
  noveltyMinDistance: 0.4,
  maxResampleAttempts: 8,
};

export interface SampledGenome {
  ingredients: SamplableIngredient[];
  wasWildcard: boolean;
  noveltyDistance: number | null;
  // True when resampling used every attempt and still could not clear
  // noveltyMinDistance, i.e. this recipe is a near-repeat we settled for.
  // Stated rather than left to be inferred: a genome has to be as inspectable
  // as an agent-plan decision, and "we gave up looking" is a reason a reader
  // needs to see.
  noveltyExhausted: boolean;
  borrowedPriors: string[];
  temperature: number;
}

// Softmax over scores, then raise every probability to at least `floor` and
// renormalise. The floor is the anti-convergence guarantee: a losing
// ingredient's odds shrink but can never reach zero, so one lucky early result
// cannot lock the system into a single formula forever.
//
// The scores are STANDARDISED within the dimension before the softmax, because
// the two surfaces measure reward on incomparable scales: ads reward is a
// click-through rate (~0.01-0.1) and organic reward is reach relative to the
// brand median (~0.5-3). Exponentiating raw scores would make one temperature
// mean two different things — at ad scale exp(0.02) and exp(0.03) differ by
// half a percent, so the sampler would be uniform forever and every score this
// feature computes would be ignored. After standardising, `temperature` reads
// the same on both surfaces: roughly how many standard deviations of advantage
// produce an e-fold change in odds. When every option scores the same the
// deviation is zero and the result is uniform, which is the correct belief.
export function softmaxWithFloor(
  scores: readonly number[],
  temperature: number,
  floor: number,
): number[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [1];

  const t = temperature > 0 ? temperature : 1;

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length;
  const sd = Math.sqrt(variance);
  const scaled = scores.map(s => (sd > 0 ? (s - mean) / sd / t : 0));

  // Subtract the max before exponentiating — standard guard against overflow
  // at very low temperatures.
  const max = Math.max(...scaled);
  const exps = scaled.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const raw = exps.map(e => (sum > 0 ? e / sum : 1 / scores.length));

  const floored = raw.map(p => Math.max(p, floor));
  const total = floored.reduce((a, b) => a + b, 0);
  return floored.map(p => p / total);
}

// 1 - |intersection| / |union|. 0 means the same recipe, 1 means nothing shared.
export function jaccardDistance(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let shared = 0;
  for (const x of setA) if (setB.has(x)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : 1 - shared / union;
}

function pickUniform<T>(items: readonly T[], rng: () => number): T {
  const i = Math.floor(rng() * items.length);
  // rng() is allowed to return exactly 1; clamp rather than read past the end.
  return items[Math.min(Math.max(i, 0), items.length - 1)];
}

function pick<T>(items: readonly T[], probabilities: readonly number[], rng: () => number): T {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += probabilities[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

function groupByDimension(
  available: readonly SamplableIngredient[],
): Map<CreativeDimension, SamplableIngredient[]> {
  const map = new Map<CreativeDimension, SamplableIngredient[]>();
  for (const i of available) {
    const list = map.get(i.dimension) ?? [];
    list.push(i);
    map.set(i.dimension, list);
  }
  return map;
}

export function sampleGenome(args: {
  available: readonly SamplableIngredient[];
  scores: readonly IngredientScore[];
  // Which surface this creative is for. REQUIRED, and scores are filtered to it
  // here rather than at the call site: scoreIngredients() returns both surfaces
  // in one array, so a caller passing that array straight through would
  // standardise click-through rates (~0.01-0.1) together with reach ratios
  // (~0.5-3) inside a single dimension, and the organic entries would swamp
  // every z-score. Closing it at the source makes that impossible to get wrong.
  surface: Surface;
  recentGenomes: readonly (readonly string[])[];
  index: number;
  config?: EntropyConfig;
  rng?: () => number;
}): SampledGenome {
  const config = args.config ?? DEFAULT_ENTROPY_CONFIG;
  const rng = args.rng ?? Math.random;
  const byDimension = groupByDimension(args.available);
  const scoreById = new Map(
    args.scores.filter(s => s.surface === args.surface).map(s => [s.ingredientId, s]),
  );

  const wasWildcard = config.wildcardEveryN > 0 && args.index % config.wildcardEveryN === 0;
  const window = args.recentGenomes.slice(0, config.noveltyWindow);

  const drawOnce = (): SamplableIngredient[] => {
    const chosen: SamplableIngredient[] = [];
    for (const [, options] of byDimension) {
      if (options.length === 0) continue;

      if (wasWildcard) {
        // Ignore score entirely and take the least-tested option. Ties break at
        // RANDOM, not by vocabulary order: on a fresh brand every n is 0, so
        // every dimension ties, and first-listed tie-breaking would make the
        // one mechanism whose job is exploring the neglected tail propose the
        // identical combination every time — weakest exactly where it matters
        // most. The rng is injected, so a given seed is still reproducible.
        const counts = options.map(o => scoreById.get(o.id)?.n ?? 0);
        const fewest = Math.min(...counts);
        const tied = options.filter((_, i) => counts[i] === fewest);
        chosen.push(tied.length === 1 ? tied[0] : pickUniform(tied, rng));
        continue;
      }

      const probabilities = softmaxWithFloor(
        options.map(o => scoreById.get(o.id)?.shrunkScore ?? 0),
        config.temperature,
        config.floorProbability,
      );
      chosen.push(pick(options, probabilities, rng));
    }
    return chosen;
  };

  const distanceToWindow = (ids: readonly string[]): number =>
    window.length === 0
      ? 1
      : Math.min(...window.map(prev => jaccardDistance(ids, prev)));

  // Try for a combination that is not a near-repeat of a recent one. BOUNDED:
  // when no novel recipe exists — a small vocabulary, or a long run — accept
  // the most novel candidate seen rather than looping forever.
  let best = drawOnce();
  let bestDistance = distanceToWindow(best.map(i => i.id));

  for (let attempt = 1; attempt < config.maxResampleAttempts; attempt++) {
    if (bestDistance >= config.noveltyMinDistance) break;
    const candidate = drawOnce();
    const distance = distanceToWindow(candidate.map(i => i.id));
    if (distance > bestDistance) { best = candidate; bestDistance = distance; }
  }

  return {
    ingredients: best,
    wasWildcard,
    noveltyDistance: window.length === 0 ? null : bestDistance,
    // The loop only exits early once bestDistance clears the threshold, so
    // still being under it here means every attempt was spent.
    noveltyExhausted: window.length > 0 && bestDistance < config.noveltyMinDistance,
    borrowedPriors: best
      .filter(i => scoreById.get(i.id)?.borrowed)
      .map(i => i.id),
    temperature: config.temperature,
  };
}
