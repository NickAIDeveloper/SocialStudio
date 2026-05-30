import { describe, it, expect, vi, beforeEach } from 'vitest';

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ default: { lookup: lookupMock }, lookup: lookupMock }));
import { lookup } from 'node:dns/promises';
import { fetchImageBytes } from '../safe-image-fetch';

interface FakeResOpts {
  status?: number;
  contentType?: string | null;
  contentLength?: string | null;
  location?: string | null;
  body?: Uint8Array;
}
function fakeRes(o: FakeResOpts = {}) {
  const status = o.status ?? 200;
  const body = o.body ?? new Uint8Array([1, 2, 3, 4]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (k: string) => {
        const key = k.toLowerCase();
        if (key === 'content-type') return o.contentType === undefined ? 'image/jpeg' : o.contentType;
        if (key === 'content-length') return o.contentLength ?? null;
        if (key === 'location') return o.location ?? null;
        return null;
      },
    },
    arrayBuffer: async () => body.buffer,
  };
}

function setFetch(...responses: ReturnType<typeof fakeRes>[]) {
  let fn = vi.fn();
  for (const r of responses) fn = fn.mockResolvedValueOnce(r);
  (global as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('fetchImageBytes (SSRF guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
  });

  it('rejects non-https URLs', async () => {
    await expect(fetchImageBytes('http://cdn.pixabay.com/x.jpg')).rejects.toThrow(/https/i);
  });

  it('rejects an invalid URL', async () => {
    await expect(fetchImageBytes('not a url')).rejects.toThrow(/invalid image url/i);
  });

  it('rejects a private IPv4 literal host (RFC1918)', async () => {
    await expect(fetchImageBytes('https://10.0.0.5/x.jpg')).rejects.toThrow(/non-public/i);
  });

  it('rejects the cloud-metadata link-local address', async () => {
    await expect(fetchImageBytes('https://169.254.169.254/latest/meta-data')).rejects.toThrow(/non-public/i);
  });

  it('rejects a hostname that DNS-resolves to a loopback address', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(fetchImageBytes('https://evil.example.com/x.jpg')).rejects.toThrow(/non-public/i);
  });

  it('rejects a non-image content-type', async () => {
    setFetch(fakeRes({ contentType: 'text/html' }));
    await expect(fetchImageBytes('https://cdn.pixabay.com/x')).rejects.toThrow(/must be an image/i);
  });

  it('returns bytes for a public https image', async () => {
    setFetch(fakeRes({ contentType: 'image/jpeg', body: new Uint8Array([9, 9, 9]) }));
    const buf = await fetchImageBytes('https://cdn.pixabay.com/x.jpg');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBe(3);
  });

  it('follows a redirect and re-validates the new host', async () => {
    // first hop redirects to a public host, second returns the image
    setFetch(
      fakeRes({ status: 302, location: 'https://images.example.com/final.jpg' }),
      fakeRes({ contentType: 'image/png', body: new Uint8Array([1, 2]) }),
    );
    const buf = await fetchImageBytes('https://cdn.pixabay.com/x.jpg');
    expect(buf.byteLength).toBe(2);
    // lookup called for both the original and the redirect host
    expect(vi.mocked(lookup).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
