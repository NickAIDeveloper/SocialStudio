import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { assertAllowedImageUrl } from '@/lib/url-validation';
import type { Brand } from '@/lib/domain-types';

/** Resolve an image URL to a Buffer — handles both data URIs and HTTPS URLs. */
async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('data:image/')) {
    const base64Data = imageUrl.split(',')[1];
    if (!base64Data) throw new Error('Invalid data URI: missing base64 payload');
    return Buffer.from(base64Data, 'base64');
  }
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

// In-memory cache for downloaded logo buffers (keyed by URL)
const LOGO_CACHE_MAX = 50;
const logoCache = new Map<string, Buffer>();

async function fetchLogoBuffer(url: string): Promise<Buffer> {
  const cached = logoCache.get(url);
  if (cached) return cached;

  assertAllowedImageUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch logo from ${url}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Evict oldest entry if cache is full
  if (logoCache.size >= LOGO_CACHE_MAX) {
    const firstKey = logoCache.keys().next().value;
    if (firstKey !== undefined) {
      logoCache.delete(firstKey);
    }
  }
  logoCache.set(url, buffer);

  return buffer;
}

export async function removeWhiteBackground(
  inputPath: string,
  outputPath: string,
  threshold: number = 230
): Promise<void> {
  const image = sharp(inputPath);
  const { width, height } = await image.metadata();

  if (!width || !height) {
    throw new Error('Could not read image dimensions');
  }

  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const w = info.width;
  const h = info.height;

  // Flood-fill from edges to remove only the OUTER white background,
  // preserving white text/icons inside the logo
  const visited = new Uint8Array(w * h);
  const toRemove = new Uint8Array(w * h);
  const softThreshold = threshold - 30;

  function isWhitish(idx: number): boolean {
    const r = pixels[idx * 4];
    const g = pixels[idx * 4 + 1];
    const b = pixels[idx * 4 + 2];
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    return brightness > softThreshold && saturation < 0.15;
  }

  // BFS flood-fill from all edge pixels
  const queue: number[] = [];
  for (let x = 0; x < w; x++) {
    if (isWhitish(x)) queue.push(x);                          // top row
    if (isWhitish((h - 1) * w + x)) queue.push((h - 1) * w + x); // bottom row
  }
  for (let y = 0; y < h; y++) {
    if (isWhitish(y * w)) queue.push(y * w);                  // left col
    if (isWhitish(y * w + w - 1)) queue.push(y * w + w - 1); // right col
  }

  for (const idx of queue) {
    visited[idx] = 1;
    toRemove[idx] = 1;
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % w;
    const y = Math.floor(idx / w);

    const neighbors = [];
    if (x > 0) neighbors.push(idx - 1);
    if (x < w - 1) neighbors.push(idx + 1);
    if (y > 0) neighbors.push(idx - w);
    if (y < h - 1) neighbors.push(idx + w);

    for (const n of neighbors) {
      if (!visited[n] && isWhitish(n)) {
        visited[n] = 1;
        toRemove[n] = 1;
        queue.push(n);
      }
    }
  }

  // Apply transparency only to flood-filled background pixels
  for (let i = 0; i < w * h; i++) {
    if (toRemove[i]) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      if (brightness > threshold) {
        pixels[i * 4 + 3] = 0; // Fully transparent
      } else {
        // Edge anti-aliasing: gradual transparency near the boundary
        const alpha = Math.round(
          255 * ((threshold - brightness) / (threshold - softThreshold))
        );
        pixels[i * 4 + 3] = Math.max(0, Math.min(255, alpha));
      }
    }
  }

  await sharp(Buffer.from(pixels), {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

export async function compositeLogoOnImage(
  baseImageBuffer: Buffer,
  brand: Brand,
  logoScale: number = 0.22,
  logoUrl?: string | null
): Promise<Buffer> {
  const baseImage = sharp(baseImageBuffer);
  const baseMetadata = await baseImage.metadata();

  if (!baseMetadata.width || !baseMetadata.height) {
    throw new Error('Could not read base image dimensions');
  }

  const iconSize = Math.round(baseMetadata.width * logoScale);

  let resizedLogo: Buffer;

  if (logoUrl) {
    // Dynamic logo from user-uploaded brand logo (Vercel Blob URL)
    const logoBuffer = await fetchLogoBuffer(logoUrl);
    resizedLogo = await sharp(logoBuffer)
      .resize(iconSize, iconSize, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.8 })
      .png()
      .toBuffer();
  } else {
    // Fallback: local logo files from public/logos/
    const logoFile = brand === 'pacebrain' ? 'pacebrain-icon.png' : `${brand}.png`;
    const logoPath = path.join(LOGOS_DIR, logoFile);

    try {
      await fs.access(logoPath);
    } catch {
      const originalPath = path.join(LOGOS_DIR, `${brand}-original.png`);
      await removeWhiteBackground(originalPath, logoPath);
    }

    resizedLogo = await sharp(logoPath)
      .resize(iconSize, iconSize, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.8 })
      .png()
      .toBuffer();
  }

  const logoMeta = await sharp(resizedLogo).metadata();
  const logoH = logoMeta.height || iconSize;
  const logoW = logoMeta.width || iconSize;

  // Position: bottom-center so the logo is fully visible in Instagram
  // grid thumbnails (which crop ~8-10% from each edge)
  const bottomPadding = Math.round(baseMetadata.height * 0.12);
  const left = Math.round((baseMetadata.width - logoW) / 2);
  const top = baseMetadata.height - logoH - bottomPadding;

  return baseImage
    .composite([{
      input: resizedLogo,
      left: Math.max(0, left),
      top: Math.max(0, top),
    }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function createInstagramImage(
  imageUrl: string,
  brand: Brand,
  logoUrl?: string | null,
  imageEffect: ImageEffect = 'none',
): Promise<Buffer> {
  assertAllowedImageUrl(imageUrl);
  const imageBuffer = await fetchImageBuffer(imageUrl);

  const width = 1080;
  const height = 1080;

  let squareImage = await sharp(imageBuffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();

  // Apply image effect before logo compositing
  squareImage = await applyImageEffect(squareImage, imageEffect, brand, width, height);

  return compositeLogoOnImage(squareImage, brand, 0.22, logoUrl);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxCharsPerLine: number = 30): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxCharsPerLine && currentLine.length > 0) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.trim());
  }

  return lines;
}

