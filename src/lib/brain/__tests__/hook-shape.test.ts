import { describe, it, expect } from 'vitest';
import {
  patternShare,
  pickUnderusedPattern,
  buildVarietyDirective,
  OVERUSE_THRESHOLD,
} from '../hook-shape';

describe('patternShare', () => {
  it('reports each pattern as a fraction of recent posts', () => {
    const share = patternShare(['statement', 'statement', 'question', 'number']);
    expect(share.statement).toBeCloseTo(0.5);
    expect(share.question).toBeCloseTo(0.25);
  });

  it('reproduces the real measured distribution', () => {
    // From the live M2 run: 15 statement of 23 pacebrain posts.
    const share = patternShare([
      ...Array(15).fill('statement'),
      ...Array(4).fill('number'),
      ...Array(3).fill('contrarian'),
      'personal',
    ]);
    expect(share.statement).toBeGreaterThan(OVERUSE_THRESHOLD);
  });

  it('returns an empty map for no history', () => {
    expect(patternShare([])).toEqual({});
  });
});

describe('pickUnderusedPattern', () => {
  it('picks a pattern never used before over one merely used less', () => {
    // Unused patterns are the actual range we are missing.
    const picked = pickUnderusedPattern(['statement', 'statement', 'number']);
    expect(['question', 'contrarian', 'personal']).toContain(picked);
  });

  // History is NEWEST FIRST throughout — element 0 is the hook just published.
  // These two cases previously placed the most-recent element last, which is
  // the ordering no caller actually uses.

  it('picks the least-used pattern once all have been tried', () => {
    // 'number' is rarest AND not the most recent, so nothing excludes it.
    const picked = pickUnderusedPattern([
      ...Array(10).fill('statement'),
      ...Array(5).fill('question'),
      ...Array(5).fill('contrarian'),
      ...Array(5).fill('personal'),
      'number',
    ]);
    expect(picked).toBe('number');
  });

  it('will not pick the most recent shape even when it is the rarest', () => {
    // The two rules can conflict: used-once but used LAST. Back-to-back
    // repetition is the more visible problem, so recency wins.
    const picked = pickUnderusedPattern([
      'number',
      ...Array(10).fill('statement'),
      ...Array(5).fill('question'),
      ...Array(5).fill('contrarian'),
      ...Array(5).fill('personal'),
    ]);
    expect(picked).not.toBe('number');
  });

  it('avoids repeating the most recent pattern even when it is rare', () => {
    // Back-to-back identical shapes read as repetition regardless of history.
    const picked = pickUnderusedPattern(['question']);
    expect(picked).not.toBe('question');
  });

  it('returns a valid pattern with no history at all', () => {
    const picked = pickUnderusedPattern([]);
    expect(typeof picked).toBe('string');
    expect(picked.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same history', () => {
    const history = ['statement', 'statement', 'number'];
    expect(pickUnderusedPattern(history)).toBe(pickUnderusedPattern(history));
  });
});

describe('buildVarietyDirective', () => {
  it('names the target shape and shows what it must not repeat', () => {
    const directive = buildVarietyDirective('question', ['statement', 'statement']);
    expect(directive).toMatch(/question/i);
    expect(directive).toMatch(/statement/i);
  });

  it('calls out an overused shape explicitly', () => {
    const directive = buildVarietyDirective('question', Array(20).fill('statement'));
    expect(directive).toMatch(/overused|too often|100%|dominat/i);
  });

  it('stays quiet about history when there is none', () => {
    const directive = buildVarietyDirective('question', []);
    expect(directive).toMatch(/question/i);
    expect(directive).not.toMatch(/overused/i);
  });
});

// ─── Ordering contract (bug found 2026-08-03) ───────────────────────────────
//
// Every caller builds its history with `.orderBy(desc(...))`, i.e. NEWEST
// FIRST: captions/route.ts, intel/creative/route.ts. The functions previously
// read the LAST element as the most recent, so the "do not repeat the shape you
// just used" guard was excluding the OLDEST hook's shape instead — the one
// protection specifically meant to stop back-to-back sameness.

describe('pickUnderusedPattern — newest-first ordering', () => {
  it('never returns the shape used most recently, even when it is the rarest', () => {
    // Newest first. 'personal' was just used AND is the least-used overall, so
    // a least-used-wins rule that misreads the ordering will pick it straight
    // back — producing exactly the back-to-back repeat the rule exists to stop.
    const newestFirst = [
      'personal',
      'statement', 'statement', 'statement',
      'question', 'question',
      'number', 'number',
      'contrarian', 'contrarian',
    ];
    expect(pickUnderusedPattern(newestFirst)).not.toBe('personal');
  });

  it('picks the least-used shape among those not just used', () => {
    const newestFirst = [
      'personal',
      'statement', 'statement', 'statement',
      'question', 'question',
      'number', 'number',
      'contrarian', 'contrarian',
    ];
    // personal excluded (just used); question/number/contrarian tie on 2 and
    // ties break by TARGETABLE_PATTERNS order.
    expect(pickUnderusedPattern(newestFirst)).toBe('question');
  });

  it('still prefers a never-used shape over a merely rare one', () => {
    const newestFirst = ['statement', 'statement', 'question'];
    // 'number', 'contrarian' and 'personal' are unused; order breaks the tie.
    expect(pickUnderusedPattern(newestFirst)).toBe('number');
  });
});

describe('buildVarietyDirective — newest-first ordering', () => {
  it('reports the three most recent shapes, not the three oldest', () => {
    const newestFirst = ['question', 'number', 'contrarian', 'personal', 'statement'];
    const directive = buildVarietyDirective('statement', newestFirst);
    expect(directive).toContain('question, number, contrarian');
    expect(directive).not.toContain('contrarian, personal, statement');
  });
});
