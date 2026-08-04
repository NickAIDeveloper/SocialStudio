import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { insertedGenomes: [] as unknown[], insertedJoins: [] as unknown[], failInsert: false },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => ({
        returning: async () => {
          if (state.failInsert) throw new Error('db down');
          if (Array.isArray(v)) { state.insertedJoins.push(...v); return v; }
          state.insertedGenomes.push(v);
          return [{ id: 'genome_1' }];
        },
        onConflictDoNothing: async () => {
          if (Array.isArray(v)) state.insertedJoins.push(...v);
        },
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creativeGenomes: {}, creativeGenomeIngredients: {},
}));

import { recordGenome } from '../genome-record';
import type { SampledGenome } from '../sampling';

const GENOME: SampledGenome = {
  ingredients: [
    { id: 'f1', dimension: 'framework', value: 'PAS', promptFragment: 'x' },
    { id: 'h1', dimension: 'hook_shape', value: 'question', promptFragment: 'y' },
  ],
  wasWildcard: true,
  noveltyDistance: 0.66,
  noveltyExhausted: false,
  borrowedPriors: ['f1'],
  temperature: 1,
};

beforeEach(() => {
  state.insertedGenomes = [];
  state.insertedJoins = [];
  state.failInsert = false;
});

describe('recordGenome', () => {
  it('writes one genome row and one join row per ingredient', async () => {
    const id = await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads', genome: GENOME,
    });
    expect(id).toBe('genome_1');
    expect(state.insertedGenomes).toHaveLength(1);
    expect(state.insertedJoins).toHaveLength(2);
  });

  it('persists the sampling reasoning, not just the choices', async () => {
    // "Why did it write this ad?" must be answerable later, the same way an
    // agent-plan decision carries its reason.
    await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads', genome: GENOME,
    });
    const row = state.insertedGenomes[0] as Record<string, unknown>;
    expect(row.wasWildcard).toBe(true);
    expect(row.samplingMeta).toMatchObject({
      noveltyDistance: 0.66,
      noveltyExhausted: false,
      borrowedPriors: ['f1'],
    });
  });

  it('returns null instead of throwing when the database fails', async () => {
    // Recording is best effort. A genome write must never take down a publish.
    state.failInsert = true;
    const id = await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads', genome: GENOME,
    });
    expect(id).toBeNull();
  });

  it('records nothing for an empty genome', async () => {
    const id = await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads',
      genome: { ...GENOME, ingredients: [] },
    });
    expect(id).toBeNull();
    expect(state.insertedGenomes).toHaveLength(0);
  });
});
