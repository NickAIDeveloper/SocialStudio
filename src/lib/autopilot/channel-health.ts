// src/lib/autopilot/channel-health.ts
//
// Decides whether a Buffer channel can actually receive a post RIGHT NOW.
//
// Why this exists: Buffer holds its own Instagram/Meta credential per channel,
// separate from the IG token this app refreshes (see lib/meta/ig-token.ts). When
// Buffer's credential expires, `createPost` still SUCCEEDS — Buffer accepts the
// post into the dead channel and only fails at publish time with
// "Invalid Credentials" / "Buffer has lost authorization to post on your
// behalf". We then reconcile the post to 'failed' and the generated caption +
// image are gone.
//
// Confirmed in prod 2026-07-30: channel pacebrain.app read isDisconnected=true
// after its last good send on Jul 24, and the Jul 28/29/30 posts all errored,
// while affectly.app (same API key, same code path) kept sending. Buffer's API
// exposes isDisconnected/isLocked/isQueuePaused on Channel, so this is cheaply
// detectable BEFORE we spend a post on it.
//
// Buffer exposes no channel/auth mutation (the full mutation list is
// createPost, deletePost, editPost, movePostInQueue, the postTemplate trio and
// createIdea), so recovery is always a human re-auth at buffer.com. Code's job
// is to refuse the doomed push and say so loudly.

// A channel's health as reported by Buffer. The Booleans are nullable in
// Buffer's schema, so every flag here is `boolean | null | undefined`.
export interface BufferChannelHealth {
  id: string;
  name: string;
  service: string;
  isDisconnected?: boolean | null;
  isLocked?: boolean | null;
  isQueuePaused?: boolean | null;
}

export type ChannelPushCheck =
  // Push it: the channel will accept and publish. `warning` carries a
  // non-fatal caveat (paused queue) worth showing in the UI.
  | { blocked: false; warning: string | null }
  // Don't push: the post would be lost. `code` goes to autopilotSettings.lastError
  // (stable, greppable); `message` is the human-facing instruction.
  | { blocked: true; code: string; message: string };

// Passing `undefined` means "the configured channel id wasn't in Buffer's
// channel list at all" — treat as blocked, it's the old NotFoundError class.
export function checkChannelPushable(
  health: BufferChannelHealth | undefined,
): ChannelPushCheck {
  if (!health) {
    return {
      blocked: true,
      code: 'buffer_channel_missing',
      message:
        'The Buffer channel this brand posts to no longer exists in Buffer. ' +
        'Pick a channel again in autopilot settings.',
    };
  }

  // Ordered most- to least-severe: a disconnected channel is the failure that
  // actually loses posts, so it must win any tie with a paused queue.
  if (health.isDisconnected === true) {
    return {
      blocked: true,
      code: 'buffer_channel_disconnected',
      message:
        `Buffer has lost authorization to post to ${health.name}. ` +
        'Reconnect that channel at buffer.com, then Run now — the posts held ' +
        'as drafts are waiting.',
    };
  }

  if (health.isLocked === true) {
    return {
      blocked: true,
      code: 'buffer_channel_locked',
      message:
        `Buffer has locked ${health.name} (usually a plan/channel-limit issue). ` +
        'Resolve it at buffer.com to resume scheduling.',
    };
  }

  // Deliberate and reversible: Buffer keeps the post and publishes it when the
  // queue is unpaused, so pushing loses nothing. Surface it, don't block on it.
  if (health.isQueuePaused === true) {
    return {
      blocked: false,
      warning: `${health.name}'s queue is paused in Buffer — scheduled posts won't go out until you resume it.`,
    };
  }

  return { blocked: false, warning: null };
}
