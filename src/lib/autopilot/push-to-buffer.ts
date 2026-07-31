// src/lib/autopilot/push-to-buffer.ts
//
// The autopilot's one path for handing a generated post to Buffer, with a
// pre-flight channel-health check in front of it.
//
// Why the pre-flight: Buffer's createPost SUCCEEDS against a channel whose
// Instagram credential has expired. The post sits in Buffer, fails at its due
// time ("Buffer has lost authorization to post on your behalf" / "Invalid
// Credentials"), and the caption + composited image are gone — we'd written
// status='scheduled' and only ever reconciled it to 'failed'. Prod lost the
// 2026-07-28, 07-29 and 07-30 pacebrain posts that way before anyone noticed.
//
// So: ask Buffer whether the channel is alive first, and if it isn't, keep the
// post as a DRAFT. Nothing is lost — reconnect the channel and the drafts are
// still there to schedule.

import { createPost, getChannelHealth } from '@/lib/buffer';
import { checkChannelPushable } from './channel-health';

export interface PushResult {
  bufferPostId: string | null;
  // 'draft' means "we deliberately did not push" — the post is still saved and
  // recoverable. 'scheduled' means Buffer accepted it.
  status: 'draft' | 'scheduled';
  // Stable, greppable code (+ human instruction) for autopilotSettings.lastError.
  lastError: string | null;
  // Non-fatal caveat worth showing next to a successful push.
  warning: string | null;
}

interface ChannelTarget {
  bufferChannelId: string | null;
  bufferOrganizationId: string | null;
}

interface ScheduledPost {
  text: string;
  scheduledAt: Date;
  imageUrls?: string[];
}

export async function pushScheduledPost(
  apiKey: string,
  target: ChannelTarget,
  post: ScheduledPost,
): Promise<PushResult> {
  const { bufferChannelId, bufferOrganizationId } = target;
  if (!bufferChannelId || !bufferOrganizationId) {
    return {
      bufferPostId: null,
      status: 'draft',
      lastError: 'buffer_channel_not_selected',
      warning: null,
    };
  }

  // Fail OPEN on a health-lookup error. A Buffer outage (or a change to the
  // channels query) must never turn into a silent, total posting freeze — that
  // would be a worse bug than the one this guards against. Degrade to the old
  // push-and-hope behaviour and surface the degradation.
  let warning: string | null = null;
  let check = { blocked: false as const, warning: null as string | null };
  try {
    const healthByChannel = await getChannelHealth(apiKey, bufferOrganizationId);
    const result = checkChannelPushable(healthByChannel.get(bufferChannelId));
    if (result.blocked) {
      return {
        bufferPostId: null,
        status: 'draft',
        lastError: `${result.code}: ${result.message}`,
        warning: null,
      };
    }
    check = result;
  } catch (err) {
    warning = `Buffer channel health check failed (${
      err instanceof Error ? err.message : String(err)
    }) — scheduled without it.`;
  }

  try {
    const created = await createPost(apiKey, {
      channelId: bufferChannelId,
      organizationId: bufferOrganizationId,
      text: post.text,
      mode: 'customScheduled',
      scheduledAt: post.scheduledAt.toISOString(),
      imageUrls: post.imageUrls,
    });
    return {
      bufferPostId: created.id,
      status: 'scheduled',
      lastError: null,
      warning: warning ?? check.warning,
    };
  } catch (err) {
    return {
      bufferPostId: null,
      status: 'draft',
      lastError: `buffer_push_failed: ${err instanceof Error ? err.message : String(err)}`,
      warning,
    };
  }
}
