import { describe, it, expect } from 'vitest';
import { rotateImageFramework, IMAGE_FRAMEWORKS } from '../generate';

describe('rotateImageFramework', () => {
  it('cycles through all image frameworks as the post count grows', () => {
    const seen = IMAGE_FRAMEWORKS.map((_, i) => rotateImageFramework(i));
    expect(seen).toEqual([...IMAGE_FRAMEWORKS]);
  });

  it('wraps around (count modulo length)', () => {
    expect(rotateImageFramework(IMAGE_FRAMEWORKS.length)).toBe(IMAGE_FRAMEWORKS[0]);
    expect(rotateImageFramework(IMAGE_FRAMEWORKS.length + 2)).toBe(IMAGE_FRAMEWORKS[2]);
  });

  it('does NOT always return quote (the bug: every autopilot post was a contrarian one-liner)', () => {
    const distinct = new Set([0, 1, 2, 3, 4, 5].map((n) => rotateImageFramework(n)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('is stable for a given count', () => {
    expect(rotateImageFramework(7)).toBe(rotateImageFramework(7));
  });

  it('handles negative/NaN defensively (returns a valid framework)', () => {
    expect(IMAGE_FRAMEWORKS).toContain(rotateImageFramework(-1));
    expect(IMAGE_FRAMEWORKS).toContain(rotateImageFramework(NaN));
  });
});
