// src/app/api/autopilot/schedule/route.ts
//
// POST /api/autopilot/schedule?postId=<uuid>
//
// Promotes an autopilot draft to "scheduled" by pushing it to Buffer at the
// brand's best-slot time (from the brain) or 24h from now as a fallback.
// Used by the queue UI's "Schedule to Buffer" button on the preview modal.
//
// Why it's separate from /api/autopilot/run:
//   - `run` is the cron path: it generates a NEW post and conditionally pushes
//     to Buffer when mode=auto.
//   - `schedule` is the human-in-the-loop path: the user reviewed a draft and
//     wants to publish THIS specific row. No generation, just buffer push.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { autopilotSettings, brands, linkedAccounts, posts } from '@/lib/db/schema';
import { createPost } from '@/lib/buffer';
import { decrypt } from '@/lib/encryption';
import { readBrandBrain } from '@/lib/brain/consume';
import { nextPostSlot, type Frequency } from '@/lib/autopilot/schedule';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauth' }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');
  if (!postId) {
    return NextResponse.json({ error: 'missing_postId' }, { status: 400 });
  }

  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)));
  if (!post) {
    return NextResponse.json({ error: 'post_not_found' }, { status: 404 });
  }
  if (post.source !== 'autopilot') {
    return NextResponse.json(
      { error: 'not_autopilot', message: 'This endpoint only schedules autopilot drafts.' },
      { status: 400 },
    );
  }
  if (post.status !== 'draft') {
    return NextResponse.json(
      {
        error: 'not_draft',
        message: `Post is "${post.status}", not a draft. Nothing to schedule.`,
      },
      { status: 409 },
    );
  }
  if (!post.brandId) {
    return NextResponse.json({ error: 'no_brand' }, { status: 400 });
  }

  // Buffer needs a publicly hosted image URL. We prefer the composited image
  // (which has the hook overlay + brand logo); fall back to raw stock photo.
  const imageUrl = post.processedImageUrl ?? post.sourceImageUrl;

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, post.brandId), eq(brands.userId, userId)));
  if (!brand) {
    return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });
  }

  const [settings] = await db
    .select()
    .from(autopilotSettings)
    .where(eq(autopilotSettings.brandId, post.brandId));
  if (!settings?.bufferChannelId || !settings.bufferOrganizationId) {
    return NextResponse.json(
      {
        error: 'buffer_channel_not_selected',
        message:
          'Pick a Buffer channel for this brand in Autopilot settings before scheduling.',
      },
      { status: 422 },
    );
  }

  const [link] = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'buffer')));
  if (!link?.accessToken) {
    return NextResponse.json(
      {
        error: 'buffer_not_connected',
        message: 'Connect Buffer in Linked Accounts first.',
      },
      { status: 422 },
    );
  }
  let apiKey: string;
  try {
    apiKey = decrypt(link.accessToken);
  } catch {
    return NextResponse.json(
      {
        error: 'buffer_token_decrypt_failed',
        message: 'Buffer token could not be read. Reconnect Buffer in Linked Accounts.',
      },
      { status: 500 },
    );
  }

  // Compute scheduledAt: prefer brain's best slot (matches autopilot=auto
  // behavior); fall back to ~24h from now so the user always has SOME concrete
  // schedule rather than scheduling to "now" and surprising them.
  const now = new Date();
  let scheduledAt: Date;
  try {
    const brain = await readBrandBrain(post.brandId);
    if (brain?.formula?.bestSlot) {
      // Frequency-aware: gap cadences schedule to the next best HOUR, weekly to
      // the best weekday. Matches the cron path so manual + auto never diverge.
      scheduledAt = nextPostSlot(
        settings.frequency as Frequency,
        brain.formula.bestSlot,
        now,
      );
    } else {
      scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  } catch {
    // Brain failures must never block scheduling — fall through to 24h default.
    scheduledAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  // Buffer call. Concatenate caption + hashtags the same way the cron path
  // does so users see consistent output.
  const fullText = `${post.caption ?? ''}\n\n${post.hashtags ?? ''}`.trim();
  let bufferPostId: string;
  try {
    const created = await createPost(apiKey, {
      channelId: settings.bufferChannelId,
      organizationId: settings.bufferOrganizationId,
      text: fullText,
      mode: 'customScheduled',
      scheduledAt: scheduledAt.toISOString(),
      imageUrls: imageUrl ? [imageUrl] : undefined,
    });
    bufferPostId = created.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'buffer_push_failed', message },
      { status: 502 },
    );
  }

  const [updated] = await db
    .update(posts)
    .set({
      status: 'scheduled',
      scheduledAt,
      bufferPostId,
      updatedAt: now,
    })
    .where(eq(posts.id, post.id))
    .returning({
      id: posts.id,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      bufferPostId: posts.bufferPostId,
    });

  return NextResponse.json({
    ok: true,
    post: updated,
    scheduledAt: scheduledAt.toISOString(),
  });
}
