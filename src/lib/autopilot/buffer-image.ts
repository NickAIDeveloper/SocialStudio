// src/lib/autopilot/buffer-image.ts
//
// Guarantees the image URL handed to Buffer points at something Instagram will
// actually publish. Instagram rejects feed images whose aspect ratio falls
// outside 4:5 (0.8, portrait) .. 1.91:1 (landscape) with a generic "An unknown
// error has occurred" at publish time — the post schedules fine, then silently
// fails when it's due.
//
// god-mode composites are already square (1080x1080) and publish cleanly. This
// only protects the RAW-stock fallback paths:
//   - autopilot run: composite upload to GitHub failed → falls back to the raw
//     Pixabay photo, which has an arbitrary aspect ratio.
//   - manual "Schedule to Buffer": a draft that was never composited.

import sharp from 'sharp';
import { fetchImageBuffer } from '@/lib/image-processing';
import { uploadImageToGitHub } from '@/lib/github-images';

// Instagram feed images must be between 4:5 portrait (0.8) and 1.91:1 landscape.
// 1:1 square is always safe. Anything outside the band is rejected at publish.
export function isInstagramValidAspectRatio(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= 0.8 && ratio <= 1.91;
}

// Returns a hosted, Instagram-publishable image URL for `imageUrl`:
//   - already a valid aspect ratio → returned unchanged (no needless re-host).
//   - otherwise → center-cropped to a 1080 square and hosted on GitHub.
//   - on any failure (fetch/sharp/upload) → null, so callers send NO image
//     rather than a doomed one that would error at publish.
export async function ensureInstagramReadyImageUrl(imageUrl: string): Promise<string | null> {
  try {
    const buf = await fetchImageBuffer(imageUrl);
    const meta = await sharp(buf).metadata();
    if (meta.width && meta.height && isInstagramValidAspectRatio(meta.width, meta.height)) {
      return imageUrl;
    }
    const square = await sharp(buf)
      .resize(1080, 1080, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90 })
      .toBuffer();
    const upload = await uploadImageToGitHub(square, `buffer-square-${Date.now()}.jpg`);
    return upload.url;
  } catch (err) {
    console.error(
      '[autopilot] ensureInstagramReadyImageUrl failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
