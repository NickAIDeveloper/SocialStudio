import { describe, it, expect } from 'vitest';
import { checkChannelPushable, type BufferChannelHealth } from '../channel-health';

const healthy: BufferChannelHealth = {
  id: 'ch1',
  name: 'pacebrain.app',
  service: 'instagram',
  isDisconnected: false,
  isLocked: false,
  isQueuePaused: false,
};

describe('checkChannelPushable', () => {
  it('allows a push to a healthy channel', () => {
    expect(checkChannelPushable(healthy)).toEqual({ blocked: false, warning: null });
  });

  it('blocks a disconnected channel with an actionable reason', () => {
    // The real prod failure (2026-07-24 → 2026-07-30): Buffer's own Instagram
    // credential for pacebrain.app expired. Buffer still ACCEPTS createPost into
    // it, then fails at publish time with "Invalid Credentials" — so the only
    // way to save the post is to refuse the push up front.
    const result = checkChannelPushable({ ...healthy, isDisconnected: true });
    expect(result.blocked).toBe(true);
    if (!result.blocked) throw new Error('expected blocked');
    expect(result.code).toBe('buffer_channel_disconnected');
    expect(result.message).toContain('pacebrain.app');
    expect(result.message).toMatch(/reconnect/i);
  });

  it('blocks a locked channel', () => {
    const result = checkChannelPushable({ ...healthy, isLocked: true });
    expect(result.blocked).toBe(true);
    if (!result.blocked) throw new Error('expected blocked');
    expect(result.code).toBe('buffer_channel_locked');
  });

  it('blocks when the channel is gone from Buffer entirely', () => {
    // Covers the older "Channel not found" class: the configured channel id no
    // longer exists in the org, so createPost would throw NotFoundError.
    const result = checkChannelPushable(undefined);
    expect(result.blocked).toBe(true);
    if (!result.blocked) throw new Error('expected blocked');
    expect(result.code).toBe('buffer_channel_missing');
  });

  it('allows but warns on a paused queue', () => {
    // A paused queue is deliberate and reversible: Buffer holds the post and
    // publishes it on unpause, so blocking would cost content for no reason.
    const result = checkChannelPushable({ ...healthy, isQueuePaused: true });
    if (result.blocked) throw new Error('expected not blocked');
    expect(result.warning).toMatch(/paused/i);
  });

  it('reports disconnected ahead of a paused queue when both are true', () => {
    const result = checkChannelPushable({ ...healthy, isDisconnected: true, isQueuePaused: true });
    expect(result.blocked).toBe(true);
    if (!result.blocked) throw new Error('expected blocked');
    expect(result.code).toBe('buffer_channel_disconnected');
  });

  it('tolerates a channel whose health flags Buffer left null', () => {
    // Buffer types these Booleans as nullable; null must read as "fine", not
    // "broken", or a schema quirk would silently halt all scheduling.
    const result = checkChannelPushable({
      ...healthy,
      isDisconnected: null,
      isLocked: null,
      isQueuePaused: null,
    });
    expect(result).toEqual({ blocked: false, warning: null });
  });
});
