// src/lib/autopilot/__tests__/topic-rotation.test.ts
import { describe, it, expect } from 'vitest';
import { pickNextTopic } from '../topic-rotation';

describe('pickNextTopic', () => {
  it('returns null when topics empty and no fallback', () => {
    expect(pickNextTopic({ topics: [], recentTopics: [] })).toBeNull();
  });

  it('returns fallback when topics empty', () => {
    expect(pickNextTopic({ topics: [], recentTopics: [], fallback: 'general' })).toBe('general');
  });

  it('picks highest medianEngagement when no recents', () => {
    const out = pickNextTopic({
      topics: [
        { topic: 'low', medianEngagement: 50 },
        { topic: 'high', medianEngagement: 200 },
        { topic: 'mid', medianEngagement: 100 },
      ],
      recentTopics: [],
    });
    expect(out).toBe('high');
  });

  it('skips topics in recentTopics', () => {
    const out = pickNextTopic({
      topics: [
        { topic: 'high', medianEngagement: 200 },
        { topic: 'mid', medianEngagement: 100 },
      ],
      recentTopics: ['high'],
    });
    expect(out).toBe('mid');
  });

  it('falls back to least-recently-used when all are recent', () => {
    const out = pickNextTopic({
      topics: [
        { topic: 'a', medianEngagement: 200 },
        { topic: 'b', medianEngagement: 100 },
      ],
      // a is most recent (idx 0); b was older (idx 1)
      recentTopics: ['a', 'b'],
    });
    // b has higher idx (=1) → least-recently-used → picked
    expect(out).toBe('b');
  });

  it('case-insensitive recent matching', () => {
    const out = pickNextTopic({
      topics: [
        { topic: 'Product Launch', medianEngagement: 200 },
        { topic: 'BTS', medianEngagement: 100 },
      ],
      recentTopics: ['product launch'],
    });
    expect(out).toBe('BTS');
  });
});
