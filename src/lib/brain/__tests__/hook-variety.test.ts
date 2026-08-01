import { describe, it, expect } from 'vitest';
import {
  patternShare,
  pickUnderusedPattern,
  buildVarietyDirective,
  OVERUSE_THRESHOLD,
} from '../hook-variety';

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

  it('picks the least-used pattern once all have been tried', () => {
    // 'number' is rarest AND not the most recent, so nothing excludes it.
    const picked = pickUnderusedPattern([
      'number',
      ...Array(5).fill('question'),
      ...Array(5).fill('contrarian'),
      ...Array(5).fill('personal'),
      ...Array(10).fill('statement'),
    ]);
    expect(picked).toBe('number');
  });

  it('will not pick the most recent shape even when it is the rarest', () => {
    // The two rules can conflict: used-once but used LAST. Back-to-back
    // repetition is the more visible problem, so recency wins.
    const picked = pickUnderusedPattern([
      ...Array(10).fill('statement'),
      ...Array(5).fill('question'),
      ...Array(5).fill('contrarian'),
      ...Array(5).fill('personal'),
      'number',
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
