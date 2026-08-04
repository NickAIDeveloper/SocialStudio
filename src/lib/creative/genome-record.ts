// src/lib/creative/genome-record.ts
//
// Persists what a creative was made of. BEST EFFORT throughout: a failure here
// is logged and swallowed, never propagated, because losing a genome row is a
// lost data point while failing a publish costs a real ad.

import { db } from '@/lib/db';
import { creativeGenomes, creativeGenomeIngredients } from '@/lib/db/schema';
import type { SampledGenome } from './sampling';
import type { Surface } from './scoring';

export async function recordGenome(input: {
  subjectType: 'ad' | 'post';
  subjectId: string;
  brandId: string | null;
  surface: Surface;
  genome: SampledGenome;
}): Promise<string | null> {
  if (input.genome.ingredients.length === 0) return null;

  try {
    const [row] = await db
      .insert(creativeGenomes)
      .values({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        brandId: input.brandId,
        surface: input.surface,
        wasWildcard: input.genome.wasWildcard,
        samplingMeta: {
          noveltyDistance: input.genome.noveltyDistance,
          // See sampling.ts: distinct from noveltyDistance — this is whether the
          // sampler gave up looking for a novel recipe, not how close it got.
          noveltyExhausted: input.genome.noveltyExhausted,
          borrowedPriors: input.genome.borrowedPriors,
          temperature: input.genome.temperature,
        },
      })
      .returning();

    await db
      .insert(creativeGenomeIngredients)
      .values(input.genome.ingredients.map(i => ({ genomeId: row.id, ingredientId: i.id })))
      .onConflictDoNothing();

    return row.id;
  } catch (err) {
    console.warn('[creative/genome] record failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
