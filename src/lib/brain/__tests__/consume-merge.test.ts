import { describe, it, expect } from 'vitest';
import { mergeBrainIntoContext } from '../consume';
import type { BrainContext } from '../types';

const brain: BrainContext = {
  briefMd: '## Mock\n- one',
  formula: { format: 'REEL', bestSlot: { dow: 2, hour: 19 }, captionShape: { lines: 12, paragraphs: 4, emojiDensity: 'low' } },
  briefVersion: 3,
  generatedAt: '2026-05-09T01:00:00Z',
};

describe('mergeBrainIntoContext', () => {
  it('appends BRAND BRAIN to system prompt and fills defaults', () => {
    const out = mergeBrainIntoContext(
      { systemPrompt: 'You are a copywriter.', userFormat: null, userSlot: null },
      brain
    );
    expect(out.systemPrompt).toContain('BRAND BRAIN');
    expect(out.systemPrompt).toContain('## Mock');
    expect(out.format).toBe('REEL');
    expect(out.slot).toEqual({ dow: 2, hour: 19 });
  });

  it('does NOT override user-set values', () => {
    const out = mergeBrainIntoContext(
      { systemPrompt: 'You are a copywriter.', userFormat: 'IMAGE', userSlot: { dow: 5, hour: 9 } },
      brain
    );
    expect(out.format).toBe('IMAGE');
    expect(out.slot).toEqual({ dow: 5, hour: 9 });
  });

  it('returns input unchanged when brain is null', () => {
    const out = mergeBrainIntoContext(
      { systemPrompt: 'X', userFormat: null, userSlot: null },
      null
    );
    expect(out.systemPrompt).toBe('X');
    expect(out.format).toBeNull();
  });
});
