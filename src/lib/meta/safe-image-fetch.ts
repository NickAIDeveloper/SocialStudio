// SSRF-hardened image fetch.
//
// The ad image URL is user-editable (StepCreative lets the user paste any URL),
// then fetched server-side in uploadAdImage and uploaded to Meta. Without
// validation a crafted URL (e.g. http://169.254.169.254/ cloud metadata, or an
// internal 10.x/192.168.x host) would make our server issue the request — a
// classic SSRF. We allow arbitrary PUBLIC image hosts (so the paste-your-own
// feature keeps working) but block private/loopback/link-local/metadata
// targets, require https, follow redirects manually re-validating each hop, and
// cap content-type + size.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24 reserved/test
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240/4 reserved
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true; // loopback / unspecified
  if (/^fe[89ab]/.test(s)) return true; // link-local fe80::/10
  if (/^f[cd]/.test(s)) return true; // unique-local fc00::/7
  const mapped = s.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPrivate(mapped[1]); // IPv4-mapped ::ffff:a.b.c.d
  return false;
}

function ipIsPrivate(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4IsPrivate(ip);
  if (version === 6) return ipv6IsPrivate(ip);
  return true; // not a valid IP literal → unsafe
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 literal brackets
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    const results = await lookup(host, { all: true });
    addresses = results.map((r) => r.address);
    if (addresses.length === 0) throw new Error('Image host did not resolve');
  }
  for (const addr of addresses) {
    if (ipIsPrivate(addr)) {
      throw new Error(`Refusing to fetch image from a non-public address (${addr})`);
    }
  }
}

// Fetch image bytes from a user-supplied URL with SSRF protections.
export async function fetchImageBytes(rawUrl: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid image URL');
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'https:') throw new Error('Image URL must use https');
    await assertPublicHost(url.hostname);

    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Image redirect missing Location header');
      url = new URL(location, url); // resolve relative, re-validate on next loop
      continue;
    }
    if (!res.ok) throw new Error(`Failed to fetch ad image (${res.status})`);

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new Error(`Ad image must be an image (got "${contentType || 'unknown'}")`);
    }
    const declaredLen = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BYTES) {
      throw new Error('Ad image is too large');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error('Ad image is too large');
    return buf;
  }
  throw new Error('Too many image redirects');
}
