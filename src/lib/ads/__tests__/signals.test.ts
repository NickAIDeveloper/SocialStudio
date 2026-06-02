import { describe, it, expect } from 'vitest';
import { evaluateSignals } from '../signals';
import type { AdInsight } from '@/lib/meta/ad-insights';

const base: AdInsight = {
  spend: 0, impressions: 0, reach: 0, clicks: 0, inlineLinkClicks: 0,
  ctr: 0, cpc: 0, frequency: 0, results: 0, resultType: 'link_click', currency: 'GBP',
};

describe('evaluateSignals', () => {
  it('flags "gathering" under the impressions floor', () => {
    const s = evaluateSignals({ ...base, impressions: 200 }, 'OUTCOME_TRAFFIC');
    expect(s.verdict).toBe('gathering');
  });
  it('flags "working" for strong CTR', () => {
    const s = evaluateSignals({ ...base, impressions: 18000, clicks: 300, ctr: 1.69, results: 268 }, 'OUTCOME_TRAFFIC');
    expect(s.verdict).toBe('working');
    expect(s.reasons.join(' ')).toMatch(/CTR/i);
  });
  it('flags "not" for low CTR after enough impressions', () => {
    const s = evaluateSignals({ ...base, impressions: 21000, clicks: 74, ctr: 0.35 }, 'OUTCOME_LEADS');
    expect(s.verdict).toBe('not');
    expect(s.tips.length).toBeGreaterThan(0);
  });
  it('flags "not" when spending with zero results', () => {
    const s = evaluateSignals({ ...base, impressions: 5000, spend: 38.9, ctr: 1.2, results: 0 }, 'OUTCOME_LEADS');
    expect(s.verdict).toBe('not');
    expect(s.reasons.join(' ')).toMatch(/no results|0 results|without results/i);
  });
  it('flags "watch" for high frequency', () => {
    const s = evaluateSignals({ ...base, impressions: 9000, ctr: 1.1, frequency: 2.8, results: 40 }, 'OUTCOME_TRAFFIC');
    expect(s.verdict).toBe('watch');
    expect(s.reasons.join(' ')).toMatch(/frequency/i);
  });
});
