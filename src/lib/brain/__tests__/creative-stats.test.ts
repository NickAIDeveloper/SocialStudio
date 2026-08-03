import { describe, it, expect } from 'vitest';
import {
  classifyHookPattern,
  scoreOutcome,
  aggregateByDimension,
  rankDimension,
  summariseCreativeStats,
  MIN_CONFIDENT_SAMPLES,
} from '../creative-stats';

describe('classifyHookPattern', () => {
  it('recognises a question hook', () => {
    expect(classifyHookPattern('What if predictions lie?')).toBe('question');
  });

  it('recognises a number-led hook', () => {
    expect(classifyHookPattern('3 hidden tricks')).toBe('number');
    expect(classifyHookPattern('2 truths about predictions')).toBe('number');
  });

  it('recognises a contrarian hook', () => {
    expect(classifyHookPattern('Forecasts never tell the whole story')).toBe('contrarian');
    expect(classifyHookPattern('Stop chasing splits')).toBe('contrarian');
  });

  it('recognises a first-person hook', () => {
    expect(classifyHookPattern('I still guess my finish')).toBe('personal');
  });

  it('falls back to statement for anything unclassifiable', () => {
    expect(classifyHookPattern('Unfiltered truth about mile 18')).toBe('statement');
  });

  it('handles empty and null hooks without throwing', () => {
    expect(classifyHookPattern('')).toBe('unknown');
    expect(classifyHookPattern(null)).toBe('unknown');
  });

  it('classifies a question ahead of a number when both apply', () => {
    // "3 things?" is asked, and the question framing is the stronger signal.
    expect(classifyHookPattern('3 things you got wrong?')).toBe('question');
  });
});

describe('scoreOutcome', () => {
  it('weights saves far above raw reach', () => {
    // Same weighting as the existing angle loop (reach + 20*saves) so the two
    // learners agree rather than ranking creatives differently.
    expect(scoreOutcome({ reach: 100, saves: 0 })).toBe(100);
    expect(scoreOutcome({ reach: 100, saves: 5 })).toBe(200);
  });

  it('treats missing metrics as zero', () => {
    expect(scoreOutcome({ reach: null, saves: null })).toBe(0);
    expect(scoreOutcome({})).toBe(0);
  });
});

const ROWS = [
  { angle: 'question', hookPattern: 'question', reach: 100, saves: 1 },
  { angle: 'question', hookPattern: 'question', reach: 140, saves: 2 },
  { angle: 'question', hookPattern: 'question', reach: 120, saves: 0 },
  { angle: 'stat', hookPattern: 'number', reach: 40, saves: 0 },
  { angle: 'stat', hookPattern: 'number', reach: 60, saves: 0 },
  { angle: 'stat', hookPattern: 'number', reach: 50, saves: 0 },
];

describe('aggregateByDimension', () => {
  it('averages the outcome score per value and counts samples', () => {
    const out = aggregateByDimension(ROWS, 'angle');
    const question = out.find(r => r.value === 'question')!;
    expect(question.samples).toBe(3);
    // (120 + 180 + 120) / 3
    expect(question.meanScore).toBe(140);
  });

  it('sorts strongest first', () => {
    expect(aggregateByDimension(ROWS, 'angle').map(r => r.value)).toEqual(['question', 'stat']);
  });

  it('ignores rows whose dimension value is missing', () => {
    const out = aggregateByDimension(
      [...ROWS, { angle: null, hookPattern: null, reach: 9999, saves: 99 }],
      'angle',
    );
    expect(out.map(r => r.value)).toEqual(['question', 'stat']);
    expect(out.reduce((n, r) => n + r.samples, 0)).toBe(6);
  });

  it('marks thin samples as not confident', () => {
    // The whole point at our volume: two posts is not a finding. A caller must
    // be able to tell "question angle wins" from "question angle has n=2".
    const out = aggregateByDimension(
      [{ angle: 'question', hookPattern: 'question', reach: 500, saves: 9 }],
      'angle',
    );
    expect(out[0].samples).toBe(1);
    expect(out[0].confident).toBe(false);
  });

  it('marks a sufficient sample as confident', () => {
    const many = Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
      angle: 'question', hookPattern: 'question', reach: 100, saves: 0,
    }));
    expect(aggregateByDimension(many, 'angle')[0].confident).toBe(true);
  });

  it('returns nothing for an empty input', () => {
    expect(aggregateByDimension([], 'angle')).toEqual([]);
  });
});

describe('rankDimension', () => {
  it('declares a winner only when both leader and runner-up are well sampled', () => {
    const many = [
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'question', hookPattern: 'question', reach: 200, saves: 0,
      })),
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'stat', hookPattern: 'number', reach: 50, saves: 0,
      })),
    ];
    const result = rankDimension(many, 'angle');
    expect(result.verdict).toBe('winner');
    expect(result.leader?.value).toBe('question');
  });

  it('refuses to declare a winner on thin data', () => {
    // At ~2 posts/week this is the normal case, and reporting a winner here
    // would actively mislead the brief into chasing noise.
    const result = rankDimension(ROWS, 'angle');
    expect(result.verdict).toBe('insufficient_data');
    expect(result.leader).toBeNull();
  });

  it('reports no_difference when well-sampled values perform alike', () => {
    const many = [
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'question', hookPattern: 'question', reach: 100, saves: 0,
      })),
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'stat', hookPattern: 'number', reach: 104, saves: 0,
      })),
    ];
    const result = rankDimension(many, 'angle');
    expect(result.verdict).toBe('no_difference');
  });

  it('reports insufficient_data when there is only one value to compare', () => {
    const many = Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
      angle: 'question', hookPattern: 'question', reach: 100, saves: 0,
    }));
    expect(rankDimension(many, 'angle').verdict).toBe('insufficient_data');
  });
});

