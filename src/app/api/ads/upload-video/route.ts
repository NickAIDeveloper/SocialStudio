import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { uploadAdVideo, waitForVideoReady } from '@/lib/meta/ads';
import { put } from '@vercel/blob';
import crypto from 'node:crypto';

// Meta video processing (upload to /advideos + poll until READY) can take a
// while, so this is the route where waiting belongs. publish/ only references
// the already-ready videoId and never polls.
export const maxDuration = 300;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
// Browsers send 'video/quicktime' for .mov; drop the non-standard 'video/mov'.
const ALLOWED_TYPES = new Set(['video/mp4', 'video/quicktime']);

interface AdAccountAsset { id: string }

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();

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
        { error: 'File must be a video (MP4 or QuickTime)' },
        { status: 400 },
      );
    }

    // Resolve the user's Meta account + ad account before storing, so we can
    // push the video to Meta and wait for it to be ready here (not at publish).
    const [account] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, userId))
      .limit(1);
    if (!account) {
      return NextResponse.json(
        { error: 'meta_not_connected', message: 'Connect your Meta account first.' },
        { status: 400 },
      );
    }

    if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'token_expired', message: 'Reconnect your Meta account.' },
        { status: 401 },
      );
    }

    const assets = (account.assets as { adAccounts?: AdAccountAsset[] } | null) ?? {};
    const adAccountId = account.selectedAdAccountId ?? assets.adAccounts?.[0]?.id ?? null;
    if (!adAccountId) {
      return NextResponse.json(
        { error: 'meta_not_connected', message: 'No ad account is available on your Meta connection.' },
        { status: 400 },
      );
    }

    const token = decrypt(account.accessToken);

    const blob = await put(
      `ad-videos/${crypto.randomUUID()}.mp4`,
      Buffer.from(await file.arrayBuffer()),
      { access: 'public', contentType: file.type },
    );

    // Push to Meta + poll until READY. The Blob is already stored, so if Meta
    // processing fails we surface a friendly 502 without losing the upload.
    try {
      const videoId = await uploadAdVideo(token, adAccountId, blob.url);
      await waitForVideoReady(token, videoId, { tries: 25, delayMs: 3000 });
      return NextResponse.json({ url: blob.url, videoId });
    } catch {
      return NextResponse.json(
        {
          error: 'video_processing_failed',
          message: 'Your video could not be processed by Meta. Try a shorter/smaller MP4 and re-upload.',
        },
        { status: 502 },
      );
    }
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
