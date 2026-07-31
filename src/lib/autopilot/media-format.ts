// src/lib/autopilot/media-format.ts
//
// Opt-in media format for autopilot (M3).
//
// Why this exists: every one of the ~186 posts published so far is a static
// 1080x1080 feed image, and both accounts reach only 4-6% of their own
// followers (pacebrain 15/410, affectly 3/51). Static single-image feed posts
// are the weakest distribution format on Instagram; Reels are the discovery
// surface. So format — not creative quality — is the most likely lever on
// reach, and this makes it changeable per brand.
//
// Shipped as an ADDON, per the isolation strategy: the default is 'image', an
// unrecognised value degrades to 'image', and a brand that never opts in
// behaves exactly as it does today. Nothing here changes existing posting.
//
// This module is the RAIL, not the generator. It decides which format a brand
// wants and whether a candidate clip is publishable as a Reel. Producing the
// video is a separate, pluggable concern — deliberately so, because AI video
// generation is a paid external integration that should not be wired in before
// the format hypothesis is tested.

export type MediaFormat = 'image' | 'reel';

export const DEFAULT_MEDIA_FORMAT: MediaFormat = 'image';

// Instagram Reels: 3s minimum, and we cap well below the platform maximum
// because autopilot clips are short-form by design.
const MIN_DURATION_SEC = 3;
const MAX_DURATION_SEC = 90;

// Below this, a vertical clip looks soft on a modern phone screen.
const MIN_SHORT_EDGE = 720;

// A clip must be strictly TALLER than it is wide to work as a Reel. Square
// counts as a rejection, not a pass — 1080x1080 is exactly what the existing
// image pipeline produces, so it is the mistake most likely to be made.
const MAX_VERTICAL_RATIO = 1.0; // width / height, exclusive

export function resolveMediaFormat(value: string | null | undefined): MediaFormat {
  return value?.trim().toLowerCase() === 'reel' ? 'reel' : DEFAULT_MEDIA_FORMAT;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Human-readable aspect, for messages and logs.
export function describeAspect(width: number, height: number): string {
  if (width <= 0 || height <= 0) return 'unknown';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export interface ReelAsset {
  url: string;
  width: number;
  height: number;
  durationSec: number;
}

export type ReelCheck =
  | { ok: true; warnings: string[] }
  | { ok: false; code: string; message: string };

// Validates a candidate clip before it is handed to Buffer. Rejections are
// actionable; anything merely suboptimal is a warning so it still publishes.
export function checkReelAsset(asset: ReelAsset): ReelCheck {
  const fail = (code: string, message: string): ReelCheck => ({ ok: false, code, message });

  if (!asset.url || !/^https?:\/\//i.test(asset.url)) {
    return fail('invalid_url', 'A Reel needs a public http(s) video URL.');
  }
  if (asset.width <= 0 || asset.height <= 0) {
    return fail('unknown_dimensions', 'Video dimensions are unknown, so the aspect ratio cannot be checked.');
  }
  if (asset.durationSec < MIN_DURATION_SEC) {
    return fail('duration_too_short', `Reels must be at least ${MIN_DURATION_SEC}s; this is ${asset.durationSec}s.`);
  }
  if (asset.durationSec > MAX_DURATION_SEC) {
    return fail('duration_too_long', `Reels are capped at ${MAX_DURATION_SEC}s; this is ${asset.durationSec}s.`);
  }

  const ratio = asset.width / asset.height;
  if (ratio >= MAX_VERTICAL_RATIO) {
    // Catches the obvious mistake of feeding the image pipeline's square output
    // (or a landscape clip) into the Reels path.
    return fail(
      'aspect_not_vertical',
      `Reels must be vertical — this is ${describeAspect(asset.width, asset.height)}. Use 9:16 (e.g. 1080x1920).`,
    );
  }

  const warnings: string[] = [];
  // 9:16 is 0.5625. Anything meaningfully squarer still publishes but gets
  // less of the full-screen surface.
  if (ratio > 0.58) {
    warnings.push(
      `${describeAspect(asset.width, asset.height)} will letterbox slightly — 9:16 fills the screen.`,
    );
  }
  if (Math.min(asset.width, asset.height) < MIN_SHORT_EDGE) {
    warnings.push(`Low resolution (${asset.width}x${asset.height}); 1080x1920 is recommended.`);
  }

  return { ok: true, warnings };
}
