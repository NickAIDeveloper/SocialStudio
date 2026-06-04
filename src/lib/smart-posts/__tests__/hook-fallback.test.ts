import { describe, it, expect } from 'vitest';
import { resolveHook, deriveHookFromCaption } from '../hook-fallback';

describe('resolveHook', () => {
  it('returns the trimmed hookText when present', () => {
    expect(resolveHook({ hookText: '  Run smarter, not harder  ' })).toBe('Run smarter, not harder');
  });

  it('falls through an EMPTY-STRING hookText (the bug: ?? did not catch "")', () => {
    // This is the exact crash condition — /api/captions returned hookText: ''.
    // The old `?? 'Save this'` chain failed to substitute, sending '' to the renderer.
    const out = resolveHook({ hookText: '', caption: 'Most runners go out too fast. Here is the fix.' });
    expect(out).toBe('Most runners go out too fast');
    expect(out.length).toBeGreaterThan(0);
  });

  it('falls through whitespace-only hookText', () => {
    expect(resolveHook({ hookText: '   ', hookPattern: 'Stop doing this' })).toBe('Stop doing this');
  });

  it('precedence: hookText > hookPattern > caption-derived > "Save this"', () => {
    expect(resolveHook({ hookText: 'A', hookPattern: 'B', caption: 'C sentence.' })).toBe('A');
    expect(resolveHook({ hookText: '', hookPattern: 'B', caption: 'C sentence.' })).toBe('B');
    expect(resolveHook({ hookText: '', hookPattern: '', caption: 'C sentence.' })).toBe('C sentence');
  });

  it('NEVER returns empty — last resort is a non-empty constant', () => {
    expect(resolveHook({})).toBe('Save this');
    expect(resolveHook({ hookText: '', hookPattern: '', caption: '' })).toBe('Save this');
    expect(resolveHook({ hookText: null, hookPattern: undefined, caption: '   ' })).toBe('Save this');
  });

  it('handles a caption that is only emoji/punctuation by falling to the constant', () => {
    expect(resolveHook({ hookText: '', caption: '🔥🔥🔥' })).toBe('Save this');
  });
});

describe('deriveHookFromCaption', () => {
  it('takes the first sentence and trims it', () => {
    expect(deriveHookFromCaption('Your pace is a lie. Here is why it matters today.')).toBe('Your pace is a lie');
  });

  it('uses the first non-empty line when there is no sentence break', () => {
    expect(deriveHookFromCaption('\n\n  Build the habit first  \nThen add speed')).toBe('Build the habit first');
  });

  it('returns empty string when there is no usable text', () => {
    expect(deriveHookFromCaption('')).toBe('');
    expect(deriveHookFromCaption('   ')).toBe('');
    expect(deriveHookFromCaption(null)).toBe('');
  });
});
