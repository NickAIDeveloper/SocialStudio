import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { putMock, sharpMock } = vi.hoisted(() => {
  const metaMock = vi.fn().mockResolvedValue({ format: 'png' });
  const sharpInstance = {
    metadata: metaMock,
    resize: () => sharpInstance,
    jpeg: () => sharpInstance,
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('x')),
  };
  const sharpMock = vi.fn(() => sharpInstance);
  return {
    putMock: vi.fn().mockResolvedValue({ url: 'https://blob/x.jpg' }),
    sharpMock,
  };
});

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@vercel/blob', () => ({ put: putMock }));
vi.mock('sharp', () => ({ default: sharpMock }));

import { POST } from '../route';

/**
 * Build a NextRequest whose formData() returns the provided FormData stub.
 * We stub request.formData directly to avoid jsdom ↔ undici File class
 * mismatch (NextRequest parses its body using undici File, not the DOM File).
 */
function makeRequest(fd: FormData): NextRequest {
  const req = new NextRequest(new URL('http://localhost/api/ads/upload-image'), {
    method: 'POST',
    body: new Uint8Array(), // placeholder body — we override formData below
  });
  req.formData = async () => fd;
  return req;
}

describe('POST /api/ads/upload-image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putMock.mockResolvedValue({ url: 'https://blob/x.jpg' });
  });

  it('returns 400 when no file is provided', async () => {
    const fd = new FormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('An image file is required');
  });

  it('returns 400 when file type is not allowed', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });
    const fd = new FormData();
    fd.set('image', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('image');
  });

  it('returns 400 when file exceeds max size', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { configurable: true, value: 9 * 1024 * 1024 });
    const fd = new FormData();
    fd.set('image', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('8MB');
  });

  it('returns 200 with blob url for valid png upload', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    const fd = new FormData();
    fd.set('image', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toBe('https://blob/x.jpg');
    expect(putMock).toHaveBeenCalledOnce();
    const [blobPath, , opts] = putMock.mock.calls[0];
    expect(blobPath).toMatch(/^ad-images\/.+\.jpg$/);
    expect(opts.access).toBe('public');
    expect(opts.contentType).toBe('image/jpeg');
  });

  it('returns 401 when getUserId rejects with Unauthorized', async () => {
    const { getUserId } = await import('@/lib/auth-helpers');
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    const fd = new FormData();
    fd.set('image', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when sharp metadata rejects (non-image bytes)', async () => {
    const sharpInstance = sharpMock.mock.results[0]?.value ?? sharpMock();
    vi.spyOn(sharpInstance, 'metadata').mockRejectedValueOnce(new Error('unsupported image format'));
    const file = new File([new Uint8Array([1, 2, 3])], 'fake.png', { type: 'image/png' });
    const fd = new FormData();
    fd.set('image', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('File is not a valid image');
  });

  it('returns 400 when sharp metadata returns no format', async () => {
    const sharpInstance = sharpMock.mock.results[0]?.value ?? sharpMock();
    vi.spyOn(sharpInstance, 'metadata').mockResolvedValueOnce({});
    const file = new File([new Uint8Array([1, 2, 3])], 'empty.png', { type: 'image/png' });
    const fd = new FormData();
    fd.set('image', file);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('File is not a valid image');
  });
});
