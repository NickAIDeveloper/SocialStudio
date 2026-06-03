// src/lib/ads/signals.ts
// Deterministic "what's working / not" rule engine. Pure function over a single
// ad's insights + its Meta objective. Benchmarks are tunable constants. Priority:
// gathering < working/watch < not (a "not" reason always wins the verdict).
import type { AdInsight } from '@/lib/meta/ad-insights';

const IMPRESSION_FLOOR = 500;          // below this we're still learning
const CTR_BENCHMARK: Record<string, number> = {
  OUTCOME_TRAFFIC: 0.9, OUTCOME_ENGAGEMENT: 1.0, OUTCOME_LEADS: 0.8, OUTCOME_APP_PROMOTION: 0.7,
};
const CTR_JUDGE_MIN_IMPRESSIONS = 1000; // need enough data to judge CTR
const FREQUENCY_FATIGUE = 2.5;
const SPEND_NO_RESULT_FLOOR = 10;       // account currency

export type Verdict = 'gathering' | 'working' | 'watch' | 'not';

export interface SignalResult {
  verdict: Verdict;
  reasons: string[];
  tips: string[];
}

export function evaluateSignals(insight: AdInsight, metaObjective: string): SignalResult {
  const reasons: string[] = [];
  const tips: string[] = [];
  const benchmark = CTR_BENCHMARK[metaObjective] ?? 0.9;

  if (insight.impressions < IMPRESSION_FLOOR) {
    return { verdict: 'gathering', reasons: ['Still gathering data — too few impressions to judge yet.'], tips: [] };
  }

  let notWorking = false;

  if (insight.spend >= SPEND_NO_RESULT_FLOOR && insight.results === 0) {
    notWorking = true;
    reasons.push(`Spent ${insight.spend.toFixed(2)} with no results.`);
    tips.push('Consider pausing or reworking the offer — spend is not converting.');
  }

  if (insight.impressions >= CTR_JUDGE_MIN_IMPRESSIONS && insight.ctr < benchmark) {
    notWorking = true;
    reasons.push(`CTR ${insight.ctr.toFixed(2)}% is below the ${benchmark}% benchmark for this goal.`);
    tips.push('Refresh the creative or test a stronger hook — people are scrolling past.');
  }

  if (notWorking) return { verdict: 'not', reasons, tips };

  if (insight.frequency > FREQUENCY_FATIGUE) {
    reasons.push(`Frequency ${insight.frequency.toFixed(1)} — the same people are seeing this a lot.`);
    tips.push('Broaden the audience or add fresh creative to avoid fatigue.');
    return { verdict: 'watch', reasons, tips };
  }

  if (insight.ctr >= benchmark * 1.5) {
    reasons.push(`CTR ${insight.ctr.toFixed(2)}% is well above the ${benchmark}% benchmark.`);
    tips.push('This is a strong performer — consider raising budget or cloning it as a variant.');
    return { verdict: 'working', reasons, tips };
  }

  reasons.push('Performing within normal range for this goal.');
  return { verdict: 'watch', reasons, tips };
}
