import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MEDIA_FORMAT,
  resolveMediaFormat,
  checkReelAsset,
  describeAspect,
  type ReelAsset,
} from '../media-format';

const GOOD: ReelAsset = { url: 'https://cdn.example.com/v.mp4', width: 1080, height: 1920, durationSec: 12 };

describe('resolveMediaFormat', () => {
  it('defaults to image so existing brands are completely unaffected', () => {
    // M3 ships as an ADDON: a brand that never opts in must behave exactly as
    // it does today.
    expect(DEFAULT_MEDIA_FORMAT).toBe('image');
    expect(resolveMediaFormat(null)).toBe('image');
    expect(resolveMediaFormat(undefined)).toBe('image');
    expect(resolveMediaFormat('')).toBe('image');
  });

  it('honours an explicit reel opt-in', () => {
    expect(resolveMediaFormat('reel')).toBe('reel');
  });

  it('falls back to image on an unrecognised value rather than throwing', () => {
    // A bad settings value must degrade to the working path, never break posting.
    expect(resolveMediaFormat('carousel')).toBe('image');
    expect(resolveMediaFormat('REEL ')).toBe('reel');
  });
});

describe('describeAspect', () => {
  it('names the common Instagram shapes', () => {
    expect(describeAspect(1080, 1920)).toBe('9:16');
    expect(describeAspect(1080, 1080)).toBe('1:1');
    expect(describeAspect(1080, 1350)).toBe('4:5');
  });

  it('returns a ratio for anything unusual', () => {
    expect(describeAspect(1920, 1080)).toBe('16:9');
  });
});

describe('checkReelAsset', () => {
  it('accepts a 9:16 clip of sane length', () => {
    expect(checkReelAsset(GOOD)).toEqual({ ok: true, warnings: [] });
  });

  it('rejects a clip that is too short to publish', () => {
    const result = checkReelAsset({ ...GOOD, durationSec: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.code).toBe('duration_too_short');
  });

  it('rejects a clip that is too long', () => {
    const result = checkReelAsset({ ...GOOD, durationSec: 900 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.code).toBe('duration_too_long');
  });

  it('rejects the square 1:1 that the image pipeline produces', () => {
    // The whole reason M3 exists: god-mode makes 1080x1080 statics. Feeding one
    // to the Reels path would publish a badly letterboxed clip.
    const result = checkReelAsset({ ...GOOD, width: 1080, height: 1080 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.code).toBe('aspect_not_vertical');
    expect(result.message).toContain('9:16');
  });

  it('accepts 4:5 vertical but warns that it is not ideal', () => {
    const result = checkReelAsset({ ...GOOD, width: 1080, height: 1350 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected acceptance');
    expect(result.warnings.join(' ')).toMatch(/9:16/);
  });

  it('warns about low resolution without blocking', () => {
    const result = checkReelAsset({ ...GOOD, width: 360, height: 640 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected acceptance');
    expect(result.warnings.join(' ')).toMatch(/resolution/i);
  });

  it('rejects a missing or non-http url', () => {
    expect(checkReelAsset({ ...GOOD, url: '' }).ok).toBe(false);
    expect(checkReelAsset({ ...GOOD, url: 'file:///tmp/v.mp4' }).ok).toBe(false);
  });

  it('rejects unusable dimensions instead of dividing by zero', () => {
    const result = checkReelAsset({ ...GOOD, width: 0, height: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.code).toBe('unknown_dimensions');
  });
});
