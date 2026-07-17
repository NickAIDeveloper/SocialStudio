import { describe, it, expect, vi } from 'vitest';
import { buildGradePrompt, parseGradeResponse, runGrade, shouldHoldForQuality } from '../grade';
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

describe('shouldHoldForQuality (autopilot gate)', () => {
  const report = (score: number): GradeReport => ({ score, strengths: [], weaknesses: [], suggestions: [] });

  it('holds a real low-but-nonzero (scrap-band) score', () => {
    expect(shouldHoldForQuality(report(3))).toBe(true);
    expect(shouldHoldForQuality(report(4))).toBe(true);
  });

  it('does NOT hold a publishable score', () => {
    expect(shouldHoldForQuality(report(5))).toBe(false);
    expect(shouldHoldForQuality(report(7))).toBe(false);
  });

  it('FAILS OPEN on an inconclusive/grader-unavailable score of 0', () => {
    // runGrade returns score 0 when the grader LLM itself failed — a grader
    // outage must never stop autopilot from posting.
    expect(shouldHoldForQuality(report(0))).toBe(false);
    expect(shouldHoldForQuality(report(-1))).toBe(false);
  });

  it('respects a custom bar', () => {
    expect(shouldHoldForQuality(report(6), 7)).toBe(true);
    expect(shouldHoldForQuality(report(7), 7)).toBe(false);
  });
});
