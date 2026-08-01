// src/lib/creative/sample-region.ts
//
// Reads the average colour of the image region a text overlay will sit on, so
// the contrast check in qa.ts has a real number to work with instead of an
// assumption.
//
// Separated from qa.ts on purpose: everything in qa.ts is pure and unit-tested,
// while this touches sharp and real image buffers. Keeping the boundary means
// the decision logic stays testable without fixtures.
//
// Never throws. A creative that cannot be sampled returns null, which qa.ts
// treats as "unknown" and skips — failing to read an image must not block a
// post that is probably fine.

import sharp from 'sharp';
import type { Rgb } from './qa';

export type VerticalRegion = 'top' | 'middle' | 'bottom';

// Average colour of an EXACT pixel band. Preferred over the coarse
// top/middle/bottom split wherever the caller already knows where the text will
// land, because the renderer clamps text position dynamically and a third-of-
// the-image approximation can sample the wrong strip entirely.
export async function sampleBandColour(
  image: Buffer,
  top: number,
  height: number,
): Promise<Rgb | null> {
  try {
    const { width, height: imgHeight } = await sharp(image).metadata();
    if (!width || !imgHeight) return null;

    // Clamp into the image: callers compute layout before knowing the final
    // canvas, so an out-of-range band is expected rather than exceptional.
    const safeTop = Math.max(0, Math.min(Math.floor(top), imgHeight - 1));
    const safeHeight = Math.max(1, Math.min(Math.floor(height), imgHeight - safeTop));

    const { data, info } = await sharp(image)
      .extract({ left: 0, top: safeTop, width, height: safeHeight })
      .resize(32, 32, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels < 3) return null;
    let r = 0, g = 0, b = 0;
    const pixels = data.length / info.channels;
    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return { r: Math.round(r / pixels), g: Math.round(g / pixels), b: Math.round(b / pixels) };
  } catch (err) {
    console.warn('[creative-qa] band sample failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Sample only the band the text occupies. Averaging the WHOLE image would be
// misleading: a dark photo with a bright sky reads as mid-grey overall, while
// the hook sitting in the sky is invisible.
export async function sampleRegionColour(
  image: Buffer,
  region: VerticalRegion = 'middle',
): Promise<Rgb | null> {
  try {
    const pipeline = sharp(image);
    const { width, height } = await pipeline.metadata();
    if (!width || !height) return null;

    const bandHeight = Math.max(1, Math.floor(height / 3));
    const top = region === 'top' ? 0 : region === 'middle' ? bandHeight : height - bandHeight;

    const { data, info } = await sharp(image)
      .extract({ left: 0, top, width, height: Math.min(bandHeight, height - top) })
      // Downscale before averaging: 32px wide is ample for a mean and turns a
      // multi-megapixel read into a trivial one.
      .resize(32, 32, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    if (channels < 3) return null;

    let r = 0;
    let g = 0;
    let b = 0;
    const pixels = data.length / channels;
    for (let i = 0; i < data.length; i += channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return {
      r: Math.round(r / pixels),
      g: Math.round(g / pixels),
      b: Math.round(b / pixels),
    };
  } catch (err) {
    console.warn('[creative-qa] region sample failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
