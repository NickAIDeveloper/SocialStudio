import { describe, it, expect } from 'vitest';
import { QUESTIONS, matchQuestion, listQuestions } from '../questions';

describe('QUESTIONS registry', () => {
  it('every question has an id, a plain-English label and keywords', () => {
    for (const q of QUESTIONS) {
      expect(q.id).toMatch(/^[a-z0-9_]+$/);
      expect(q.label.length).toBeGreaterThan(10);
      expect(q.keywords.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = QUESTIONS.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('matchQuestion', () => {
  it('matches a plainly-worded question about reach', () => {
    expect(matchQuestion('why did pacebrain reach drop last week')?.id).toBe('reach_trend');
  });

  it('matches a question about which creative works', () => {
    expect(matchQuestion('what hook style is working best?')?.id).toBe('top_hook_patterns');
  });

  it('matches a question about ad spend', () => {
    expect(matchQuestion('how much have we spent on ads')?.id).toBe('ad_spend');
  });

  it('matches a question about audience pain points', () => {
    expect(matchQuestion('what do our customers complain about')?.id).toBe('pain_points');
  });

  it('is case and punctuation insensitive', () => {
    expect(matchQuestion('WHAT HOOK STYLE IS WORKING BEST!!!')?.id).toBe('top_hook_patterns');
  });

  it('returns null for something it cannot answer', () => {
    // Better to admit it than to answer a different question convincingly.
    expect(matchQuestion('what is the weather in melbourne')).toBeNull();
  });

  it('returns null for an empty query', () => {
    expect(matchQuestion('')).toBeNull();
    expect(matchQuestion('   ')).toBeNull();
  });

  it('prefers the question matching more keywords', () => {
    // "posts failed" hits both post-status and failure wording; the more
    // specific match should win.
    const match = matchQuestion('which posts failed to publish and why');
    expect(match?.id).toBe('failed_posts');
  });
});

describe('listQuestions', () => {
  it('returns every question in a form suitable for showing the user', () => {
    const listed = listQuestions();
    expect(listed).toHaveLength(QUESTIONS.length);
    expect(listed[0]).toHaveProperty('id');
    expect(listed[0]).toHaveProperty('label');
    // Never leak the SQL to the client.
    expect(listed[0]).not.toHaveProperty('run');
  });
});
