import { describe, it, expect } from 'vitest';
import { normalizeImageUrlForDedup, buildDedupSet } from '../url-dedup';

describe('normalizeImageUrlForDedup', () => {
  it('passes through Pixabay URLs unchanged (no query string)', () => {
    const u = 'https://pixabay.com/get/g8d8e56a5905b108bac4a636f7a22780_1280.jpg';
    expect(normalizeImageUrlForDedup(u)).toBe(u);
  });

  it('strips Instagram CDN signed-URL params so the same photo dedups across fetches', () => {
    // Two fetches of the SAME IG media URL return different oh=/oe= signatures.
    // Stripping the query string isolates the path, which IS stable per photo.
    const fetch1 =
      'https://scontent.cdninstagram.com/v/t39.30808-6/426825234_18345.jpg?stp=dst-jpg_e35&_nc_ht=x&oh=00_AAA111&oe=68290000';
    const fetch2 =
      'https://scontent.cdninstagram.com/v/t39.30808-6/426825234_18345.jpg?stp=dst-jpg_e35&_nc_ht=x&oh=00_BBB222&oe=68340000';
    expect(normalizeImageUrlForDedup(fetch1)).toBe(
      normalizeImageUrlForDedup(fetch2),
    );
    expect(normalizeImageUrlForDedup(fetch1)).toBe(
      'https://scontent.cdninstagram.com/v/t39.30808-6/426825234_18345.jpg',
    );
  });

  it('strips Unsplash and Pexels query strings consistently', () => {
    const unsplash =
      'https://images.unsplash.com/photo-1505465049221-aeae08f5cc09?ixlib=rb-1.2.1&q=85';
    const pexels =
      'https://images.pexels.com/photos/3779662/pexels-photo-3779662.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750';
    expect(normalizeImageUrlForDedup(unsplash)).toBe(
      'https://images.unsplash.com/photo-1505465049221-aeae08f5cc09',
    );
    expect(normalizeImageUrlForDedup(pexels)).toBe(
      'https://images.pexels.com/photos/3779662/pexels-photo-3779662.jpeg',
    );
  });

  it('strips URL fragments and collapses trailing slashes', () => {
    expect(normalizeImageUrlForDedup('https://x.com/a.jpg#frag')).toBe(
      'https://x.com/a.jpg',
    );
    expect(normalizeImageUrlForDedup('https://x.com/a/')).toBe(
      'https://x.com/a',
    );
    expect(normalizeImageUrlForDedup('https://x.com/a/?q=1#f')).toBe(
      'https://x.com/a',
    );
  });

  it('returns empty string unchanged and trims whitespace', () => {
    expect(normalizeImageUrlForDedup('')).toBe('');
    expect(normalizeImageUrlForDedup('  https://x.com/a.jpg  ')).toBe(
      'https://x.com/a.jpg',
    );
  });
});

describe('buildDedupSet', () => {
  it('normalises every URL and skips null/empty entries', () => {
    const set = buildDedupSet([
      'https://x.com/a.jpg?v=1',
      null,
      'https://x.com/a.jpg?v=2',
      '',
      undefined,
      'https://x.com/b.jpg',
    ]);
    expect(set.size).toBe(2);
    expect(set.has('https://x.com/a.jpg')).toBe(true);
    expect(set.has('https://x.com/b.jpg')).toBe(true);
  });
});
