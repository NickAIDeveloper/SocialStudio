import { describe, it, expect, vi, afterEach } from 'vitest';
import { resultTypeForObjective, extractResult, getAdInsights } from '../ad-insights';

afterEach(() => vi.restoreAllMocks());

describe('resultTypeForObjective', () => {
  it('maps each Meta objective to a result action_type', () => {
    expect(resultTypeForObjective('OUTCOME_TRAFFIC')).toBe('link_click');
    expect(resultTypeForObjective('OUTCOME_ENGAGEMENT')).toBe('post_engagement');
    expect(resultTypeForObjective('OUTCOME_LEADS')).toBe('link_click');
    expect(resultTypeForObjective('OUTCOME_APP_PROMOTION')).toBe('mobile_app_install');
  });
  it('falls back to link_click for unknown objectives', () => {
    expect(resultTypeForObjective('OUTCOME_WHATEVER')).toBe('link_click');
  });
});

describe('extractResult', () => {
  const actions = [
    { action_type: 'link_click', value: '42' },
    { action_type: 'post_engagement', value: '99' },
  ];
  it('returns the matching action value as a number', () => {
    expect(extractResult(actions, 'link_click')).toBe(42);
  });
  it('falls back to landing_page_view when primary type absent', () => {
    expect(extractResult([{ action_type: 'landing_page_view', value: '7' }], 'link_click')).toBe(7);
  });
  it('returns 0 when nothing matches', () => {
    expect(extractResult([], 'mobile_app_install')).toBe(0);
  });
});

describe('getAdInsights', () => {
  it('parses one ad row into a normalized shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{
        spend: '42.10', impressions: '18430', reach: '11200', clicks: '312',
        inline_link_clicks: '268', ctr: '1.69', cpc: '0.13', frequency: '1.64',
        actions: [{ action_type: 'link_click', value: '268' }],
        account_currency: 'GBP',
      }] }),
    }));
    const out = await getAdInsights('tok', ['ad1'], 'OUTCOME_TRAFFIC', 'last_7d');
    expect(out.ad1).toMatchObject({
      spend: 42.1, impressions: 18430, clicks: 312, ctr: 1.69, cpc: 0.13,
      frequency: 1.64, results: 268, resultType: 'link_click', currency: 'GBP',
    });
  });
  it('returns null for an ad whose insights call fails (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'boom' }));
    const out = await getAdInsights('tok', ['ad1'], 'OUTCOME_TRAFFIC', 'last_7d');
    expect(out.ad1).toBeNull();
  });
});
