// src/lib/creative/genome-read.ts
//
// The DB side of the genome. Reads observations, recent recipes and the
// vocabulary; recomputes scores and writes them through so the UI can render
// without recomputing and score drift stays visible.
//
// Scores are computed on READ rather than on a cron: at this volume it is a
// few milliseconds, and a cron would be one more thing to notice has silently
// stopped.

import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creativeIngredients, creativeGenomes, creativeGenomeIngredients,
  creativeIngredientScores, metaAdInsights, metaAds, posts, postAnalytics,
} from '@/lib/db/schema';
import { hasOutcome } from '@/lib/brain/creative-stats';
import {
  adsReward, organicReward, scoreIngredients,
  type IngredientScore, type Observation, type Surface,
} from './scoring';
import type { SamplableIngredient } from './sampling';

// Ads only. Organic has no equivalent floor: real posts here reach 1-28
// people, so a 500 threshold would exclude every organic post ever published
// and the cold-start borrowing would have nothing to borrow from. Thin organic
// data is handled by shrinkage instead.
const ADS_IMPRESSION_FLOOR = 500;

export async function loadSamplableIngredients(): Promise<SamplableIngredient[]> {
  const rows = await db
    .select()
    .from(creativeIngredients)
    .where(eq(creativeIngredients.active, true));
  return rows.map(r => ({
    id: r.id,
    dimension: r.dimension as SamplableIngredient['dimension'],
    value: r.value,
    promptFragment: r.promptFragment,
  }));
}

export async function loadRecentGenomeIngredientIds(
  surface: Surface,
  limit: number,
): Promise<string[][]> {
  const genomes = await db
    .select({ id: creativeGenomes.id })
    .from(creativeGenomes)
    .where(eq(creativeGenomes.surface, surface))
    .orderBy(desc(creativeGenomes.createdAt))
    .limit(limit);
  if (genomes.length === 0) return [];

  const joins = await db
    .select()
    .from(creativeGenomeIngredients)
    .where(inArray(creativeGenomeIngredients.genomeId, genomes.map(g => g.id)));

  return genomes.map(g =>
    joins.filter(j => j.genomeId === g.id).map(j => j.ingredientId),
  );
}

export async function nextGenomeIndex(surface: Surface): Promise<number> {
  const rows = await db
    .select({ id: creativeGenomes.id })
    .from(creativeGenomes)
    .where(eq(creativeGenomes.surface, surface));
  return rows.length + 1;
}

// Median reach for one brand, used to normalise organic reward. Returns 0 when
// the brand has no positive-reach history, which makes organicReward return
// null and the post contribute nothing.
async function brandMedianReach(brandId: string): Promise<number> {
  const rows = await db
    .select({ reach: postAnalytics.reach })
    .from(postAnalytics)
    .innerJoin(posts, eq(posts.id, postAnalytics.postId))
    .where(eq(posts.brandId, brandId));
  const values = rows.map(r => r.reach ?? 0).filter(v => v > 0).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

export async function loadObservations(surface: Surface): Promise<Observation[]> {
  const genomes = await db
    .select()
    .from(creativeGenomes)
    .where(eq(creativeGenomes.surface, surface));
  if (genomes.length === 0) return [];

  const joins = await db
    .select()
    .from(creativeGenomeIngredients)
    .where(inArray(creativeGenomeIngredients.genomeId, genomes.map(g => g.id)));

  const observations: Observation[] = [];
  const medianCache = new Map<string, number>();

  for (const g of genomes) {
    let reward: number | null = null;

    if (surface === 'ads') {
      const [ad] = await db.select().from(metaAds).where(eq(metaAds.id, g.subjectId));
      if (!ad) continue;
      const [snap] = await db
        .select()
        .from(metaAdInsights)
        .where(eq(metaAdInsights.metaAdsId, ad.id))
        .orderBy(desc(metaAdInsights.snapshotDate))
        .limit(1);
      if (!snap || snap.impressions < ADS_IMPRESSION_FLOOR) continue;
      reward = adsReward(snap.clicks ?? 0, snap.impressions);
    } else {
      const [analytics] = await db
        .select()
        .from(postAnalytics)
        .where(eq(postAnalytics.postId, g.subjectId));
      if (!analytics || !hasOutcome(analytics)) continue;
      if (!g.brandId) continue;
      let median = medianCache.get(g.brandId);
      if (median === undefined) {
        median = await brandMedianReach(g.brandId);
        medianCache.set(g.brandId, median);
      }
      reward = organicReward(analytics.reach ?? 0, median);
    }

    if (reward == null) continue;
    for (const j of joins.filter(x => x.genomeId === g.id)) {
      observations.push({ ingredientId: j.ingredientId, surface, reward });
    }
  }

  return observations;
}

export async function refreshScores(): Promise<IngredientScore[]> {
  const organicScores = scoreIngredients(await loadObservations('organic'));
  const adsScores = scoreIngredients(await loadObservations('ads'), { organicScores });
  const all = [...organicScores, ...adsScores];

  for (const s of all) {
    await db
      .insert(creativeIngredientScores)
      .values({
        ingredientId: s.ingredientId,
        surface: s.surface,
        n: s.n,
        meanReward: String(s.meanReward),
        shrunkScore: String(s.shrunkScore),
        borrowed: s.borrowed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [creativeIngredientScores.ingredientId, creativeIngredientScores.surface],
        set: {
          n: s.n,
          meanReward: String(s.meanReward),
          shrunkScore: String(s.shrunkScore),
          borrowed: s.borrowed,
          updatedAt: new Date(),
        },
      });
  }

  return all;
}

export async function loadScores(): Promise<IngredientScore[]> {
  const rows = await db.select().from(creativeIngredientScores);
  return rows.map(r => ({
    ingredientId: r.ingredientId,
    surface: r.surface as Surface,
    n: r.n,
    meanReward: Number(r.meanReward ?? 0),
    shrunkScore: Number(r.shrunkScore ?? 0),
    borrowed: r.borrowed,
  }));
}
