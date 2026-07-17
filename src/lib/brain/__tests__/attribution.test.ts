import { describe, it, expect } from 'vitest';
import { captionMatchKey, matchMediaToPosts, type PostForAttribution } from '../attribution';
import type { IgMediaItem } from '@/lib/meta/ig-analytics';

function media(
  id: string,
  caption: string,
  timestamp: string,
  m: { reach?: number; saves?: number; likes?: number; comments?: number; shares?: number } = {},
): IgMediaItem {
  return {
    id,
    caption,
    media_type: 'IMAGE',
    timestamp,
    like_count: m.likes,
    comments_count: m.comments,
    insights: [
      { name: 'reach', period: 'lifetime', values: [{ value: m.reach ?? 0 }] },
      { name: 'saves', period: 'lifetime', values: [{ value: m.saves ?? 0 }] },
      { name: 'shares', period: 'lifetime', values: [{ value: m.shares ?? 0 }] },
    ],
  };
}

describe('captionMatchKey', () => {
  it('strips hashtags, framing, and lowercases', () => {
    // IG returns our caption with OEmbed framing + appended hashtags.
    const ig = 'pacebrain.app on July 17, 2026: "Nobody tells you this. I ran a 10K." #running #pacebrain';
    const ours = 'Nobody tells you this. I ran a 10K.\n\n#running #pacebrain';
    expect(captionMatchKey(ig)).toBe(captionMatchKey(ours));
    expect(captionMatchKey(ig)).toBe('nobody tells you this. i ran a 10k.');
  });

  it('is empty for blank / hashtag-only captions', () => {
    expect(captionMatchKey('')).toBe('');
    expect(captionMatchKey('   ')).toBe('');
    expect(captionMatchKey('#a #b')).toBe('');
  });
});

describe('matchMediaToPosts', () => {
  const posts: PostForAttribution[] = [
    { id: 'p1', caption: 'Nobody tells you this. I ran a 10K.', publishedAt: new Date('2026-07-17T02:00:00Z') },
    { id: 'p2', caption: 'Your brain rebels silently. Here is why.', publishedAt: new Date('2026-07-18T09:00:00Z') },
    { id: 'p3', caption: 'Never posted this one', publishedAt: new Date('2026-07-10T00:00:00Z') },
  ];

  it('matches by caption despite appended hashtags and returns real metrics', () => {
    const m = [
      media('ig1', 'Nobody tells you this. I ran a 10K. #running', '2026-07-17T02:01:00Z', { reach: 900, saves: 40, likes: 120, comments: 15, shares: 8 }),
      media('ig2', 'Your brain rebels silently. Here is why. #study', '2026-07-18T09:01:00Z', { reach: 300, saves: 5 }),
    ];
    const out = matchMediaToPosts(m, posts);
    expect(out).toHaveLength(2);
    const p1 = out.find((a) => a.postId === 'p1')!;
    expect(p1.mediaId).toBe('ig1');
    expect(p1.metrics).toMatchObject({ reach: 900, saves: 40, likes: 120, comments: 15, shares: 8 });
  });

  it('skips posts with no matching media', () => {
    const out = matchMediaToPosts([media('ig1', 'Something unrelated', '2026-07-17T02:00:00Z')], posts);
    expect(out).toHaveLength(0);
  });

  it('disambiguates duplicate captions by timestamp proximity to publishedAt', () => {
    const dupPosts: PostForAttribution[] = [
      { id: 'pa', caption: 'Same caption', publishedAt: new Date('2026-07-01T00:00:00Z') },
      { id: 'pb', caption: 'Same caption', publishedAt: new Date('2026-07-20T00:00:00Z') },
    ];
    const m = [
      media('old', 'Same caption', '2026-07-01T00:05:00Z', { reach: 10 }),
      media('new', 'Same caption', '2026-07-20T00:05:00Z', { reach: 999 }),
    ];
    const out = matchMediaToPosts(m, dupPosts);
    expect(out.find((a) => a.postId === 'pa')!.mediaId).toBe('old');
    expect(out.find((a) => a.postId === 'pb')!.mediaId).toBe('new');
  });

  it('rejects a match older than maxDayGap (recycled caption guard)', () => {
    const p: PostForAttribution[] = [{ id: 'p', caption: 'Recycled line', publishedAt: new Date('2026-07-20T00:00:00Z') }];
    const m = [media('old', 'Recycled line', '2026-01-01T00:00:00Z', { reach: 500 })];
    expect(matchMediaToPosts(m, p)).toHaveLength(0);
  });
});
