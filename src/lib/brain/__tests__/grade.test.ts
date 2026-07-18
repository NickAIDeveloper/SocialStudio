import { describe, it, expect, vi } from 'vitest';
import { buildGradePrompt, parseGradeResponse, runGrade, shouldHoldForQuality, keepBetterDraft, shouldStopGenerating } from '../grade';
import type { GradeReport } from '../grade';
import type { BrainContext } from '../types';

const brain: BrainContext = {
  briefMd: '## Formula for the next 7 days\n- **Format:** REEL\n- **Best slot:** Tue, 19',
  formula: { format: 'REEL', bestSlot: { dow: 2, hour: 19 }, captionShape: { lines: 12, paragraphs: 4, emojiDensity: 'low' } },
  briefVersion: 3,
  generatedAt: '2026-05-09T01:00:00Z',
};

const draft = { caption: 'Hook line\n\nBody.', hookText: 'Stop doing this' };

describe('buildGradePrompt', () => {
  it('includes brain brief and draft fields', () => {
    const p = buildGradePrompt({ brain, draft });
    expect(p.system).toContain('0-10');
    expect(p.user).toContain('Brand Brain');
    expect(p.user).toContain('Stop doing this');
    expect(p.user).toContain('Hook line');
  });

  it('handles null brain', () => {
    const p = buildGradePrompt({ brain: null, draft });
    expect(p.user).toContain('No brain available');
  });
});

describe('parseGradeResponse', () => {
  it('parses a clean JSON response', () => {
    const r = parseGradeResponse('{"score":8,"strengths":["clear hook"],"weaknesses":["too long"],"suggestions":["trim caption"],"rationale":"solid"}');
    expect(r).not.toBeNull();
    expect(r!.score).toBe(8);
    expect(r!.strengths).toEqual(['clear hook']);
  });

  it('strips markdown fences', () => {
    const wrapped = '```json\n{"score":7.2,"strengths":[],"weaknesses":[],"suggestions":[]}\n```';
    expect(parseGradeResponse(wrapped)?.score).toBeCloseTo(7.2);
  });

  it('clamps score to 0-10', () => {
    expect(parseGradeResponse('{"score":15}')?.score).toBe(10);
    expect(parseGradeResponse('{"score":-5}')?.score).toBe(0);
  });

  it('returns null on malformed input', () => {
    expect(parseGradeResponse('garbage')).toBeNull();
    expect(parseGradeResponse('{"no score":true}')).toBeNull();
  });
});

describe('runGrade', () => {
  it('returns parsed report on first-attempt success', async () => {
    const llmCall = vi.fn(async () => '{"score":7,"strengths":["good"],"weaknesses":[],"suggestions":[]}');
    const r = await runGrade({ brain, draft }, { llmCall });
    expect(r.score).toBe(7);
    expect(llmCall).toHaveBeenCalledTimes(1);
  });

  it('retries once on parse failure then returns fallback', async () => {
    const llmCall = vi.fn(async () => 'garbage');
    const r = await runGrade({ brain, draft }, { llmCall });
    expect(r.score).toBe(0);
    expect(r.weaknesses).toContain('Could not generate grade');
    expect(llmCall).toHaveBeenCalledTimes(2);
  });

  it('survives an llm exception', async () => {
    const llmCall = vi.fn(async () => { throw new Error('boom'); });
    const r = await runGrade({ brain, draft }, { llmCall });
    expect(r.score).toBe(0);
  });
});

const rep = (score: number, graded = true): GradeReport => ({ score, graded, strengths: [], weaknesses: [], suggestions: [] });

describe('shouldHoldForQuality (autopilot gate)', () => {
  it('holds a real low-but-nonzero (scrap-band) score', () => {
    expect(shouldHoldForQuality(rep(3))).toBe(true);
    expect(shouldHoldForQuality(rep(4))).toBe(true);
  });

  it('holds a GENUINE 0/10 (worst slop) — no longer let through', () => {
    expect(shouldHoldForQuality(rep(0, true))).toBe(true);
  });

  it('does NOT hold a publishable score', () => {
    expect(shouldHoldForQuality(rep(5))).toBe(false);
    expect(shouldHoldForQuality(rep(7))).toBe(false);
  });

  it('FAILS OPEN only when the grader was UNAVAILABLE (graded:false)', () => {
    // A grader outage must never stop autopilot from posting — but only the
    // outage, not a real low score.
    expect(shouldHoldForQuality(rep(0, false))).toBe(false);
    expect(shouldHoldForQuality(rep(3, false))).toBe(false);
  });

  it('respects a custom bar', () => {
    expect(shouldHoldForQuality(rep(6), 7)).toBe(true);
    expect(shouldHoldForQuality(rep(7), 7)).toBe(false);
  });
});

describe('keepBetterDraft / shouldStopGenerating (best-of-N reducer)', () => {
  it('keeps the higher-scored draft regardless of order', () => {
    const a = { payload: 'a', grade: rep(3) };
    const b = { payload: 'b', grade: rep(7) };
    expect(keepBetterDraft(a, b).payload).toBe('b');
    expect(keepBetterDraft(b, a).payload).toBe('b');
  });

  it('treats an ungraded (null) candidate as worst, but keeps it when nothing better exists', () => {
    const ungraded = { payload: 'x', grade: null };
    expect(keepBetterDraft(null, ungraded).payload).toBe('x');
    expect(keepBetterDraft({ payload: 'good', grade: rep(6) }, ungraded).payload).toBe('good');
  });

  it('stops on a good score, regenerates on a real low score', () => {
    expect(shouldStopGenerating(rep(7))).toBe(true);
    expect(shouldStopGenerating(rep(3))).toBe(false);
  });

  it('stops (fails open) when the grader is unavailable', () => {
    expect(shouldStopGenerating(null)).toBe(true);
    expect(shouldStopGenerating(rep(2, false))).toBe(true);
  });
});
