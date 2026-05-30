import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { put } from '@vercel/blob';
import crypto from 'node:crypto';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/mov']);

export async function POST(request: NextRequest) {
  try {
    await getUserId();

    const formData = await request.formData();
    const file = formData.get('video');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'A video file is required' },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be 100MB or less' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'File must be a video (MP4, MOV, or QuickTime)' },
        { status: 400 },
      );
    }

    const blob = await put(
      `ad-videos/${crypto.randomUUID()}.mp4`,
      Buffer.from(await file.arrayBuffer()),
      { access: 'public', contentType: file.type },
    );

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to upload video' },
      { status: 500 },
    );
  }
}
