import { describe, it, expect } from 'vitest';
import {
  tokenizeForScoring,
  tagTokens,
  scoreCandidate,
  isPureLandscape,
  rankCandidates,
  hasBrandDomainMatch,
  hasBrandDomainConfig,
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

describe('hasBrandDomainMatch', () => {
  it('returns true when no brandSlug is passed (domain filtering opt-in)', () => {
    expect(hasBrandDomainMatch('mountain sunset')).toBe(true);
    expect(hasBrandDomainMatch('')).toBe(true);
    expect(hasBrandDomainMatch(undefined)).toBe(true);
  });

  it('returns true when brand has no domain config', () => {
    expect(hasBrandDomainMatch('mountain sunset', 'unknown-brand')).toBe(true);
  });

  it('matches pacebrain photos with running tokens', () => {
    expect(hasBrandDomainMatch('runner, training, marathon', 'pacebrain')).toBe(true);
    expect(hasBrandDomainMatch('young woman jogging in park', 'pacebrain')).toBe(true);
  });

  it('rejects pacebrain photos without running tokens', () => {
    expect(hasBrandDomainMatch('child, phone, indoor', 'pacebrain')).toBe(false);
    expect(hasBrandDomainMatch('food, kitchen, recipe', 'pacebrain')).toBe(false);
  });

  it('matches affectly photos with study tokens', () => {
    expect(hasBrandDomainMatch('student, desk, laptop', 'affectly')).toBe(true);
    expect(hasBrandDomainMatch('book, reading, library', 'affectly')).toBe(true);
  });

  it('rejects affectly photos without study tokens', () => {
    expect(hasBrandDomainMatch('runner, marathon, athlete', 'affectly')).toBe(false);
  });
});

describe('hasBrandDomainConfig', () => {
  it('returns true for configured brands', () => {
    expect(hasBrandDomainConfig('pacebrain')).toBe(true);
    expect(hasBrandDomainConfig('affectly')).toBe(true);
  });
  it('returns false for unconfigured brands or missing slug', () => {
    expect(hasBrandDomainConfig('newbrand')).toBe(false);
    expect(hasBrandDomainConfig(undefined)).toBe(false);
    expect(hasBrandDomainConfig('')).toBe(false);
  });
});

describe('rankCandidates — brand-domain priority', () => {
  it('puts a domain-matching candidate ahead of a higher-scoring non-match', () => {
    const candidates = [
      // High caption overlap but NOT running-related (e.g. metaphorical
      // "wall" caption matched the literal wall photo)
      { url: 'wall-photo', tags: 'wall, brick, urban, graffiti' },
      // No caption overlap but IS running-related — should win
      { url: 'runner-photo', tags: 'runner, marathon, athlete' },
    ];
    const ranked = rankCandidates(
      candidates,
      'most runners hit a wall before they quit',
      'pacebrain',
    );
    expect(ranked[0].candidate.url).toBe('runner-photo');
    expect(ranked[0].brandDomainMatch).toBe(true);
    expect(ranked[1].brandDomainMatch).toBe(false);
  });

  it('still uses score to break ties when both candidates match domain', () => {
    const candidates = [
      { url: 'low', tags: 'runner, gym' },
      { url: 'high', tags: 'runner, training, marathon' },
    ];
    const ranked = rankCandidates(
      candidates,
      'runner training marathon',
      'pacebrain',
    );
    expect(ranked[0].candidate.url).toBe('high');
  });

  it('falls back to score-only ranking when brand has no domain config', () => {
    const candidates = [
      { url: 'a', tags: 'wall, brick' },
      { url: 'b', tags: 'runner, athlete' },
    ];
    const ranked = rankCandidates(candidates, 'wall brick', 'unknown-brand');
    expect(ranked[0].candidate.url).toBe('a');
  });
});
