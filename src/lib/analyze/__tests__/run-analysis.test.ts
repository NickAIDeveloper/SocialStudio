// src/lib/analyze/__tests__/run-analysis.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runAnalysis } from '../run-analysis';
import type { AnalysisDeps } from '../types';
import type { InsightCard } from '@/lib/health-score';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

const baseInsight: InsightCard = {
  id: 'i1',
  priority: 1,
  type: 'best-content-type',
  icon: '⚡',
  title: 'Reels win',
  verdict: 'positive',
  summary: 'Reels get 2.3x more reach',
  action: 'Make more reels',
  data: {},
};

const stubDeps = (overrides: Partial<AnalysisDeps> = {}): AnalysisDeps => ({
  fetchAnalyticsInsights: vi.fn().mockResolvedValue({
    insights: [baseInsight],
    healthScore: 60,
    summary: 'Decent',
  }),
  fetchCompetitorInsights: vi.fn().mockResolvedValue({ insights: [] }),
  fetchDeepProfile: vi.fn().mockResolvedValue({
    handle: 'me',
    sampleSize: 12,
  } as unknown as DeepProfile),
  fetchHealthDelta: vi.fn().mockResolvedValue({ current: 60, previous: 80, delta: -20 }),
  ...overrides,
});

const baseOpts = {
  userId: 'u1',
  brandId: 'b1',
  igUserId: 'ig1',
  origin: 'http://localhost:3000',
  cookie: 'session=x',
};

describe('runAnalysis', () => {
  it('returns combined result with all steps marked success when all deps resolve', async () => {
    const result = await runAnalysis(baseOpts, stubDeps());
    expect(result.healthScore).toBe(60);
    expect(result.healthDelta).toBe(-20);
    expect(result.summary).toBe('Decent');
    expect(result.analyticsInsights).toHaveLength(1);
    expect(result.deepProfile).not.toBeNull();
    expect(result.steps.every((s) => s.status === 'success')).toBe(true);
    expect(result.steps.map((s) => s.id).sort()).toEqual(
      ['analytics', 'competitors', 'deep-profile', 'health-delta'].sort(),
    );
  });

  it('marks deep-profile step as skipped when igUserId is null', async () => {
    const deps = stubDeps();
    const result = await runAnalysis({ ...baseOpts, igUserId: null }, deps);
    expect(result.deepProfile).toBeNull();
    const step = result.steps.find((s) => s.id === 'deep-profile');
    expect(step?.status).toBe('skipped');
    expect(deps.fetchDeepProfile).not.toHaveBeenCalled();
  });

  it('continues on error: one step failure does not break the whole run', async () => {
    const deps = stubDeps({
      fetchCompetitorInsights: vi
        .fn()
        .mockRejectedValue(new Error('competitor service down')),
    });
    const result = await runAnalysis(baseOpts, deps);
    expect(result.healthScore).toBe(60);
    const compStep = result.steps.find((s) => s.id === 'competitors');
    expect(compStep?.status).toBe('error');
    expect(compStep?.error).toContain('competitor service down');
    expect(result.competitorInsights).toEqual([]);
  });

  it('runs the four steps in parallel (combined wall time within one delay, not four)', async () => {
    const DELAY_MS = 50;
    const sleep = <T>(value: T): (() => Promise<T>) =>
      () => new Promise<T>((r) => setTimeout(() => r(value), DELAY_MS));

    const deps: AnalysisDeps = {
      fetchAnalyticsInsights: vi
        .fn()
        .mockImplementation(sleep({ insights: [], healthScore: 0, summary: '' })),
      fetchCompetitorInsights: vi.fn().mockImplementation(sleep({ insights: [] })),
      fetchDeepProfile: vi.fn().mockImplementation(sleep({} as DeepProfile)),
      fetchHealthDelta: vi
        .fn()
        .mockImplementation(sleep({ current: 0, previous: 0, delta: 0 })),
    };
    const t0 = Date.now();
    await runAnalysis(baseOpts, deps);
    const wall = Date.now() - t0;
    // Lower bound: at least one delay actually elapsed (proves the stub really waits).
    expect(wall).toBeGreaterThanOrEqual(DELAY_MS - 10);
    // Upper bound: not anywhere near 4× serial (proves we ran in parallel).
    // Serial would be ~200ms; allow generous CI headroom but still well under that.
    expect(wall).toBeLessThan(DELAY_MS * 3);
  });
});
