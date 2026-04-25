// src/lib/analyze/run-analysis.ts
import type {
  AnalysisDeps,
  AnalysisOpts,
  AnalysisResult,
  AnalysisStep,
  AnalysisStepId,
} from './types';

const STEP_LABELS: Record<AnalysisStepId, string> = {
  analytics: 'Analyzing your posts',
  competitors: 'Comparing to competitors',
  'deep-profile': 'Building deep profile',
  'health-delta': 'Computing weekly delta',
};

async function runStep<T>(
  id: AnalysisStepId,
  fn: () => Promise<T>,
): Promise<{ step: AnalysisStep; value: T | null }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return {
      step: { id, label: STEP_LABELS[id], status: 'success', durationMs: Date.now() - t0 },
      value,
    };
  } catch (err) {
    return {
      step: {
        id,
        label: STEP_LABELS[id],
        status: 'error',
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      },
      value: null,
    };
  }
}

export async function runAnalysis(
  opts: AnalysisOpts,
  deps: AnalysisDeps,
): Promise<AnalysisResult> {
  const { brandId, igUserId } = opts;

  const analyticsP = runStep('analytics', () => deps.fetchAnalyticsInsights(brandId));
  const competitorsP = runStep('competitors', () => deps.fetchCompetitorInsights());
  const healthDeltaP = runStep('health-delta', () => deps.fetchHealthDelta(brandId));
  const deepProfileP = igUserId
    ? runStep('deep-profile', () => deps.fetchDeepProfile(igUserId))
    : Promise.resolve({
        step: {
          id: 'deep-profile' as const,
          label: STEP_LABELS['deep-profile'],
          status: 'skipped' as const,
        },
        value: null,
      });

  const [analytics, competitors, healthDelta, deepProfile] = await Promise.all([
    analyticsP,
    competitorsP,
    healthDeltaP,
    deepProfileP,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    brandId,
    igUserId,
    steps: [analytics.step, competitors.step, deepProfile.step, healthDelta.step],
    healthScore: analytics.value?.healthScore ?? null,
    healthDelta: healthDelta.value?.delta ?? null,
    summary: analytics.value?.summary ?? null,
    analyticsInsights: analytics.value?.insights ?? [],
    competitorInsights: competitors.value?.insights ?? [],
    deepProfile: deepProfile.value,
  };
}
