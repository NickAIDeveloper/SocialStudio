import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AGENT_CONFIG,
  decideForAd,
  planAgentActions,
  type AdPerformance,
} from '../agent-policy';

// A well-delivered agent ad, past the signal window, performing mid-pack.
function ad(over: Partial<AdPerformance> = {}): AdPerformance {
  return {
    adId: 'a1',
    createdBy: 'agent',
    status: 'ACTIVE',
    ageHours: 72,
    impressions: 2000,
    spendMinor: 1000,
    results: 10,
    ...over,
  };
}

describe('decideForAd — safety', () => {
  it('refuses to touch an ad the agent did not create', () => {
    // The hard requirement: an ad built by hand in /ads must be untouchable,
    // no matter how badly it performs.
    const decision = decideForAd(ad({ createdBy: 'human', results: 0, spendMinor: 999999 }), 100, DEFAULT_AGENT_CONFIG);
    expect(decision.action).toBe('skip');
    expect(decision.reason).toBe('not_agent_created');
  });

  it('refuses to touch an ad with unknown provenance', () => {
    // Legacy rows predate tagging. Unknown must mean hands-off, not "probably fine".
    expect(decideForAd(ad({ createdBy: null }), 100, DEFAULT_AGENT_CONFIG).action).toBe('skip');
  });

  it('leaves ads alone that are not currently active', () => {
    expect(decideForAd(ad({ status: 'PAUSED' }), 100, DEFAULT_AGENT_CONFIG).action).toBe('skip');
  });
});

describe('decideForAd — signal window', () => {
  it('waits before judging a young ad, however bad it looks', () => {
    // Meta's own learning phase means early numbers are meaningless. Killing an
    // ad at 6 hours destroys the very data needed to judge it.
    const decision = decideForAd(ad({ ageHours: 6, results: 0, spendMinor: 5000 }), 100, DEFAULT_AGENT_CONFIG);
    expect(decision.action).toBe('wait');
    expect(decision.reason).toBe('inside_signal_window');
  });

  it('waits when delivery is too thin to judge, even if old enough', () => {
    const decision = decideForAd(ad({ impressions: 50, results: 0 }), 100, DEFAULT_AGENT_CONFIG);
    expect(decision.action).toBe('wait');
    expect(decision.reason).toBe('insufficient_delivery');
  });
});

describe('decideForAd — pausing', () => {
  it('pauses an ad that has spent past the window with zero results', () => {
    const decision = decideForAd(ad({ results: 0, spendMinor: 3000 }), 100, DEFAULT_AGENT_CONFIG);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toBe('no_results');
  });

  it('pauses an ad far more expensive per result than its cohort', () => {
    // cohort median cost/result = 100; this ad is 500 -> 5x, past the 3x bar.
    const decision = decideForAd(ad({ spendMinor: 5000, results: 10 }), 100, DEFAULT_AGENT_CONFIG);
    expect(decision.action).toBe('pause');
    expect(decision.reason).toBe('cost_per_result_outlier');
  });

  it('keeps an ad that is only moderately worse than the cohort', () => {
    // 150 vs median 100 = 1.5x, inside the bar. Pruning this would leave no
    // variance to learn from.
    expect(decideForAd(ad({ spendMinor: 1500, results: 10 }), 100, DEFAULT_AGENT_CONFIG).action).toBe('keep');
  });

  it('never pauses on zero results if nothing has been spent', () => {
    // No spend means no delivery, which is a delivery problem, not a bad ad.
    const decision = decideForAd(ad({ results: 0, spendMinor: 0 }), 100, DEFAULT_AGENT_CONFIG);
    expect(decision.action).toBe('wait');
  });
});

describe('planAgentActions — guardrails', () => {
  it('only ever returns actions for agent-created, active ads', () => {
    const plan = planAgentActions(
      [
        ad({ adId: 'agent-bad', results: 0, spendMinor: 3000 }),
        ad({ adId: 'human-bad', createdBy: 'human', results: 0, spendMinor: 3000 }),
      ],
      DEFAULT_AGENT_CONFIG,
    );
    expect(plan.pause.map(p => p.adId)).toEqual(['agent-bad']);
    expect(plan.pause.map(p => p.adId)).not.toContain('human-bad');
  });

  it('computes the cohort median from agent ads only', () => {
    // A single wildly cheap human ad must not drag the median down and cause
    // the agent to pause its own reasonable ads.
    const plan = planAgentActions(
      [
        ad({ adId: 'h', createdBy: 'human', spendMinor: 10, results: 100 }),
        ad({ adId: 'a1', spendMinor: 1000, results: 10 }),
        ad({ adId: 'a2', spendMinor: 1100, results: 10 }),
        ad({ adId: 'a3', spendMinor: 900, results: 10 }),
      ],
      DEFAULT_AGENT_CONFIG,
    );
    expect(plan.pause).toEqual([]);
  });

  it('halts everything when the spend cap is breached', () => {
    // A runaway spend must stop the agent acting at all, including promoting.
    const plan = planAgentActions([ad({ spendMinor: 999999 })], {
      ...DEFAULT_AGENT_CONFIG,
      dailySpendCapMinor: 5000,
    });
    expect(plan.halted).toBe(true);
    expect(plan.haltReason).toBe('daily_spend_cap_exceeded');
    expect(plan.pause).toEqual([]);
    expect(plan.promote).toEqual([]);
  });

  it('is a no-op on an empty account rather than erroring', () => {
    const plan = planAgentActions([], DEFAULT_AGENT_CONFIG);
    expect(plan).toMatchObject({ halted: false, pause: [], promote: [] });
  });

  it('promotes the clear best performer once the cohort is judgeable', () => {
    const plan = planAgentActions(
      [
        ad({ adId: 'star', spendMinor: 200, results: 20 }),
        ad({ adId: 'mid1', spendMinor: 1000, results: 10 }),
        ad({ adId: 'mid2', spendMinor: 1100, results: 10 }),
      ],
      DEFAULT_AGENT_CONFIG,
    );
    expect(plan.promote.map(p => p.adId)).toEqual(['star']);
  });

  it('promotes nothing when there is only one ad to compare', () => {
    // "Best of one" is not evidence.
    expect(planAgentActions([ad()], DEFAULT_AGENT_CONFIG).promote).toEqual([]);
  });
});
