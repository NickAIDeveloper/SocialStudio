import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { putMock, state, uploadAdVideoMock, waitForVideoReadyMock } = vi.hoisted(() => ({
  putMock: vi.fn().mockResolvedValue({ url: 'https://blob/video.mp4' }),
  uploadAdVideoMock: vi.fn().mockResolvedValue('vid_1'),
  waitForVideoReadyMock: vi.fn().mockResolvedValue(undefined),
  state: {
    // null → select returns [] for metaAccounts
    account: {
      userId: 'u1',
      accessToken: 'enc',
      selectedAdAccountId: 'act_1',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      assets: { adAccounts: [{ id: 'act_1' }] },
    } as Record<string, unknown> | null,
  },
}));

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@vercel/blob', () => ({ put: putMock }));
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn().mockReturnValue('TOKEN') }));
vi.mock('@/lib/meta/ads', () => ({
  uploadAdVideo: uploadAdVideoMock,
  waitForVideoReady: waitForVideoReadyMock,
}));
vi.mock('@/lib/db/schema', () => ({ metaAccounts: { __t: 'metaAccounts' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(state.account ? [state.account] : []),
        }),
      }),
    }),
  },
}));

import { POST } from '../route';

/**
 * Build a NextRequest whose formData() returns the provided FormData stub.
 * We stub request.formData directly to avoid jsdom ↔ undici File class
 * mismatch (NextRequest parses its body using undici File, not the DOM File).
 */
function makeRequest(fd: FormData): NextRequest {
  const req = new NextRequest(new URL('http://localhost/api/ads/upload-video'), {
    method: 'POST',
    body: new Uint8Array(), // placeholder body — we override formData below
  });
  req.formData = async () => fd;
  return req;
}

function mp4Request(): NextRequest {
  const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' });
  const fd = new FormData();
  fd.set('video', file);
  return makeRequest(fd);
}

describe('POST /api/ads/upload-video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putMock.mockResolvedValue({ url: 'https://blob/video.mp4' });
    uploadAdVideoMock.mockResolvedValue('vid_1');
    waitForVideoReadyMock.mockResolvedValue(undefined);
    state.account = {
      userId: 'u1',
      accessToken: 'enc',
      selectedAdAccountId: 'act_1',
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      assets: { adAccounts: [{ id: 'act_1' }] },
    };
  });

  it('returns 400 when no file is provided', async () => {
    const fd = new FormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('video');
  });

  it('returns 400 when file type is not allowed', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.avi', { type: 'video/avi' });
    const fd = new FormData();
    fd.set('video', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('video');
  });

  it('returns 400 when file exceeds max size', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { configurable: true, value: 101 * 1024 * 1024 });
    const fd = new FormData();
    fd.set('video', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('100MB');
  });

  it('returns 200 with url + videoId for valid mp4 upload; put + Meta upload/poll are called', async () => {
    const res = await POST(mp4Request());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://blob/video.mp4');
    expect(json.videoId).toBe('vid_1');
    expect(putMock).toHaveBeenCalledOnce();
    const [blobPath, , opts] = putMock.mock.calls[0];
    expect(blobPath).toMatch(/^ad-videos\/.+\.mp4$/);
    expect(opts.access).toBe('public');
    expect(opts.contentType).toBe('video/mp4');
    expect(uploadAdVideoMock).toHaveBeenCalledOnce();
    expect(uploadAdVideoMock).toHaveBeenCalledWith('TOKEN', 'act_1', 'https://blob/video.mp4');
    expect(waitForVideoReadyMock).toHaveBeenCalledOnce();
  });

  it('returns 400 when the user has no Meta account', async () => {
    state.account = null;
    const res = await POST(mp4Request());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('meta_not_connected');
  });

  it('returns 401 token_expired when the Meta token has expired', async () => {
    state.account = {
      userId: 'u1',
      accessToken: 'enc',
      selectedAdAccountId: 'act_1',
      tokenExpiresAt: new Date(Date.now() - 1000),
      assets: { adAccounts: [{ id: 'act_1' }] },
    };
    const res = await POST(mp4Request());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('token_expired');
  });

  it('returns 502 video_processing_failed when waitForVideoReady throws', async () => {
    waitForVideoReadyMock.mockRejectedValueOnce(new Error('processing timed out'));
    const res = await POST(mp4Request());
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('video_processing_failed');
  });

  it('returns 401 when getUserId rejects with Unauthorized', async () => {
    const { getUserId } = await import('@/lib/auth-helpers');
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(mp4Request());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });
});
