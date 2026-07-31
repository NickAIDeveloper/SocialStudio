import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getChannelHealthFn, createPostFn } = vi.hoisted(() => ({
  getChannelHealthFn: vi.fn(),
  createPostFn: vi.fn(),
}));

vi.mock('@/lib/buffer', () => ({
  getChannelHealth: getChannelHealthFn,
  createPost: createPostFn,
}));

import { pushScheduledPost } from '../push-to-buffer';

const SETTINGS = { bufferChannelId: 'ch1', bufferOrganizationId: 'org1' };
const POST = {
  text: 'Unfiltered truth about mile 18',
  scheduledAt: new Date('2026-08-01T02:00:00.000Z'),
  imageUrls: ['https://example.com/a.jpg'],
};

function health(over: Record<string, unknown> = {}) {
  return new Map([
    ['ch1', {
      id: 'ch1',
      name: 'pacebrain.app',
      service: 'instagram',
      isDisconnected: false,
      isLocked: false,
      isQueuePaused: false,
      ...over,
    }],
  ]);
}

describe('pushScheduledPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelHealthFn.mockResolvedValue(health());
    createPostFn.mockResolvedValue({ id: 'bp-1' });
  });

  it('schedules to Buffer when the channel is healthy', async () => {
    const result = await pushScheduledPost('key', SETTINGS, POST);
    expect(result).toEqual({
      bufferPostId: 'bp-1',
      status: 'scheduled',
      lastError: null,
      warning: null,
    });
    expect(createPostFn).toHaveBeenCalledWith('key', expect.objectContaining({
      channelId: 'ch1',
      organizationId: 'org1',
      mode: 'customScheduled',
      scheduledAt: '2026-08-01T02:00:00.000Z',
      imageUrls: ['https://example.com/a.jpg'],
    }));
  });

  it('holds the post as a draft instead of pushing into a disconnected channel', async () => {
    getChannelHealthFn.mockResolvedValue(health({ isDisconnected: true }));

    const result = await pushScheduledPost('key', SETTINGS, POST);

    // The whole point: Buffer would ACCEPT this post and lose it at publish
    // time, so the generated caption + image must stay as a recoverable draft.
    expect(createPostFn).not.toHaveBeenCalled();
    expect(result.status).toBe('draft');
    expect(result.bufferPostId).toBeNull();
    expect(result.lastError).toContain('buffer_channel_disconnected');
    expect(result.lastError).toContain('pacebrain.app');
  });

  it('holds the post as a draft when the configured channel is gone from Buffer', async () => {
    getChannelHealthFn.mockResolvedValue(new Map());
    const result = await pushScheduledPost('key', SETTINGS, POST);
    expect(createPostFn).not.toHaveBeenCalled();
    expect(result.status).toBe('draft');
    expect(result.lastError).toContain('buffer_channel_missing');
  });

  it('still pushes when the queue is merely paused, carrying the warning', async () => {
    getChannelHealthFn.mockResolvedValue(health({ isQueuePaused: true }));
    const result = await pushScheduledPost('key', SETTINGS, POST);
    expect(result.status).toBe('scheduled');
    expect(result.bufferPostId).toBe('bp-1');
    expect(result.warning).toMatch(/paused/i);
  });

  it('pushes anyway when the health check itself fails (fail-open)', async () => {
    // A Buffer outage or a schema change on the health query must never become a
    // silent, total posting freeze. Degrade to the old behaviour and say so.
    getChannelHealthFn.mockRejectedValue(new Error('HTTP 503'));

    const result = await pushScheduledPost('key', SETTINGS, POST);

    expect(createPostFn).toHaveBeenCalled();
    expect(result.status).toBe('scheduled');
    expect(result.warning).toMatch(/health/i);
  });

  it('reports a draft when no channel is configured', async () => {
    const result = await pushScheduledPost('key', { bufferChannelId: null, bufferOrganizationId: 'org1' }, POST);
    expect(getChannelHealthFn).not.toHaveBeenCalled();
    expect(result).toEqual({
      bufferPostId: null,
      status: 'draft',
      lastError: 'buffer_channel_not_selected',
      warning: null,
    });
  });

  it('reports a draft when Buffer rejects the createPost', async () => {
    createPostFn.mockRejectedValue(new Error('Buffer error: Channel not found'));
    const result = await pushScheduledPost('key', SETTINGS, POST);
    expect(result.status).toBe('draft');
    expect(result.lastError).toContain('buffer_push_failed');
    expect(result.lastError).toContain('Channel not found');
  });

  it('omits imageUrls entirely when there is no image', async () => {
    await pushScheduledPost('key', SETTINGS, { ...POST, imageUrls: undefined });
    expect(createPostFn).toHaveBeenCalledWith('key', expect.objectContaining({ imageUrls: undefined }));
  });
});
