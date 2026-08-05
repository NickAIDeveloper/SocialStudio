import { describe, it, expect } from 'vitest';
import { rankAds, buildAdsVerdict, type LeaderboardAdInput } from '../ads';

function ad(over: Partial<LeaderboardAdInput> = {}): LeaderboardAdInput {
  return {
    adId: 'a1',
    label: 'Summer promo',
    spend: 10,
    impressions: 1000,
    reach: 800,
    clicks: 20,
    results: 5,
    resultType: 'link_click',
    ...over,
  };
}

describe('rankAds', () => {
  it('drops ads that have never been shown to anyone', () => {
    expect(rankAds([ad({ impressions: 0, reach: 0 })])).toEqual([]);
  });

  it('ranks the cheapest cost per result first', () => {
    const rows = rankAds([
      ad({ adId: 'pricey', spend: 100, results: 5 }),
      ad({ adId: 'cheap', spend: 10, results: 5 }),
    ]);
    expect(rows.map((r) => r.adId)).toEqual(['cheap', 'pricey']);
    expect(rows[0].costPerResult).toBeCloseTo(2);
    expect(rows[0].rank).toBe(1);
  });

  it('sorts ads with no results yet below ads that have some', () => {
    const rows = rankAds([
      ad({ adId: 'noresults', results: 0, impressions: 5000 }),
      ad({ adId: 'hasresults', results: 1, spend: 50 }),
    ]);
    expect(rows.map((r) => r.adId)).toEqual(['hasresults', 'noresults']);
    expect(rows[1].costPerResult).toBeNull();
  });

  it('orders the resultless ads by how many people saw them', () => {
    const rows = rankAds([
      ad({ adId: 'small', results: 0, impressions: 100 }),
      ad({ adId: 'big', results: 0, impressions: 900 }),
    ]);
    expect(rows.map((r) => r.adId)).toEqual(['big', 'small']);
  });

  it('computes click rate out of impressions', () => {
    const [row] = rankAds([ad({ impressions: 1000, clicks: 25 })]);
    expect(row.clickRate).toBeCloseTo(0.025);
  });
});

describe('buildAdsVerdict', () => {
  it('returns null when no ad has delivered', () => {
    expect(buildAdsVerdict([])).toBeNull();
  });

  it('names the cheapest result when one exists', () => {
    const rows = rankAds([ad({ label: 'Summer promo', spend: 10, results: 5 })]);
    expect(buildAdsVerdict(rows)).toBe(
      'Your cheapest result so far is Summer promo at $2.00 per link click. Put more budget there.',
    );
  });

  it('says so plainly when ads are running but nothing has converted', () => {
    const rows = rankAds([ad({ results: 0, impressions: 4000 })]);
    expect(buildAdsVerdict(rows)).toBe(
      'Your ads have been seen 4,000 times but have produced no results yet.',
    );
  });

  it('contains no dashes', () => {
    const rows = rankAds([ad({ spend: 10, results: 5 })]);
    expect(buildAdsVerdict(rows)).not.toMatch(/[-—–]/);
  });
});
