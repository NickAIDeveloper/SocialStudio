import { describe, it, expect, vi } from 'vitest';
import {
  publishToInstagram,
  isMissingPublishScope,
  InstagramPublishError,
  IG_CAPTION_MAX,
} from '../publish';

const noSleep = () => Promise.resolve();

function res(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

const base = { igUserId: '123', accessToken: 'tok', imageUrl: 'https://cdn.test/a.jpg', caption: 'hi' };

describe('publishToInstagram', () => {
  it('creates a container, waits for FINISHED, then publishes', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(res({ id: 'container-1' }))
      .mockResolvedValueOnce(res({ status_code: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(res({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(res({ id: 'media-9' }));

    const out = await publishToInstagram(base, { fetchImpl: fetchImpl as never, sleep: noSleep });

    expect(out).toEqual({ mediaId: 'media-9', containerId: 'container-1', polls: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  // The whole reason step 2 exists: publishing before Meta has fetched the
  // image fails, so we must not skip straight from container to publish.
  it('does not publish while the container is still IN_PROGRESS', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(res({ id: 'c' }))
      .mockResolvedValue(res({ status_code: 'IN_PROGRESS' }));

    await expect(
      publishToInstagram(base, { fetchImpl: fetchImpl as never, sleep: noSleep, maxPolls: 3 }),
    ).rejects.toThrow(/never finished processing/);

    const published = (fetchImpl.mock.calls as unknown[][]).some((c) =>
      String(c[0]).includes('media_publish'),
    );
    expect(published).toBe(false);
  });

  it('surfaces a rejected container instead of hanging', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(res({ id: 'c' }))
      .mockResolvedValueOnce(res({ status_code: 'ERROR', status: 'bad aspect ratio' }));

    await expect(
      publishToInstagram(base, { fetchImpl: fetchImpl as never, sleep: noSleep }),
    ).rejects.toThrow(/bad aspect ratio/);
  });

  it('rejects a non-public image url before calling Meta at all', async () => {
    const fetchImpl = vi.fn();
    await expect(
      publishToInstagram({ ...base, imageUrl: 'file:///tmp/a.jpg' }, { fetchImpl: fetchImpl as never }),
    ).rejects.toThrow(/public https URL/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('truncates an over-long caption rather than letting Meta 400 the post', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(res({ id: 'c' }))
      .mockResolvedValueOnce(res({ status_code: 'FINISHED' }))
      .mockResolvedValueOnce(res({ id: 'm' }));

    await publishToInstagram(
      { ...base, caption: 'x'.repeat(IG_CAPTION_MAX + 500) },
      { fetchImpl: fetchImpl as never, sleep: noSleep },
    );

    const body = (fetchImpl.mock.calls[0] as unknown[])[1] as { body: URLSearchParams };
    expect(body.body.get('caption')).toHaveLength(IG_CAPTION_MAX);
  });
});

describe('isMissingPublishScope', () => {
  it('recognises the 403 you get without instagram_business_content_publish', () => {
    const err = new InstagramPublishError('nope', 'container', 403,
      '{"error":{"message":"Application does not have permission for this action","code":10}}');
    expect(isMissingPublishScope(err)).toBe(true);
  });

  it('does not mistake an unrelated failure for a missing scope', () => {
    expect(isMissingPublishScope(new InstagramPublishError('boom', 'publish', 500))).toBe(false);
    expect(isMissingPublishScope(new Error('network'))).toBe(false);
  });
});
