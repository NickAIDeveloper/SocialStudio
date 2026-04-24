import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({
  getUserId: vi.fn().mockResolvedValue('u1'),
}));

vi.mock('@/lib/image-processing', () => ({
  createInstagramImageWithText: vi.fn(),
}));

import { POST } from '../route';
import { getUserId } from '@/lib/auth-helpers';
import { createInstagramImageWithText } from '@/lib/image-processing';

function makeReq(body: unknown) {
  return new NextRequest('http://test/api/smart-posts/render', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(getUserId).mockResolvedValue('u1');
  vi.mocked(createInstagramImageWithText).mockResolvedValue(Buffer.from('IMG'));
});

describe('POST /api/smart-posts/render', () => {
  it('returns a data URL on happy path', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'https://cdn.pixabay.com/a.jpg',
      hookText: 'Hello',
      brand: 'affectly',
      textPosition: 'center',
      overlayStyle: 'editorial',
      logoUrl: null,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns 401 when unauthorized', async () => {
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeReq({
      sourceImageUrl: 'https://cdn.pixabay.com/a.jpg',
      hookText: 'Hi',
      brand: 'affectly',
      textPosition: 'center',
      overlayStyle: 'editorial',
      logoUrl: null,
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when sourceImageUrl is missing', async () => {
    const res = await POST(makeReq({
      hookText: 'Hi', brand: 'affectly', textPosition: 'center', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('sourceImageUrl_required');
  });

  it('returns 400 when brand is invalid', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'https://cdn.pixabay.com/x.jpg', hookText: 'Hi',
      brand: 'mystery-brand', textPosition: 'center', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_brand');
  });

  it('returns 400 when textPosition is invalid', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'https://cdn.pixabay.com/x.jpg', hookText: 'Hi', brand: 'affectly',
      textPosition: 'left', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when overlayStyle is invalid', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'https://cdn.pixabay.com/x.jpg', hookText: 'Hi', brand: 'affectly',
      textPosition: 'center', overlayStyle: 'neon-sparkles', logoUrl: null,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_overlay_style');
  });

  it('returns 400 when sourceImageUrl is not an allowlisted host (SSRF guard)', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'http://169.254.169.254/latest/meta-data/',
      hookText: 'Hi', brand: 'affectly', textPosition: 'center',
      overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_source_image_url');
  });

  it('returns 400 when hookText is missing', async () => {
    const res = await POST(makeReq({
      sourceImageUrl: 'https://cdn.pixabay.com/x.jpg', brand: 'affectly',
      textPosition: 'center', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('hookText_required');
  });

  it('returns 502 when overlay throws', async () => {
    vi.mocked(createInstagramImageWithText).mockRejectedValueOnce(new Error('sharp boom'));
    const res = await POST(makeReq({
      sourceImageUrl: 'https://cdn.pixabay.com/x.jpg', hookText: 'Hi', brand: 'affectly',
      textPosition: 'center', overlayStyle: 'editorial', logoUrl: null,
    }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('render_failed');
  });
});
