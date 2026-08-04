import { describe, it, expect } from 'vitest';
import {
  CREATIVE_DIMENSIONS,
  BUILTIN_INGREDIENTS,
  ingredientsFor,
  RECORD_ONLY_DIMENSIONS,
} from '../vocabulary';

describe('vocabulary', () => {
  it('covers every dimension the spec names', () => {
    expect([...CREATIVE_DIMENSIONS].sort()).toEqual(
      ['angle', 'cta_type', 'framework', 'hook_shape', 'image_style', 'pain_point'].sort(),
    );
  });

  it('has no duplicate (dimension, value) pairs', () => {
    // The table has a unique index on this pair; a duplicate here would make
    // the seed script fail on a fresh database.
    const keys = BUILTIN_INGREDIENTS.map(i => `${i.dimension}:${i.value}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every ingredient a non-empty prompt fragment', () => {
    // An ingredient with no fragment steers nothing — it would be selected,
    // recorded, scored, and have no effect on the copy at all.
    for (const i of BUILTIN_INGREDIENTS) {
      expect(i.promptFragment.trim().length).toBeGreaterThan(0);
    }
  });

  it('carries the four copywriting frameworks ad-copy.ts hardcodes today', () => {
    const frameworks = ingredientsFor('framework').map(i => i.value).sort();
    expect(frameworks).toEqual(['AIDA', 'BAB', 'FOURPS', 'PAS']);
  });

  it('offers at least two options in every steerable dimension', () => {
    // A dimension with one option cannot vary, so sampling it is theatre.
    for (const d of CREATIVE_DIMENSIONS) {
      if (RECORD_ONLY_DIMENSIONS.includes(d)) continue;
      expect(ingredientsFor(d).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('marks image_style as record-only', () => {
    // Creative is stock-photo selection today; there is no image path that can
    // accept a style directive. It is stored and scored, never injected.
    expect(RECORD_ONLY_DIMENSIONS).toContain('image_style');
  });
});
