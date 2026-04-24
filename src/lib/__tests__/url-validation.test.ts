import { describe, it, expect } from 'vitest';
import { assertAllowedImageUrl } from '../url-validation';

describe('assertAllowedImageUrl', () => {
  it('accepts inline data: image URIs', () => {
    expect(() => assertAllowedImageUrl('data:image/jpeg;base64,ABC')).not.toThrow();
  });

  it('accepts explicit allowlist hosts', () => {
    expect(() => assertAllowedImageUrl('https://cdn.pixabay.com/a.jpg')).not.toThrow();
    expect(() => assertAllowedImageUrl('https://images.unsplash.com/a.jpg')).not.toThrow();
    expect(() => assertAllowedImageUrl('https://images.pexels.com/a.jpg')).not.toThrow();
    expect(() => assertAllowedImageUrl('https://raw.githubusercontent.com/x/y/z.jpg')).not.toThrow();
  });

  it('accepts Vercel Blob subdomains', () => {
    expect(() =>
      assertAllowedImageUrl('https://abc123.public.blob.vercel-storage.com/logo.png'),
    ).not.toThrow();
  });

  it('accepts Instagram CDN hosts (cdninstagram.com + fbcdn.net)', () => {
    expect(() =>
      assertAllowedImageUrl('https://scontent-lax3-1.cdninstagram.com/v/abc.jpg'),
    ).not.toThrow();
    expect(() =>
      assertAllowedImageUrl('https://scontent.xx.fbcdn.net/v/abc.jpg'),
    ).not.toThrow();
  });

  it('rejects non-https schemes', () => {
    expect(() => assertAllowedImageUrl('http://cdn.pixabay.com/a.jpg')).toThrow(/HTTPS/);
    expect(() => assertAllowedImageUrl('file:///etc/passwd')).toThrow(/HTTPS/);
    expect(() => assertAllowedImageUrl('javascript:alert(1)')).toThrow(/HTTPS/);
  });

  it('rejects internal / unlisted hosts (SSRF guard)', () => {
    expect(() => assertAllowedImageUrl('https://169.254.169.254/latest/meta-data/')).toThrow(
      /not permitted/,
    );
    expect(() => assertAllowedImageUrl('https://evil.example.com/x.jpg')).toThrow(/not permitted/);
  });

  it('rejects lookalike hosts that only suffix-match partially', () => {
    // "cdninstagram.com.attacker.com" should NOT match ".cdninstagram.com"
    expect(() =>
      assertAllowedImageUrl('https://cdninstagram.com.attacker.com/x.jpg'),
    ).toThrow(/not permitted/);
    expect(() =>
      assertAllowedImageUrl('https://fbcdn.net.attacker.com/x.jpg'),
    ).toThrow(/not permitted/);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertAllowedImageUrl('not a url')).toThrow(/Invalid/);
  });
});
