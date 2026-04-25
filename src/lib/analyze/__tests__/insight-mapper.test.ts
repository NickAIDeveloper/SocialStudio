import { describe, it, expect } from 'vitest';
import { mapDeepProfileToCards } from '../insight-mapper';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

const baseProfile: DeepProfile = {
  igUserId: 'ig1',
  handle: 'me',
  followerCount: 1000,
  sampleSize: 12,
  medians: { reach: 100, views: 200, likes: 10, comments: 1, saves: 0, shares: 0 },
  formatPerformance: [
    { format: 'REEL', count: 5, medianReach: 230, medianSaves: 4, medianShares: 2, liftVsOverall: 2.3 },
    { format: 'IMAGE', count: 5, medianReach: 80, medianSaves: 1, medianShares: 0, liftVsOverall: 0.8 },
    { format: 'CAROUSEL', count: 2, medianReach: 100, medianSaves: 2, medianShares: 1, liftVsOverall: 1.0 },
  ],
  captionLengthSweetSpot: { shortMedian: 50, mediumMedian: 200, longMedian: 80, winner: 'medium' },
  hookPatterns: [
    { pattern: 'Question hook', avgReach: 240, occurrences: 4, exampleCaptions: ['Why is your...'] },
    { pattern: 'Stat hook', avgReach: 180, occurrences: 3, exampleCaptions: ['9 out of 10...'] },
  ],
  topicSignals: { winning: ['running'], losing: ['tech'] },
  timing: {
    heatmap: [],
    bestSlots: [{ day: 'Tuesday', hour: 9, medianReach: 250 }],
  },
};

describe('mapDeepProfileToCards', () => {
  it('returns empty array when profile is null', () => {
    expect(mapDeepProfileToCards(null)).toEqual([]);
  });

  it('builds a best-format card from the highest liftVsOverall format', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const formatCard = cards.find((c) => c.id === 'best-format');
    expect(formatCard).toBeTruthy();
    expect(formatCard?.title).toContain('REEL');
    expect(formatCard?.verdict).toBe('positive');
    expect(formatCard?.summary).toContain('2.3');
  });

  it('builds a caption-length card naming the winner', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const lenCard = cards.find((c) => c.id === 'caption-length-sweet-spot');
    expect(lenCard).toBeTruthy();
    expect(lenCard?.title.toLowerCase()).toContain('medium');
  });

  it('builds a top-slot card from the first bestSlot', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const slotCard = cards.find((c) => c.id === 'best-time-slot');
    expect(slotCard).toBeTruthy();
    expect(slotCard?.title.toLowerCase()).toMatch(/tuesday|9/);
  });

  it('builds a top-hook card from hookPatterns[0]', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const hookCard = cards.find((c) => c.id === 'top-hook');
    expect(hookCard).toBeTruthy();
    expect(hookCard?.summary).toContain('Question hook');
  });

  it('skips cards when source data is missing', () => {
    const stripped: DeepProfile = {
      ...baseProfile,
      formatPerformance: [],
      hookPatterns: [],
      timing: { heatmap: [], bestSlots: [] },
    };
    const cards = mapDeepProfileToCards(stripped);
    expect(cards.find((c) => c.id === 'best-format')).toBeUndefined();
    expect(cards.find((c) => c.id === 'top-hook')).toBeUndefined();
    expect(cards.find((c) => c.id === 'best-time-slot')).toBeUndefined();
    expect(cards.find((c) => c.id === 'caption-length-sweet-spot')).toBeTruthy();
  });
});
