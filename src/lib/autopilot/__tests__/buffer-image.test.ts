import { describe, it, expect } from 'vitest';
import { isInstagramValidAspectRatio } from '../buffer-image';

describe('isInstagramValidAspectRatio', () => {
  it('accepts a square image', () => {
    expect(isInstagramValidAspectRatio(1080, 1080)).toBe(true);
  });

  it('accepts the portrait and landscape limits (4:5 and 1.91:1)', () => {
    expect(isInstagramValidAspectRatio(1080, 1350)).toBe(true); // 4:5 = 0.8
    expect(isInstagramValidAspectRatio(1080, 566)).toBe(true);  // ~1.908
    expect(isInstagramValidAspectRatio(1920, 1080)).toBe(true); // 16:9 = 1.777
  });

  it('rejects images too tall (e.g. 9:16 stock portrait)', () => {
    expect(isInstagramValidAspectRatio(1080, 1920)).toBe(false); // 0.5625
    expect(isInstagramValidAspectRatio(800, 1200)).toBe(false);  // 0.667
  });

  it('rejects images too wide (panorama)', () => {
    expect(isInstagramValidAspectRatio(2400, 1000)).toBe(false); // 2.4
  });

  it('rejects degenerate dimensions', () => {
    expect(isInstagramValidAspectRatio(0, 1080)).toBe(false);
    expect(isInstagramValidAspectRatio(1080, 0)).toBe(false);
    expect(isInstagramValidAspectRatio(-10, 10)).toBe(false);
  });
});
