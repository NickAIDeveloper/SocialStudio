import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  computeImageHash,
  hammingDistance,
  closestHashMatch,
  isVisuallyDuplicate,
} from '../image-hash';

// Helpers ─────────────────────────────────────────────────────────────────

/** Synthesize a solid-color JPEG buffer. */
async function solidJpeg(rgb: [number, number, number], size = 256): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .jpeg()
    .toBuffer();
}

/** Synthesize a gradient JPEG so dHash actually produces varied bits. */
async function gradientJpeg(seed: number, size = 256): Promise<Buffer> {
  // Build a raw RGB buffer where pixel value varies with x+y+seed —
  // gives a non-uniform image with real edge content for dHash to encode.
  const channels = 3;
  const raw = Buffer.alloc(size * size * channels);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (x + y + seed) % 256;
      const idx = (y * size + x) * channels;
      raw[idx] = v;
      raw[idx + 1] = (v * 2) % 256;
      raw[idx + 2] = (v * 3) % 256;
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels } })
    .jpeg()
    .toBuffer();
}

// Tests ───────────────────────────────────────────────────────────────────

describe('computeImageHash', () => {
  it('returns a 16-char lowercase hex string', async () => {
    const buf = await solidJpeg([128, 128, 128]);
    const hash = await computeImageHash(buf);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces the SAME hash for the SAME image bytes', async () => {
    const buf = await gradientJpeg(42);
    const a = await computeImageHash(buf);
    const b = await computeImageHash(buf);
    expect(a).toBe(b);
  });

  it('produces the SAME hash for an image re-encoded at different JPEG quality', async () => {
    // Real-world case: Pixabay serving the same photo at slightly different
    // compression should still dedup. dHash works on a 9x8 downsample so
    // it's resilient to compression artefacts.
    const original = await gradientJpeg(99, 512);
    const recompressed = await sharp(original).jpeg({ quality: 60 }).toBuffer();
    const h1 = await computeImageHash(original);
    const h2 = await computeImageHash(recompressed);
    // Allow up to 2 bits of drift on re-encode noise.
    expect(hammingDistance(h1, h2)).toBeLessThanOrEqual(2);
  });

  it('produces the SAME hash when an image is resized', async () => {
    // Pixabay sometimes serves the same photo at different resolutions
    // (e.g. _1280.jpg vs _640.jpg). Downsampling to 9x8 should make
    // resize invisible.
    const big = await gradientJpeg(7, 1024);
    const small = await sharp(big).resize(640, 640).jpeg().toBuffer();
    const h1 = await computeImageHash(big);
    const h2 = await computeImageHash(small);
    expect(hammingDistance(h1, h2)).toBeLessThanOrEqual(2);
  });

  it('produces a DIFFERENT hash for visually different images', async () => {
    const a = await gradientJpeg(0);
    const b = await gradientJpeg(180); // very different gradient phase
    const ha = await computeImageHash(a);
    const hb = await computeImageHash(b);
    expect(hammingDistance(ha, hb)).toBeGreaterThan(6);
  });
});

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('abcdef0123456789', 'abcdef0123456789')).toBe(0);
  });

  it('returns 64 for inverted hashes', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('counts single-bit differences correctly', () => {
    // 0x00 vs 0x01 differs in the LSB only.
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
    // 0x0f vs 0x00 differs in 4 bits.
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
  });

  it('throws on wrong-length input', () => {
    expect(() => hammingDistance('short', '0000000000000000')).toThrow();
    expect(() => hammingDistance('0000000000000000', 'short')).toThrow();
  });
});

describe('closestHashMatch', () => {
  it('returns null when there are no past hashes', () => {
    expect(closestHashMatch('0000000000000000', [])).toBeNull();
  });

  it('returns the closest match by Hamming distance', () => {
    const candidate = '0000000000000001';
    const past = [
      '0000000000000000', // dist 1
      'ffffffffffffffff', // dist 63
      '00000000000000ff', // dist 7
    ];
    const result = closestHashMatch(candidate, past);
    expect(result).toEqual({ hash: '0000000000000000', distance: 1 });
  });

  it('short-circuits on an exact match (distance 0)', () => {
    const result = closestHashMatch('abcdef0123456789', [
      '0000000000000000',
      'abcdef0123456789',
      'ffffffffffffffff',
    ]);
    expect(result?.distance).toBe(0);
  });
});

describe('isVisuallyDuplicate', () => {
  it('returns true when within threshold of any past hash', () => {
    const past = ['00000000000000ff']; // 8 bits set
    expect(isVisuallyDuplicate('00000000000000ff', past, 6)).toBe(true);
    expect(isVisuallyDuplicate('00000000000000fe', past, 6)).toBe(true); // dist 1
  });

  it('returns false when no past hash is within threshold', () => {
    const past = ['0000000000000000'];
    // 16 bits set → Hamming distance from 0 is 16 → above default 6
    expect(isVisuallyDuplicate('000000000000ffff', past, 6)).toBe(false);
  });

  it('returns false for empty past hashes', () => {
    expect(isVisuallyDuplicate('0000000000000000', [], 6)).toBe(false);
  });
});