export type TextPosition = 'top' | 'center' | 'bottom';
export type OverlayStyle = 'editorial' | 'bold-card' | 'gradient-bar' | 'full-tint';
export type ImageEffect = 'none' | 'duotone' | 'color-blend' | 'vignette' | 'high-contrast';

// Brand color palettes inspired by competitor analysis:
// Affectly (like Calm/Headspace): soft teal gradients, warm and calming
// PaceBrain (like Strava/Nike Run Club): bold, energetic, high-contrast
const BRAND_STYLES = {
  affectly: {
    primary: '#14b8a6',      // teal-500
    secondary: '#0d9488',    // teal-600
    accent: '#2dd4bf',       // teal-400
    dark: '#134e4a',         // teal-900
    gradient1: '#0f766e',    // teal-700
    gradient2: '#115e59',    // teal-800
  },
  pacebrain: {
    primary: '#3b82f6',      // blue-500
    secondary: '#2563eb',    // blue-600
    accent: '#60a5fa',       // blue-400
    dark: '#1e3a5f',
    gradient1: '#1d4ed8',    // blue-700
    gradient2: '#1e40af',    // blue-800
  },
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/**
 * Apply a visual effect to the base image buffer (1080x1080 JPEG).
 * Effects modify the image itself before any text overlay or logo is composited.
 */
async function applyImageEffect(
  imageBuffer: Buffer,
  effect: ImageEffect,
  brand: Brand,
  width: number,
  height: number,
): Promise<Buffer> {
  if (effect === 'none') return imageBuffer;

  const colors = BRAND_STYLES[brand] || BRAND_STYLES.affectly;

  switch (effect) {
    case 'duotone': {
      // Grayscale → tint with brand primary color (Spotify-style monotone)
      const { r, g, b } = hexToRgb(colors.primary);
      return sharp(imageBuffer)
        .grayscale()
        .tint({ r, g, b })
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    case 'color-blend': {
      // Overlay brand color at 35% opacity using multiply blend mode
      const { r, g, b } = hexToRgb(colors.primary);
      const colorOverlay = Buffer.from(
        `<svg width="${width}" height="${height}">
          <rect width="${width}" height="${height}" fill="rgba(${r},${g},${b},0.35)"/>
        </svg>`
      );
      return sharp(imageBuffer)
        .composite([{ input: colorOverlay, blend: 'multiply' }])
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    case 'vignette': {
      // Dark radial vignette — draws focus to center
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.max(width, height) * 0.55;
      const vignetteSvg = Buffer.from(
        `<svg width="${width}" height="${height}">
          <defs>
            <radialGradient id="vig" cx="50%" cy="50%" r="50%">
              <stop offset="40%" stop-color="rgba(0,0,0,0)" />
              <stop offset="100%" stop-color="rgba(0,0,0,0.65)" />
            </radialGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="url(#vig)"/>
        </svg>`
      );
      return sharp(imageBuffer)
        .composite([{ input: vignetteSvg, blend: 'over' }])
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    case 'high-contrast': {
      // Boost saturation + brightness for punchy, vivid look
      return sharp(imageBuffer)
        .modulate({ brightness: 1.08, saturation: 1.4 })
        .sharpen({ sigma: 1.2 })
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    default:
      return imageBuffer;
  }
}

function buildOverlaySvg(
  width: number,
  height: number,
  lines: string[],
  brand: Brand,
  textPosition: TextPosition,
  style: OverlayStyle,
  fontSize: number,
): string {
  const colors = BRAND_STYLES[brand];
  const lineHeight = fontSize * 1.35;
  const textBlockH = lines.length * lineHeight;
  // 10% padding keeps text inside Instagram's thumbnail safe zone
  const pad = Math.round(width * 0.10);

  // Text Y based on position — kept inside the safe zone vertically too
  let textY: number;
  switch (textPosition) {
    case 'top':
      textY = pad + fontSize;
      break;
    case 'bottom':
      textY = height - pad - textBlockH + fontSize;
      break;
    case 'center':
    default:
      textY = (height - textBlockH) / 2 + fontSize;
      break;
  }

  const textLines = lines.map((line, i) =>
    `<tspan x="${width / 2}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n      ');

  // Shadow text (rendered behind main text for depth)
  const shadowLines = lines.map((line, i) =>
    `<tspan x="${width / 2}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n      ');

  switch (style) {
    case 'editorial': {
      // Calm / Nedra Tawwab style: full-image dark tint + large serif-like text + accent line
      const accentY = textPosition === 'top' ? textY - fontSize - 16 : textY + textBlockH + 16;
      return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.50)"/>
  <line x1="${width / 2 - 60}" y1="${accentY}" x2="${width / 2 + 60}" y2="${accentY}" stroke="${colors.accent}" stroke-width="3" stroke-linecap="round"/>
  <text x="${width / 2}" y="${textY + 3}" text-anchor="middle" font-family="sans-serif" font-weight="400" font-size="${fontSize}" fill="rgba(0,0,0,0.3)" letter-spacing="0.5">
      ${shadowLines}
  </text>
  <text x="${width / 2}" y="${textY}" text-anchor="middle" font-family="sans-serif" font-weight="400" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="0.5">
      ${textLines}
  </text>
</svg>`;
    }

    case 'bold-card': {
      // Headspace style: rounded card with brand gradient behind text
      const cardPad = 40;
      const cardH = textBlockH + cardPad * 2 + 20;
      const cardW = width - pad * 2;
      const cardX = pad;
      let cardY: number;
      switch (textPosition) {
        case 'top': cardY = pad; break;
        case 'bottom': cardY = height - pad - cardH; break;
        default: cardY = (height - cardH) / 2; break;
      }
      const cardTextY = cardY + cardPad + fontSize + 5;
      const cornerR = 24;

      return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.gradient1};stop-opacity:0.92"/>
      <stop offset="100%" style="stop-color:${colors.gradient2};stop-opacity:0.95"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.25)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cornerR}" ry="${cornerR}" fill="url(#cardGrad)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${cornerR}" ry="${cornerR}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  <text x="${width / 2}" y="${cardTextY}" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="-0.5">
      ${textLines}
  </text>
</svg>`;
    }

    case 'gradient-bar': {
      // Strava / Nike style: strong gradient from bottom + bold text
      const gradH = textBlockH + pad * 2 + 60;
      let gradTop: number;
      let gradDir: string;
      switch (textPosition) {
        case 'top':
          gradTop = 0;
          gradDir = 'x1="0" y1="0" x2="0" y2="1"';
          break;
        case 'bottom':
          gradTop = height - gradH;
          gradDir = 'x1="0" y1="1" x2="0" y2="0"';
          break;
        default:
          gradTop = (height - gradH) / 2;
          gradDir = 'x1="0" y1="0.5" x2="0" y2="0"';
          break;
      }

      return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="barGrad" ${gradDir}>
      <stop offset="0%" style="stop-color:${colors.dark};stop-opacity:0.90"/>
      <stop offset="50%" style="stop-color:${colors.gradient2};stop-opacity:0.80"/>
      <stop offset="100%" style="stop-color:rgba(0,0,0,0);stop-opacity:0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradTop}" width="${width}" height="${gradH}" fill="url(#barGrad)"/>
  <text x="${width / 2}" y="${textY + 3}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="rgba(0,0,0,0.35)" letter-spacing="-1">
      ${shadowLines}
  </text>
  <text x="${width / 2}" y="${textY}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="-1">
      ${textLines}
  </text>
  <line x1="${pad}" y1="${textY + textBlockH + 8}" x2="${pad + 80}" y2="${textY + textBlockH + 8}" stroke="${colors.accent}" stroke-width="4" stroke-linecap="round"/>
</svg>`;
    }

    case 'full-tint':
    default: {
      // Wysa / modern style: full brand-tinted overlay + centered text
      return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tintGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" style="stop-color:${colors.gradient1};stop-opacity:0.75"/>
      <stop offset="100%" style="stop-color:${colors.dark};stop-opacity:0.80"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#tintGrad)"/>
  <text x="${width / 2}" y="${textY + 3}" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${fontSize}" fill="rgba(0,0,0,0.2)">
      ${shadowLines}
  </text>
  <text x="${width / 2}" y="${textY}" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF">
      ${textLines}
  </text>
</svg>`;
    }
  }
}

export async function createInstagramImageWithText(
  imageUrl: string,
  brand: Brand,
  overlayText: string,
  textPosition: TextPosition = 'center',
  _textColor: string = '#FFFFFF',
  fontSize: number = 64,
  overlayStyle: OverlayStyle = 'editorial',
  logoUrl?: string | null
): Promise<Buffer> {
  assertAllowedImageUrl(imageUrl);
  const imageBuffer = await fetchImageBuffer(imageUrl);

  const width = 1080;
  const height = 1080;

  const squareImage = await sharp(imageBuffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();

  // Render text using sharp's native text input (Pango-based, works on Vercel)
  const colors = BRAND_STYLES[brand] || BRAND_STYLES.affectly;

  // Dark overlay tint
  const tintSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.50)"/>
  </svg>`;

  // Scale font size based on text length so short hooks don't dominate the image
  // Target: text should occupy roughly the same visual proportion as the CSS preview
  const charCount = overlayText.length;
  let scaledFontSize: number;
  if (charCount <= 20) scaledFontSize = Math.min(fontSize, 110);
  else if (charCount <= 35) scaledFontSize = Math.min(fontSize, 90);
  else if (charCount <= 50) scaledFontSize = Math.min(fontSize, 72);
  else scaledFontSize = Math.min(fontSize, 58);

  // Create text image using sharp's text input (Pango rendering)
  const textImage = await sharp({
    text: {
      text: `<span foreground="white"><b>${escapeXml(overlayText)}</b></span>`,
      rgba: true,
      width: width - 200,
      align: 'center',
      font: `sans ${scaledFontSize}`,
      dpi: 72,
    },
  })
    .png()
    .toBuffer();

  // Get text dimensions for positioning
  const textMeta = await sharp(textImage).metadata();
  const textW = textMeta.width || 400;
  const textH = textMeta.height || 100;

  let textTop: number;
  switch (textPosition) {
    case 'top': textTop = 100; break;
    case 'bottom': textTop = height - textH - 100; break;
    default: textTop = Math.max(0, Math.floor((height - textH) / 2)); break;
  }
  const textLeft = Math.max(0, Math.floor((width - textW) / 2));

  // Add text shadow by compositing a darkened version first
  const shadowImage = await sharp(textImage)
    .modulate({ brightness: 0 })
    .ensureAlpha(0.4)
    .toBuffer();

  // Teal accent line below the text (matches CSS preview)
  const lineWidth = 120;
  const lineTop = textTop + textH + 16;
  const lineLeft = Math.floor((width - lineWidth) / 2);
  const accentSvg = `<svg width="${lineWidth}" height="4" xmlns="http://www.w3.org/2000/svg">
    <rect width="${lineWidth}" height="4" rx="2" fill="${colors.accent}"/>
  </svg>`;

  const imageWithText = await sharp(squareImage)
    .composite([
      { input: Buffer.from(tintSvg), top: 0, left: 0 },
      { input: shadowImage, top: textTop + 3, left: textLeft + 3, blend: 'over' },
      { input: textImage, top: textTop, left: textLeft, blend: 'over' },
      { input: Buffer.from(accentSvg), top: lineTop, left: lineLeft, blend: 'over' },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  return compositeLogoOnImage(imageWithText, brand, 0.15, logoUrl);
}

export interface CarouselImageConfig {
  imageUrl: string;
  brand: Brand;
  overlayText?: string;
  textPosition?: TextPosition;
  textColor?: string;
  fontSize?: number;
  overlayStyle?: OverlayStyle;
}

export async function processCarouselImages(
  images: CarouselImageConfig[],
  logoUrl?: string | null
): Promise<Buffer[]> {
  const results = await Promise.all(
    images.map((config) => {
      if (config.overlayText) {
        return createInstagramImageWithText(
          config.imageUrl,
          config.brand,
          config.overlayText,
          config.textPosition ?? 'center',
          config.textColor ?? '#FFFFFF',
          config.fontSize ?? 64,
          config.overlayStyle ?? 'editorial',
          logoUrl
        );
      }
      return createInstagramImage(config.imageUrl, config.brand, logoUrl);
    })
  );
  return results;
}

export async function processLogos(): Promise<{ affectly: boolean; pacebrain: boolean }> {
  const results = { affectly: false, pacebrain: false };

  try {
    const affectlyOriginal = path.join(LOGOS_DIR, 'affectly-original.png');
    const affectlyOutput = path.join(LOGOS_DIR, 'affectly.png');
    await removeWhiteBackground(affectlyOriginal, affectlyOutput);
    results.affectly = true;
  } catch (error) {
    console.error('Failed to process Affectly logo:', error);
  }

  try {
    const pacebrainOriginal = path.join(LOGOS_DIR, 'pacebrain-original.png');
    const pacebrainOutput = path.join(LOGOS_DIR, 'pacebrain.png');
    await removeWhiteBackground(pacebrainOriginal, pacebrainOutput);
    results.pacebrain = true;
  } catch (error) {
    console.error('Failed to process PaceBrain logo:', error);
  }

  return results;
}
