import { describe, it, expect } from 'vitest';
import {
  tokenizeForScoring,
  tagTokens,
  scoreCandidate,
  isPureLandscape,
  rankCandidates,
} from '../image-scoring';

describe('tokenizeForScoring', () => {
  it('keeps tokens with 4+ chars and drops stopwords', () => {
    const tokens = tokenizeForScoring('study habits with your friends');
    expect(tokens.has('study')).toBe(true);
    expect(tokens.has('habits')).toBe(true);
    expect(tokens.has('friends')).toBe(true);
    expect(tokens.has('with')).toBe(false);
    expect(tokens.has('your')).toBe(false);
  });

  it('lowercases and strips punctuation', () => {
    const tokens = tokenizeForScoring('Running, fast! At-Dawn?');
    expect(tokens.has('running')).toBe(true);
    expect(tokens.has('fast')).toBe(true);
    expect(tokens.has('dawn')).toBe(true);
  });

  it('returns empty set for empty/whitespace input', () => {
    expect(tokenizeForScoring('').size).toBe(0);
    expect(tokenizeForScoring('   ').size).toBe(0);
  });
});

describe('tagTokens', () => {
  it('splits a comma-separated Pixabay tag string into individual word tokens', () => {
    const tokens = tagTokens('young woman, running, runner athlete');
    expect(tokens.has('young')).toBe(true);
    expect(tokens.has('woman')).toBe(true);
    expect(tokens.has('running')).toBe(true);
    expect(tokens.has('runner')).toBe(true);
    expect(tokens.has('athlete')).toBe(true);
  });

  it('handles undefined / null / empty', () => {
    expect(tagTokens(undefined).size).toBe(0);
    expect(tagTokens(null).size).toBe(0);
    expect(tagTokens('').size).toBe(0);
  });
});

describe('scoreCandidate', () => {
  it('returns count of overlapping tokens between tags and context', () => {
    const ctx = tokenizeForScoring('student studying at desk with laptop');
    const score = scoreCandidate(
      { url: 'http://x', tags: 'student, desk, laptop, library' },
      ctx,
    );
    // overlapping tokens: student, desk, laptop
    expect(score).toBe(3);
  });

  it('returns 0 for candidates with no overlap', () => {
    const ctx = tokenizeForScoring('running marathon training');
    const score = scoreCandidate(
      { url: 'http://x', tags: 'frost, twig, mountain' },
      ctx,
    );
    expect(score).toBe(0);
  });

  it('returns 0 for candidates with no tags', () => {
    const ctx = tokenizeForScoring('anything here');
    expect(scoreCandidate({ url: 'http://x' }, ctx)).toBe(0);
  });
});

describe('isPureLandscape', () => {
  it('returns true for candidates whose ALL tags are landscape-only', () => {
    expect(isPureLandscape('mountain, valley, sunset, sky')).toBe(true);
    expect(isPureLandscape('frost, twigs, leaves')).toBe(true);
  });

  it('returns false when at least one non-landscape tag is present', () => {
    expect(isPureLandscape('mountain, runner, sunset')).toBe(false);
    expect(isPureLandscape('student, desk')).toBe(false);
  });

  it('returns false for empty/missing tags', () => {
    expect(isPureLandscape(undefined)).toBe(false);
    expect(isPureLandscape('')).toBe(false);
  });
});

describe('rankCandidates', () => {
  it('sorts by score descending and demotes landscape candidates', () => {
    const candidates = [
      { url: 'low-score', tags: 'random unrelated' },
      { url: 'high-score', tags: 'student, desk, laptop' },
      { url: 'landscape', tags: 'mountain, sunset, sky' },
      { url: 'medium-score', tags: 'student, library' },
    ];
    const ranked = rankCandidates(candidates, 'student studying at desk with laptop');
    expect(ranked[0].candidate.url).toBe('high-score');
    expect(ranked[1].candidate.url).toBe('medium-score');
    // landscape should be LAST even if its score is non-zero
    expect(ranked[ranked.length - 1].candidate.url).toBe('landscape');
  });

  it('preserves order when all candidates have zero overlap and none are landscape', () => {
    const candidates = [
      { url: 'a', tags: 'apples' },
      { url: 'b', tags: 'oranges' },
    ];
    const ranked = rankCandidates(candidates, 'pizza pasta');
    expect(ranked.every((r) => r.score === 0)).toBe(true);
    expect(ranked.every((r) => !r.isLandscape)).toBe(true);
  });

  it('handles empty candidate list', () => {
    const ranked = rankCandidates([], 'student studying');
    expect(ranked).toEqual([]);
  });
});
