import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { putMock } = vi.hoisted(() => ({
  putMock: vi.fn().mockResolvedValue({ url: 'https://blob/video.mp4' }),
}));

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@vercel/blob', () => ({ put: putMock }));

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

describe('POST /api/ads/upload-video', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putMock.mockResolvedValue({ url: 'https://blob/video.mp4' });
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

  it('returns 200 with blob url for valid mp4 upload and put is called', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' });
    const fd = new FormData();
    fd.set('video', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://blob/video.mp4');
    expect(putMock).toHaveBeenCalledOnce();
    const [blobPath, , opts] = putMock.mock.calls[0];
    expect(blobPath).toMatch(/^ad-videos\/.+\.mp4$/);
    expect(opts.access).toBe('public');
    expect(opts.contentType).toBe('video/mp4');
  });

  it('returns 401 when getUserId rejects with Unauthorized', async () => {
    const { getUserId } = await import('@/lib/auth-helpers');
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' });
    const fd = new FormData();
    fd.set('video', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });
});
