import { describe, it, expect } from 'vitest';
import { buildGenomeBlock } from '../ad-copy';
import type { SampledGenome } from '@/lib/creative/sampling';

const genome = (over: Partial<SampledGenome> = {}): SampledGenome => ({
  ingredients: [
    { id: 'f1', dimension: 'framework', value: 'PAS', promptFragment: 'Structure the body as Pain, Agitate, Solution.' },
    { id: 'h1', dimension: 'hook_shape', value: 'question', promptFragment: 'Open with a direct question.' },
    { id: 'i1', dimension: 'image_style', value: 'stock_photo', promptFragment: 'record-only: stock photograph' },
  ],
  wasWildcard: false,
  noveltyDistance: 0.7,
  noveltyExhausted: false,
  borrowedPriors: [],
  temperature: 1,
  ...over,
});

describe('buildGenomeBlock', () => {
  it('injects the prompt fragment of each steerable ingredient', () => {
    const block = buildGenomeBlock(genome());
    expect(block).toContain('Structure the body as Pain, Agitate, Solution.');
    expect(block).toContain('Open with a direct question.');
  });

  it('omits record-only dimensions', () => {
    // image_style is stored and scored but has no image path that can act on
    // it yet. Injecting it would tell the copywriter about a picture it is not
    // choosing.
    expect(buildGenomeBlock(genome())).not.toContain('record-only');
  });

  it('returns an empty string when there is no genome', () => {
    // The flag-off path. Output must be byte-identical to today.
    expect(buildGenomeBlock(null)).toBe('');
    expect(buildGenomeBlock(undefined)).toBe('');
  });

  it('returns an empty string for a genome with no steerable ingredients', () => {
    expect(buildGenomeBlock(genome({ ingredients: [] }))).toBe('');
  });

  it('does not leak internal ingredient ids into the prompt', () => {
    const block = buildGenomeBlock(genome());
    expect(block).not.toContain('f1');
    expect(block).not.toContain('h1');
  });
});
