import { describe, it, expect } from 'vitest';
import {
  checkHookRenderable,
  contrastRatio,
  checkTextContrast,
  estimateTextFit,
  auditCreative,
  MIN_CONTRAST,
} from '../qa';

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const MID_GREY = { r: 128, g: 128, b: 128 };

describe('checkHookRenderable', () => {
  it('rejects an empty hook', () => {
    // The real crash: an empty LLM hook reached the libvips text renderer and
    // took the whole god-mode request down with "no text to render".
    const result = checkHookRenderable('');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('empty_hook');
  });

  it('rejects a whitespace-only hook', () => {
    expect(checkHookRenderable('   \n\t ').ok).toBe(false);
  });

  it('rejects a hook that is only punctuation or emoji', () => {
    // Renders as visual noise even though it is technically non-empty.
    expect(checkHookRenderable('...').ok).toBe(false);
    expect(checkHookRenderable('!!!').ok).toBe(false);
  });

  it('accepts a normal hook', () => {
    expect(checkHookRenderable('Unfiltered truth about mile 18')).toEqual({ ok: true, warnings: [] });
  });

  it('warns about a hook long enough to dominate the image', () => {
    const result = checkHookRenderable('a'.repeat(160));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected pass');
    expect(result.warnings.join(' ')).toMatch(/long/i);
  });

  it('handles null and undefined without throwing', () => {
    expect(checkHookRenderable(null).ok).toBe(false);
    expect(checkHookRenderable(undefined).ok).toBe(false);
  });
});

describe('contrastRatio', () => {
  it('gives the maximum ratio for black on white', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
  });

  it('gives 1 for identical colours', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(contrastRatio(WHITE, BLACK), 5);
  });
});

describe('checkTextContrast', () => {
  it('passes white text on a dark image', () => {
    expect(checkTextContrast(WHITE, { r: 20, g: 20, b: 30 }).ok).toBe(true);
  });

  it('fails white text on a bright image', () => {
    // The everyday failure: a white hook overlaid on a pale sky is unreadable.
    const result = checkTextContrast(WHITE, { r: 240, g: 240, b: 235 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('low_contrast');
    expect(result.detail).toMatch(new RegExp(String(MIN_CONTRAST)));
  });

  it('fails white on mid grey, which looks fine to a generator but not a reader', () => {
    expect(checkTextContrast(WHITE, MID_GREY).ok).toBe(false);
  });
});

describe('estimateTextFit', () => {
  it('accepts text that fits the box', () => {
    expect(estimateTextFit('Short hook', { fontSize: 80, boxWidth: 1080, boxHeight: 400 }).ok).toBe(true);
  });

  it('rejects text that cannot fit at the requested size', () => {
    const result = estimateTextFit('a'.repeat(300), { fontSize: 120, boxWidth: 1080, boxHeight: 300 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('text_overflow');
  });

  it('accepts the same text when the box is larger', () => {
    const text = 'a'.repeat(300);
    expect(estimateTextFit(text, { fontSize: 40, boxWidth: 1080, boxHeight: 1080 }).ok).toBe(true);
  });
});

describe('auditCreative', () => {
  it('passes a well-formed creative', () => {
    const issues = auditCreative({
      hook: 'Unfiltered truth about mile 18',
      textColour: WHITE,
      backgroundColour: { r: 25, g: 25, b: 30 },
      fontSize: 80,
      boxWidth: 1080,
      boxHeight: 400,
    });
    expect(issues.filter(i => i.severity === 'error')).toEqual([]);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const issues = auditCreative({
      hook: '',
      textColour: WHITE,
      backgroundColour: { r: 250, g: 250, b: 250 },
      fontSize: 80,
      boxWidth: 1080,
      boxHeight: 400,
    });
    const codes = issues.map(i => i.code);
    expect(codes).toContain('empty_hook');
    expect(codes).toContain('low_contrast');
  });

  it('skips colour checks when the background could not be sampled', () => {
    // Unknown is not the same as bad: failing to read the image must not block
    // a post that is probably fine.
    const issues = auditCreative({
      hook: 'A good hook',
      textColour: WHITE,
      backgroundColour: null,
      fontSize: 80,
      boxWidth: 1080,
      boxHeight: 400,
    });
    expect(issues.filter(i => i.severity === 'error')).toEqual([]);
  });
});
