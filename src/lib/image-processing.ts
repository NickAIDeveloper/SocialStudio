import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');

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
  brand: 'affectly' | 'pacebrain',
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right',
  logoScale: number = 0.20
): Promise<Buffer> {
  // Use the icon-only version for PaceBrain (no "PACEBRAIN" text below)
  const logoFile = brand === 'pacebrain' ? 'pacebrain-icon.png' : `${brand}.png`;
  const logoPath = path.join(LOGOS_DIR, logoFile);

  try {
    await fs.access(logoPath);
  } catch {
    const originalPath = path.join(LOGOS_DIR, `${brand}-original.png`);
    await removeWhiteBackground(originalPath, logoPath);
  }

  const baseImage = sharp(baseImageBuffer);
  const baseMetadata = await baseImage.metadata();

  if (!baseMetadata.width || !baseMetadata.height) {
    throw new Error('Could not read base image dimensions');
  }

  const logoWidth = Math.round(baseMetadata.width * logoScale);

  const resizedLogo = await sharp(logoPath)
    .resize(logoWidth, null, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.5 })
    .png()
    .toBuffer();

  const logoMeta = await sharp(resizedLogo).metadata();
  const logoH = logoMeta.height || logoWidth;
  const logoW = logoMeta.width || logoWidth;

  const sidePadding = Math.round(baseMetadata.width * 0.04);
  // Instagram grid crops to 1:1 from center — if the image is taller than
  // square, the bottom gets clipped.  Keep the logo well inside the safe
  // zone so it's visible in both the feed (full image) and the grid
  // thumbnail (square crop).  For a 1080×1350 (4:5) image the bottom
  // ~135 px is hidden in the grid, so we use ≈12 % inset from the bottom.
  const bottomPadding = Math.round(baseMetadata.height * 0.12);

  let left: number;
  let top: number;

  switch (position) {
    case 'top-left':
      left = sidePadding;
      top = sidePadding;
      break;
    case 'top-right':
      left = baseMetadata.width - logoW - sidePadding;
      top = sidePadding;
      break;
    case 'bottom-left':
      left = sidePadding;
      top = baseMetadata.height - logoH - bottomPadding;
      break;
    case 'bottom-right':
    default:
      left = baseMetadata.width - logoW - sidePadding;
      top = baseMetadata.height - logoH - bottomPadding;
      break;
  }

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
  brand: 'affectly' | 'pacebrain',
  logoPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right'
): Promise<Buffer> {
  // Fetch the image
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // Resize to Instagram square (1080x1080)
  const squareImage = await sharp(imageBuffer)
    .resize(1080, 1080, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();

  return compositeLogoOnImage(squareImage, brand, logoPosition, 0.20);
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

function buildOverlaySvg(
  width: number,
  height: number,
  lines: string[],
  brand: 'affectly' | 'pacebrain',
  textPosition: TextPosition,
  style: OverlayStyle,
  fontSize: number,
): string {
  const colors = BRAND_STYLES[brand];
  const lineHeight = fontSize * 1.35;
  const textBlockH = lines.length * lineHeight;
  const pad = 80;

  // Text Y based on position
  let textY: number;
  switch (textPosition) {
    case 'top':
      textY = pad + fontSize + 20;
      break;
    case 'bottom':
      textY = height - pad - textBlockH + fontSize - 20;
      break;
    case 'center':
    default:
      textY = (height - textBlockH) / 2 + fontSize;
      break;
  }

  const textLines = lines.map((line, i) =>
    `<tspan x="50%" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n      ');

  // Shadow text (rendered behind main text for depth)
  const shadowLines = lines.map((line, i) =>
    `<tspan x="50%" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n      ');

  switch (style) {
    case 'editorial': {
      // Calm / Nedra Tawwab style: full-image dark tint + large serif-like text + accent line
      const accentY = textPosition === 'top' ? textY - fontSize - 16 : textY + textBlockH + 16;
      return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.50)"/>
  <line x1="${width / 2 - 60}" y1="${accentY}" x2="${width / 2 + 60}" y2="${accentY}" stroke="${colors.accent}" stroke-width="3" stroke-linecap="round"/>
  <text x="50%" y="${textY + 3}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="400" font-size="${fontSize}" fill="rgba(0,0,0,0.3)" letter-spacing="0.5">
      ${shadowLines}
  </text>
  <text x="50%" y="${textY}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="400" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="0.5">
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
  <text x="50%" y="${cardTextY}" text-anchor="middle" font-family="'Segoe UI', Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="-0.5">
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
  <text x="50%" y="${textY + 3}" text-anchor="middle" font-family="'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="rgba(0,0,0,0.35)" letter-spacing="-1">
      ${shadowLines}
  </text>
  <text x="50%" y="${textY}" text-anchor="middle" font-family="'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="-1">
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
  <text x="50%" y="${textY + 3}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fontSize}" fill="rgba(0,0,0,0.2)">
      ${shadowLines}
  </text>
  <text x="50%" y="${textY}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fontSize}" fill="#FFFFFF">
      ${textLines}
  </text>
</svg>`;
    }
  }
}

export async function createInstagramImageWithText(
  imageUrl: string,
  brand: 'affectly' | 'pacebrain',
  logoPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' = 'bottom-right',
  overlayText: string,
  textPosition: TextPosition = 'center',
  _textColor: string = '#FFFFFF',
  fontSize: number = 64,
  overlayStyle: OverlayStyle = 'editorial'
): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());

  const width = 1080;
  const height = 1080;

  const squareImage = await sharp(imageBuffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();

  const lines = wrapText(overlayText, 24);
  const svg = buildOverlaySvg(width, height, lines, brand, textPosition, overlayStyle, fontSize);

  const imageWithText = await sharp(squareImage)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return compositeLogoOnImage(imageWithText, brand, logoPosition, 0.18);
}

export interface CarouselImageConfig {
  imageUrl: string;
  brand: 'affectly' | 'pacebrain';
  logoPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  overlayText?: string;
  textPosition?: TextPosition;
  textColor?: string;
  fontSize?: number;
  overlayStyle?: OverlayStyle;
}

export async function processCarouselImages(
  images: CarouselImageConfig[]
): Promise<Buffer[]> {
  const results = await Promise.all(
    images.map((config) => {
      if (config.overlayText) {
        return createInstagramImageWithText(
          config.imageUrl,
          config.brand,
          config.logoPosition ?? 'bottom-right',
          config.overlayText,
          config.textPosition ?? 'center',
          config.textColor ?? '#FFFFFF',
          config.fontSize ?? 64,
          config.overlayStyle ?? 'editorial'
        );
      }
      return createInstagramImage(
        config.imageUrl,
        config.brand,
        config.logoPosition ?? 'bottom-right'
      );
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
