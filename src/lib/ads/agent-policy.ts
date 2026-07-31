// src/lib/ads/agent-policy.ts
//
// The decision layer for agentic ads (M4): given how a cohort of ads is
// performing, decide which to pause, which to promote, and — most often — which
// to leave alone.
//
// INFRASTRUCTURE ONLY. Nothing here calls Meta. It is pure, so the rules can be
// tested exhaustively before a single dollar moves, and the caller decides
// whether to act on the plan at all (gated by ADS_AGENT_ENABLED, off by
// default).
//
// Two safety properties matter more than the optimisation:
//
//   1. THE AGENT MAY ONLY TOUCH ITS OWN ADS. Anything not explicitly tagged
//      createdBy='agent' is skipped — including legacy rows with unknown
//      provenance. An ad built by hand in /ads must be untouchable no matter
//      how badly it performs.
//
//   2. IT NEVER JUDGES INSIDE THE SIGNAL WINDOW. Meta's delivery is noisy for
//      the first couple of days, so an ad killed at six hours is killed on
//      randomness — and destroys the data needed to judge it. Every uncertain
//      case resolves to 'wait', never to 'pause'.
//
// The objective here is DISTRIBUTION, not revenue. "results" is whatever the
// campaign objective counts (link clicks, reach, profile visits) — deliberately
// not purchases, because at current volume there aren't enough conversions to
// optimise against. See docs/marketing-agent-roadmap.md.

export interface AgentConfig {
  // Leave an ad alone until it has had time to exit Meta's learning noise.
  minHoursBeforeJudging: number;
  // …and until it has actually been delivered enough to mean anything.
  minImpressions: number;
  // Total agent spend allowed per day, in minor units. Breaching it halts the
  // agent entirely rather than merely blocking new spend.
  dailySpendCapMinor: number;
  // Pause an ad whose cost per result exceeds this multiple of the cohort median.
  pauseCostMultiple: number;
  // Promote an ad whose cost per result is at most this fraction of the median.
  promoteCostFraction: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  minHoursBeforeJudging: 48,
  minImpressions: 500,
  dailySpendCapMinor: 5000,
  // 3× the median before pruning: tight enough to kill genuine losers, loose
  // enough to leave the variance the learning loop needs.
  pauseCostMultiple: 3,
  promoteCostFraction: 0.5,
};

export interface AdPerformance {
  adId: string;
  // Null = unknown provenance (predates tagging) and must be treated as human.
  createdBy: 'human' | 'agent' | null;
  status: string;
  ageHours: number;
  impressions: number;
  spendMinor: number;
  // Whatever the objective counts — link clicks, reach, profile visits.
  results: number;
}

export type AgentAction = 'pause' | 'promote' | 'keep' | 'wait' | 'skip';

export interface AdDecision {
  adId: string;
  action: AgentAction;
  reason: string;
}

// Cost per result in minor units, or null when it cannot be computed.
export function costPerResult(ad: AdPerformance): number | null {
  if (ad.results <= 0) return null;
  return ad.spendMinor / ad.results;
}

export function medianCostPerResult(ads: readonly AdPerformance[]): number | null {
  const values = ads.map(costPerResult).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

// Decide a single ad against the cohort median. `medianCost` may be null when
// no ad in the cohort has produced a result yet.
export function decideForAd(
  ad: AdPerformance,
  medianCost: number | null,
  config: AgentConfig,
): AdDecision {
  const d = (action: AgentAction, reason: string): AdDecision => ({ adId: ad.adId, action, reason });

  // ── Safety first ─────────────────────────────────────────────────────────
  if (ad.createdBy !== 'agent') return d('skip', 'not_agent_created');
  if (ad.status !== 'ACTIVE') return d('skip', 'not_active');

  // ── Signal window ────────────────────────────────────────────────────────
  if (ad.ageHours < config.minHoursBeforeJudging) return d('wait', 'inside_signal_window');
  if (ad.impressions < config.minImpressions) return d('wait', 'insufficient_delivery');

  // ── Judgement ────────────────────────────────────────────────────────────
  const cost = costPerResult(ad);
  if (cost == null) {
    // No results. Only damning if money was actually spent trying — zero spend
    // means it never delivered, which is a delivery problem, not a bad ad.
    return ad.spendMinor > 0 ? d('pause', 'no_results') : d('wait', 'no_spend_yet');
  }

  if (medianCost == null || medianCost <= 0) return d('keep', 'no_cohort_baseline');

  if (cost > medianCost * config.pauseCostMultiple) return d('pause', 'cost_per_result_outlier');
  if (cost <= medianCost * config.promoteCostFraction) return d('promote', 'cost_per_result_leader');
  return d('keep', 'within_cohort_range');
}

export interface AgentPlan {
  // True when the agent must not act at all this cycle.
  halted: boolean;
  haltReason: string | null;
  pause: AdDecision[];
  promote: AdDecision[];
  // Everything else, for reporting — the plan should be legible even when it
  // proposes doing nothing, which is the common case.
  other: AdDecision[];
}

// Builds the full plan for a cohort. Nothing is executed here.
export function planAgentActions(ads: readonly AdPerformance[], config: AgentConfig): AgentPlan {
  const empty: AgentPlan = { halted: false, haltReason: null, pause: [], promote: [], other: [] };
  if (ads.length === 0) return empty;

  // Spend cap is evaluated across AGENT ads only — the agent is not accountable
  // for, and must not be throttled by, spend a human chose to make.
  const agentAds = ads.filter(a => a.createdBy === 'agent');
  const agentSpend = agentAds.reduce((sum, a) => sum + a.spendMinor, 0);
  if (agentSpend > config.dailySpendCapMinor) {
    return { ...empty, halted: true, haltReason: 'daily_spend_cap_exceeded' };
  }

  // Median over agent ads only: a single unusually cheap human ad would
  // otherwise drag the baseline down and make the agent prune its own
  // perfectly reasonable ads.
  const median = medianCostPerResult(agentAds);

  const decisions = ads.map(a => decideForAd(a, median, config));

  // "Best of one" is not evidence — require a cohort before promoting anything.
  const canPromote = agentAds.length >= 2;

  return {
    halted: false,
    haltReason: null,
    pause: decisions.filter(x => x.action === 'pause'),
    promote: canPromote ? decisions.filter(x => x.action === 'promote') : [],
    other: decisions.filter(
      x => x.action !== 'pause' && !(canPromote && x.action === 'promote'),
    ),
  };
}
