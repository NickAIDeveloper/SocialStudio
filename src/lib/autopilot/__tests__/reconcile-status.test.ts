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
    });
  });

  it('marks a scheduled post Published even when Buffer has no dueAt', () => {
    const patch = reconcileStatus('scheduled', { found: true, status: 'sent', dueAt: null });
    expect(patch).toEqual({ status: 'published', publishedAt: null });
  });

  it('marks a scheduled post Failed when Buffer no longer has it (ghost)', () => {
    const patch = reconcileStatus('scheduled', { found: false });
    expect(patch).toEqual({ status: 'failed', publishedAt: null });
  });

  it('marks a scheduled post Failed when Buffer reports a failure status', () => {
    expect(reconcileStatus('scheduled', { found: true, status: 'service_failed', dueAt: null }))
      .toEqual({ status: 'failed', publishedAt: null });
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
      .toEqual({ status: 'published', publishedAt: null });
  });
});