// ─── Regression tests: three bugs found via /ask on 2026-08-03 ───────────────
//
// The page answered "which hook shapes and angles perform best?" by ranking a
// single-post fluke (mean 21, n=1) above a value measured 30 times, counting
// unpublished posts as zero-scoring samples, and omitting angles entirely.

describe('aggregateByDimension — confidence outranks raw mean', () => {
  it('ranks a well-sampled value above a better-scoring fluke', () => {
    const rows = [
      { angle: 'fluke', reach: 21, saves: 0 },
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'proven', reach: 9, saves: 0,
      })),
    ];
    const stats = aggregateByDimension(rows, 'angle');
    // The fluke scores higher but is backed by one post; showing it first
    // invites acting on noise.
    expect(stats[0].value).toBe('proven');
    expect(stats[1].value).toBe('fluke');
  });

  it('still orders by mean score within the confident group', () => {
    const rows = [
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'weaker', reach: 10, saves: 0,
      })),
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'stronger', reach: 90, saves: 0,
      })),
    ];
    const stats = aggregateByDimension(rows, 'angle');
    expect(stats.map(s => s.value)).toEqual(['stronger', 'weaker']);
  });

  it('keeps a confident value visible when the list is truncated', () => {
    const flukes = Array.from({ length: 5 }, (_, i) => ({
      angle: `fluke_${i}`, reach: 500, saves: 0,
    }));
    const rows = [
      ...flukes,
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'proven', reach: 5, saves: 0,
      })),
    ];
    // Five high-scoring flukes would previously fill every top-5 slot.
    expect(aggregateByDimension(rows, 'angle').slice(0, 5)[0].value).toBe('proven');
  });
});

describe('aggregateByDimension — unmeasured posts are not observations', () => {
  it('excludes rows that have no analytics at all', () => {
    const rows = [
      { angle: 'question', reach: 100, saves: 1 },
      // Generated but never published, or analytics not yet synced. Counting
      // this as a zero deflates the mean AND inflates the sample count.
      { angle: 'question', reach: null, saves: null },
    ];
    const [stat] = aggregateByDimension(rows, 'angle');
    expect(stat.samples).toBe(1);
    expect(stat.meanScore).toBe(120);
  });

  it('excludes rows where the outcome fields are absent entirely', () => {
    const rows = [
      { angle: 'question', reach: 60, saves: 0 },
      { angle: 'question' },
    ];
    expect(aggregateByDimension(rows, 'angle')[0].samples).toBe(1);
  });

  it('counts a genuinely measured zero', () => {
    // A published post that truly reached nobody is real evidence and must
    // still count, unlike an unmeasured one.
    const rows = [
      { angle: 'question', reach: 100, saves: 0 },
      { angle: 'question', reach: 0, saves: 0 },
    ];
    const [stat] = aggregateByDimension(rows, 'angle');
    expect(stat.samples).toBe(2);
    expect(stat.meanScore).toBe(50);
  });

  it('omits a value whose every row is unmeasured', () => {
    const rows = [
      { angle: 'measured', reach: 10, saves: 0 },
      { angle: 'ghost', reach: null, saves: null },
    ];
    expect(aggregateByDimension(rows, 'angle').map(s => s.value)).toEqual(['measured']);
  });
});

describe('rankDimension — reachable verdict beneath a fluke', () => {
  it('names a winner when two confident values sit below an unsampled outlier', () => {
    const rows = [
      { angle: 'fluke', reach: 9999, saves: 0 },
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'question', reach: 200, saves: 0,
      })),
      ...Array.from({ length: MIN_CONFIDENT_SAMPLES }, () => ({
        angle: 'stat', reach: 50, saves: 0,
      })),
    ];
    // Previously the fluke occupied stats[0] and forced insufficient_data,
    // hiding a comparison that was perfectly well evidenced.
    const result = rankDimension(rows, 'angle');
    expect(result.verdict).toBe('winner');
    expect(result.leader?.value).toBe('question');
  });
});

describe('summariseCreativeStats', () => {
  const rows = [
    { angle: 'question', hookPattern: 'question', reach: 100, saves: 0 },
    { angle: 'stat', hookPattern: 'number', reach: 40, saves: 0 },
  ];

  it('returns angles as well as hook shapes', () => {
    // /ask asked for both and only ever returned hook shapes.
    const summary = summariseCreativeStats(rows, 5);
    expect(summary.byHookShape.map(s => s.value)).toEqual(['question', 'number']);
    expect(summary.byAngle.map(s => s.value)).toEqual(['question', 'stat']);
  });

  it('truncates each dimension to topN', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      angle: `a_${i}`, hookPattern: `h_${i}`, reach: i * 10, saves: 0,
    }));
    const summary = summariseCreativeStats(many, 5);
    expect(summary.byHookShape).toHaveLength(5);
    expect(summary.byAngle).toHaveLength(5);
  });

  it('reports empty dimensions rather than omitting them', () => {
    const summary = summariseCreativeStats([{ angle: 'solo', reach: 10, saves: 0 }], 5);
    expect(summary.byAngle).toHaveLength(1);
    expect(summary.byHookShape).toEqual([]);
  });
});
