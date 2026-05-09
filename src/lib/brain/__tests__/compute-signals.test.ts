import { describe, it, expect } from 'vitest';
import { computeSignals } from '../compute-signals';
import mediaFixture from './fixtures/ig-media.json';
import insightsFixture from './fixtures/ig-insights-28d.json';
import type { IgMediaItem } from '@/lib/meta/ig-analytics';

describe('computeSignals', () => {
  it('produces deterministic output for fixed input', () => {
    const result = computeSignals({
      windowDays: 28,
      ig: {
        media: mediaFixture.data as unknown as IgMediaItem[],
        insightsByMediaId: insightsFixture as Record<string, unknown>,
      },
      ads: null,
      competitors: [],
    });

    expect(result.topFormat).toBe('REEL');
    expect(typeof result.topSlotDow).toBe('number');
    expect(typeof result.topSlotHour).toBe('number');
    expect(result.captionShape.avgLines).toBeGreaterThan(0);
    expect(result.competitorSummary.totalCompetitors).toBe(0);
  });

  it('returns null top_format when ig is null', () => {
    const result = computeSignals({
      windowDays: 28,
      ig: null,
      ads: null,
      competitors: [],
    });
    expect(result.topFormat).toBeNull();
  });
});
