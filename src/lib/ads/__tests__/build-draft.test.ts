import { describe, it, expect } from 'vitest';
import { buildAdDraft } from '../build-draft';

const captionResult = {
  caption: 'Your routine is holding you back. Here is the fix.',
  hashtags: '#fitness\n#coaching\n#habits',
  hookText: 'Your routine is broken',
};

describe('buildAdDraft', () => {
  it('maps caption fields onto the draft and applies the objective CTA', () => {
    const draft = buildAdDraft({
      objective: 'TRAFFIC',
      destinationUrl: 'https://example.com',
      caption: captionResult,
      imageUrl: 'https://img/x.jpg',
      interestSuggestions: ['fitness'],
    });
    expect(draft.primaryText).toBe(captionResult.caption);
    expect(draft.hook).toBe('Your routine is broken');
    expect(draft.cta).toBe('LEARN_MORE');
    expect(draft.hashtags).toEqual(['#fitness', '#coaching', '#habits']);
  });

  it('caps the headline at HEADLINE_MAX characters on a word boundary', () => {
    const draft = buildAdDraft({
      objective: 'LEADS',
      destinationUrl: 'https://example.com',
      caption: { ...captionResult, hookText: 'This is a very long hook that clearly exceeds the forty character cap easily' },
      imageUrl: 'https://img/x.jpg',
      interestSuggestions: [],
    });
    expect(draft.headline.length).toBeLessThanOrEqual(40);
    expect(draft.headline.endsWith(' ')).toBe(false);
    expect(draft.cta).toBe('SIGN_UP');
  });

  it('caps hashtags at MAX_HASHTAGS and dedupes', () => {
    const draft = buildAdDraft({
      objective: 'ENGAGEMENT',
      destinationUrl: 'https://example.com',
      caption: { ...captionResult, hashtags: '#a #a #b #c #d #e #f' },
      imageUrl: 'https://img/x.jpg',
      interestSuggestions: [],
    });
    expect(draft.hashtags.length).toBeLessThanOrEqual(5);
    expect(new Set(draft.hashtags).size).toBe(draft.hashtags.length);
  });
});
