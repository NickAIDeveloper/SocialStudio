// src/lib/brain/__tests__/caption-format.test.ts
import { describe, it, expect } from 'vitest';
import { extractCaptionFormat } from '../caption-format';
import type { IgMediaItem } from '@/lib/meta/ig-analytics';

function mkPost(opts: {
  caption: string;
  reach?: number;
  format?: 'REELS' | 'IMAGE' | 'CAROUSEL_ALBUM';
}): IgMediaItem {
  return {
    id: Math.random().toString(36).slice(2),
    caption: opts.caption,
    media_type: opts.format === 'CAROUSEL_ALBUM' ? 'CAROUSEL_ALBUM' : 'IMAGE',
    media_product_type: opts.format === 'REELS' ? 'REELS' : undefined,
    timestamp: '2026-05-01T12:00:00+0000',
    insights: opts.reach != null ? [{ name: 'reach', period: 'lifetime', values: [{ value: opts.reach }] }] : [],
  } as unknown as IgMediaItem;
}

describe('extractCaptionFormat', () => {
  it('returns empty shape on empty input', () => {
    const r = extractCaptionFormat([]);
    expect(r.sampleSize).toBe(0);
    expect(r.emojiPosition).toBe('none');
    expect(r.listMarkers).toBe('none');
  });

  it('falls back to all_posts when fewer than 5 reach-tagged posts', () => {
    const media = [
      mkPost({ caption: 'Short hook\n\nBody one.\n\nBody two.' }),
      mkPost({ caption: 'Another hook\n\nWith body.' }),
    ];
    const r = extractCaptionFormat(media);
    expect(r.sourceWindow).toBe('all_posts_fallback');
    expect(r.sampleSize).toBe(2);
  });

  it('selects top 25% by reach when enough posts', () => {
    const winners = Array.from({ length: 8 }, (_, i) =>
      mkPost({ caption: `Hot take ${i}? 🔥\n\nBody body body.\n\nLink in bio`, reach: 50000 + i * 1000 })
    );
    const losers = Array.from({ length: 12 }, (_, i) =>
      mkPost({ caption: `Boring ${i}\n\n#x #y #z #a`, reach: 1000 + i })
    );
    const r = extractCaptionFormat([...winners, ...losers]);
    expect(r.sourceWindow).toBe('top_25pct_by_reach');
    // top 25% of 20 = 5; should pick from winners (highest reach)
    expect(r.sampleSize).toBeGreaterThanOrEqual(5);
    expect(r.ctaTerminalPhrases).toContain('link in bio');
    expect(r.questionCountAvg).toBeGreaterThan(0);
    expect(r.emojiDensity).not.toBe('low');
  });

  it('detects numbered lists and emoji opener', () => {
    const media = [
      mkPost({ caption: '🔥 Hot tips\n\n1. First\n2. Second\n3. Third' }),
      mkPost({ caption: '✨ Three things\n\n1. One\n2. Two\n3. Three' }),
      mkPost({ caption: '💡 Quick wins\n\n1. Hello\n2. World\n3. Foo' }),
    ];
    const r = extractCaptionFormat(media);
    expect(r.listMarkers).toBe('numbered');
    expect(r.emojiPosition).toBe('opener');
  });
});
