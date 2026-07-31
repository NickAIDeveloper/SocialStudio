import { describe, it, expect } from 'vitest';
import { reconcileStatus } from '../reconcile-status';

describe('reconcileStatus', () => {
  it('marks a scheduled post Published once Buffer reports it sent', () => {
    const patch = reconcileStatus('scheduled', {
      found: true,
      status: 'sent',
      dueAt: '2026-06-04T23:00:00.000Z',
    });
    expect(patch).toEqual({
      status: 'published',
      publishedAt: new Date('2026-06-04T23:00:00.000Z'),
      failureReason: null,
    });
  });

  it('marks a scheduled post Published even when Buffer has no dueAt', () => {
    const patch = reconcileStatus('scheduled', { found: true, status: 'sent', dueAt: null });
    expect(patch).toEqual({ status: 'published', publishedAt: null, failureReason: null });
  });

  it('marks a scheduled post Failed when Buffer no longer has it (ghost)', () => {
    const patch = reconcileStatus('scheduled', { found: false });
    expect(patch).toEqual({
      status: 'failed',
      publishedAt: null,
      failureReason: 'Buffer no longer has this post — it was dropped after a failed publish.',
    });
  });

  it('marks a scheduled post Failed when Buffer reports a failure status', () => {
    expect(reconcileStatus('scheduled', { found: true, status: 'service_failed', dueAt: null }))
      .toEqual({ status: 'failed', publishedAt: null, failureReason: null });
  });

  it("records Buffer's own explanation on a failed post", () => {
    // The exact prod payload for the disconnected pacebrain.app channel. Without
    // this the UI showed a bare "Failed" and the cause was invisible.
    const patch = reconcileStatus('scheduled', {
      found: true,
      status: 'error',
      dueAt: null,
      error: {
        message:
          'It looks like Buffer has lost authorization to post on your behalf. Please refresh your channel to resume scheduling.',
        rawError: 'Invalid Credentials',
      },
    });
    expect(patch).toEqual({
      status: 'failed',
      publishedAt: null,
      failureReason:
        'It looks like Buffer has lost authorization to post on your behalf. Please refresh your channel to resume scheduling. (Invalid Credentials)',
    });
  });

  it("falls back to Buffer's raw error when there is no friendly message", () => {
    const patch = reconcileStatus('scheduled', {
      found: true,
      status: 'error',
      dueAt: null,
      error: { message: null, rawError: 'Invalid Credentials' },
    });
    expect(patch).toEqual({
      status: 'failed',
      publishedAt: null,
      failureReason: 'Invalid Credentials',
    });
  });

  it('ignores a stale error on a post Buffer actually sent', () => {
    // A post that errored once, was retried and went out must not carry a
    // failureReason — it is published, not failed.
    const patch = reconcileStatus('scheduled', {
      found: true,
      status: 'sent',
      dueAt: '2026-07-24T02:00:00.000Z',
      error: { message: 'transient blip', rawError: null },
    });
    expect(patch).toEqual({
      status: 'published',
      publishedAt: new Date('2026-07-24T02:00:00.000Z'),
      failureReason: null,
    });
  });

  it('leaves a still-upcoming post untouched', () => {
    expect(reconcileStatus('scheduled', { found: true, status: 'scheduled', dueAt: null })).toBeNull();
    expect(reconcileStatus('scheduled', { found: true, status: 'sending', dueAt: null })).toBeNull();
  });

  it('never churns terminal local statuses', () => {
    expect(reconcileStatus('published', { found: false })).toBeNull();
    expect(reconcileStatus('failed', { found: true, status: 'sent', dueAt: null })).toBeNull();
    expect(reconcileStatus('draft', { found: false })).toBeNull();
  });

  it('is case-insensitive on Buffer status', () => {
    expect(reconcileStatus('scheduled', { found: true, status: 'SENT', dueAt: null }))
      .toEqual({ status: 'published', publishedAt: null, failureReason: null });
  });
});
