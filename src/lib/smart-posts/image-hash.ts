// Perceptual hashing for image-level no-reuse dedup.
//
// Why this exists:
//   The URL-based no-reuse check catches exact-string and signed-URL
//   duplicates, but Pixabay (and the other stock providers) commonly host
//   the same photographer's shot under multiple URLs — same model, same
//   shoot, near-identical composition, completely different URL hash. The
//   URL filter can't see through that. A perceptual hash compares the
//   IMAGE BYTES (downsampled), so two visually-identical photos at
//   different URLs collapse to the same fingerprint.
//
// Algorithm: dHash (difference hash).
//   1. Resize to 9x8 grayscale (72 pixels)
//   2. For each row, compare adjacent pixels: bit = 1 if left > right, else 0
//   3. Concatenate 8 rows × 8 comparisons = 64 bits
//   4. Encode as 16-char lowercase hex
//
// Why dHash over pHash (DCT):
//   - Simpler implementation, no DCT dependency
//   - sharp can produce the 9x8 grayscale buffer in one op (~5-15ms)
//   - Hamming-distance ≤ 6 reliably catches re-encodings, resizes, and
//     minor crops without false-positives on different photos
//
// Threshold:
//   Hamming distance ≤ 6 / 64 bits = "visually the same photo" with very
//   few false positives. ≤ 10 picks up close stylistic siblings (same
//   shoot, slightly different pose) but starts catching legitimate
//   different-subject photos in the same lighting style. 6 is the safe
//   default — bump if the user complains about siblings still slipping
//   through, drop if legitimate posts get rejected.

import sharp from 'sharp';

const HASH_BITS = 64;
const HASH_HEX_LENGTH = HASH_BITS / 4;

export const DEFAULT_HAMMING_THRESHOLD = 6;

/**
 * Compute the dHash of an image buffer. Returns a 16-char lowercase hex
 * string. Throws if sharp can't decode the buffer (corrupt image).
 */
export async function computeImageHash(buffer: Buffer): Promise<string> {
  // 9 columns × 8 rows = 72 grayscale samples. The 9th column gives us the
  // 8 "compare against neighbour to the right" pairs we need per row.
  const raw = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  if (raw.length !== 9 * 8) {
    throw new Error(`Unexpected raw buffer length: ${raw.length}, expected 72`);
  }

  // Build a 64-bit integer as two 32-bit halves to stay in JS-safe range,
  // then format as hex. BigInt would also work but is slower for this size.
  let hi = 0;
  let lo = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = y * 9 + x;
      const bit = raw[idx] > raw[idx + 1] ? 1 : 0;
      const bitPos = y * 8 + x;
      if (bitPos < 32) {
        hi = (hi | (bit << (31 - bitPos))) >>> 0;
      } else {
        lo = (lo | (bit << (63 - bitPos))) >>> 0;
      }
    }
  }
  const hex = hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
  return hex;
}

const POPCOUNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let n = i;
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  POPCOUNT_TABLE[i] = c;
}

/**
 * Hamming distance between two equal-length hex hashes. Returns the number
 * of bits that differ. Lower = more similar; 0 = identical.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== HASH_HEX_LENGTH || b.length !== HASH_HEX_LENGTH) {
    throw new Error(
      `hammingDistance expects ${HASH_HEX_LENGTH}-char hex strings, got ${a.length} and ${b.length}`,
    );
  }
  let dist = 0;
  // Process in 2-hex-char (1-byte) chunks via the popcount table.
  for (let i = 0; i < HASH_HEX_LENGTH; i += 2) {
    const byteA = parseInt(a.slice(i, i + 2), 16);
    const byteB = parseInt(b.slice(i, i + 2), 16);
    dist += POPCOUNT_TABLE[byteA ^ byteB];
  }
  return dist;
}

/**
 * Returns the closest match (lowest Hamming distance) from a set of past
 * hashes, or null if no past hash exists. Used to decide whether to skip
 * a candidate during no-reuse filtering.
 */
export function closestHashMatch(
  candidate: string,
  pastHashes: Iterable<string>,
): { hash: string; distance: number } | null {
  let best: { hash: string; distance: number } | null = null;
  for (const past of pastHashes) {
    const d = hammingDistance(candidate, past);
    if (!best || d < best.distance) {
      best = { hash: past, distance: d };
      if (d === 0) return best; // can't do better than identical
    }
  }
  return best;
}

/**
 * Convenience: is the candidate within Hamming threshold of any past hash?
 */
export function isVisuallyDuplicate(
  candidate: string,
  pastHashes: Iterable<string>,
  threshold: number = DEFAULT_HAMMING_THRESHOLD,
): boolean {
  const closest = closestHashMatch(candidate, pastHashes);
  return closest !== null && closest.distance <= threshold;
}
