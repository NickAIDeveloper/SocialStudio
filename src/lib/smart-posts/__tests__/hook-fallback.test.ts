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

  it('falls through whitespace-only hookText to the caption-derived hook', () => {
    expect(resolveHook({ hookText: '   ', caption: 'Stop doing this. It helps.' })).toBe('Stop doing this');
  });

  it('precedence: hookText > caption-derived > "Save this" (hookPattern is NOT a candidate)', () => {
    expect(resolveHook({ hookText: 'A', caption: 'C sentence.' })).toBe('A');
    // The stale top-post opener must NEVER be reintroduced via a fallback, so an
    // empty hookText derives from the fresh caption, not from any brand pattern.
    expect(resolveHook({ hookText: '', caption: 'C sentence.' })).toBe('C sentence');
  });

  it('NEVER returns empty — last resort is a non-empty constant', () => {
    expect(resolveHook({})).toBe('Save this');
    expect(resolveHook({ hookText: '', caption: '' })).toBe('Save this');
    expect(resolveHook({ hookText: null, caption: '   ' })).toBe('Save this');
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
