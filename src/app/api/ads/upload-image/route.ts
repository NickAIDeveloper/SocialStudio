import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import crypto from 'node:crypto';

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB — intentionally higher than the 2MB logo route; ad creatives need more room
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export async function POST(request: NextRequest) {
  try {
    await getUserId();

    const formData = await request.formData();
    const file = formData.get('image');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'An image file is required' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be 8MB or less' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'File must be an image (PNG, JPG, or WebP)' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic-bytes probe: rejects spoofed/non-image files with 400 rather than 500
    try {
      const meta = await sharp(buffer).metadata();
      if (!meta.format) throw new Error('no format');
    } catch {
      return NextResponse.json({ error: 'File is not a valid image' }, { status: 400 });
    }

    const out = await sharp(buffer)
      .resize(1500, 1500, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    const blob = await put(`ad-images/${crypto.randomUUID()}.jpg`, out, {
      access: 'public',
      contentType: 'image/jpeg',
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 },
    );
  }
}
