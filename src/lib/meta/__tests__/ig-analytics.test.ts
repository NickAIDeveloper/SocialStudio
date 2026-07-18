import { describe, it, expect } from 'vitest';
import { getMetric, type IgMediaItem } from '../ig-analytics';

function withInsight(name: string, value: number): IgMediaItem {
  return {
    id: 'm1',
    media_type: 'IMAGE',
    insights: [{ name, period: 'lifetime', values: [{ value }] }],
  };
}

describe('getMetric saves/saved aliasing', () => {
  it("reads the real IG metric name 'saved' when asked for 'saves'", () => {
    // Instagram's API returns the saves metric under the name "saved" — the
    // request/response mismatch used to 400 the whole insights call.
    expect(getMetric(withInsight('saved', 42), 'saves')).toBe(42);
  });

  it("still reads the legacy 'saves' name (test fixtures / older payloads)", () => {
    expect(getMetric(withInsight('saves', 7), 'saves')).toBe(7);
  });

  it('returns null when neither name is present', () => {
    expect(getMetric(withInsight('reach', 100), 'saves')).toBeNull();
  });

  it('reads reach directly by name', () => {
    expect(getMetric(withInsight('reach', 250), 'reach')).toBe(250);
  });
});

describe('IG per-post metric constants (regression guard for the saves->saved bug)', () => {
  it("request the metric as 'saved', never 'saves' — a single bad metric 400s the whole insights call", async () => {
    const { IG_MEDIA_METRICS_FEED } = await import('../instagram-client');
    const { PER_POST_METRICS } = await import('../../brain/snapshot-ig');
    for (const list of [IG_MEDIA_METRICS_FEED, PER_POST_METRICS]) {
      expect(list).toContain('saved');
      expect(list).not.toContain('saves');
    }
  });
});
