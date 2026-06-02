import { describe, it, expect } from 'vitest';
import { buildSnapshotRow, computeTrend } from '../insights-store';
import type { AdInsight } from '@/lib/meta/ad-insights';

const insight: AdInsight = {
  spend: 42.1, impressions: 18430, reach: 11200, clicks: 312, inlineLinkClicks: 268,
  ctr: 1.69, cpc: 0.13, frequency: 1.64, results: 268, resultType: 'link_click', currency: 'GBP',
};

describe('buildSnapshotRow', () => {
  it('maps an insight into a DB row keyed for upsert', () => {
    const row = buildSnapshotRow('uuid-1', 'ad1', '2026-06-02', insight);
    expect(row).toMatchObject({
      metaAdsId: 'uuid-1', adId: 'ad1', snapshotDate: '2026-06-02',
      spend: '42.1', impressions: 18430, ctr: '1.69', results: 268, currency: 'GBP',
    });
    expect(row.raw).toEqual(insight);
  });
});

describe('computeTrend', () => {
  it('returns up/down/flat deltas vs the prior snapshot', () => {
    expect(computeTrend(1.69, 1.20)).toEqual({ direction: 'up', delta: expect.closeTo(0.49, 2) });
    expect(computeTrend(0.35, 0.90)).toEqual({ direction: 'down', delta: expect.closeTo(-0.55, 2) });
    expect(computeTrend(1.0, 1.0)).toEqual({ direction: 'flat', delta: 0 });
  });
  it('treats a missing prior as flat with no delta', () => {
    expect(computeTrend(1.69, null)).toEqual({ direction: 'flat', delta: null });
  });
});
