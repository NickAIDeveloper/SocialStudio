import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { removeWhiteBackground } from '@/lib/image-processing';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

export async function POST(request: NextRequest) {
  try {
    await getUserId();

    const formData = await request.formData();
    const file = formData.get('logo');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'A logo file is required' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be 2MB or less' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'File must be an image (PNG, JPG, SVG, or WebP)' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Resize to max 1000x1000, preserving aspect ratio, convert to PNG
    const resizedBuffer = await sharp(buffer)
      .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    // Try to remove white background using temp files
    let finalBuffer = resizedBuffer;
    const tmpId = crypto.randomUUID();
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `logo-input-${tmpId}.png`);
    const outputPath = path.join(tmpDir, `logo-output-${tmpId}.png`);

    try {
      await fs.writeFile(inputPath, resizedBuffer);
      await removeWhiteBackground(inputPath, outputPath);
      finalBuffer = await fs.readFile(outputPath);
    } catch {
      // If background removal fails, use the resized version as-is
    } finally {
      // Clean up temp files
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }

    // Upload to Vercel Blob
    const blob = await put(`brand-logos/${tmpId}.png`, finalBuffer, {
      access: 'public',
      contentType: 'image/png',
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    );
  }
}
