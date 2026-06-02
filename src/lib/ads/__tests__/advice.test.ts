import { describe, it, expect } from 'vitest';
import { buildAdvicePrompt } from '../advice';
import type { AdInsight } from '@/lib/meta/ad-insights';

const insight: AdInsight = {
  spend: 38.9, impressions: 21050, reach: 9800, clicks: 74, inlineLinkClicks: 70,
  ctr: 0.35, cpc: 0.53, frequency: 2.1, results: 3, resultType: 'link_click', currency: 'GBP',
};

describe('buildAdvicePrompt', () => {
  it('includes the metrics, objective and the rule reasons', () => {
    const p = buildAdvicePrompt({
      brandName: 'PaceBrain', objective: 'OUTCOME_LEADS', insight,
      reasons: ['CTR 0.35% is below the 0.8% benchmark for this goal.'],
      headline: 'Unlock your endurance profile', briefMd: null, competitorContext: null,
    });
    expect(p).toMatch(/PaceBrain/);
    expect(p).toMatch(/0\.35/);
    expect(p).toMatch(/benchmark/i);
  });
});
