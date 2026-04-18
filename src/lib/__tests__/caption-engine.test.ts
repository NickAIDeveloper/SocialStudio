import { describe, it, expect } from 'vitest';
import { sanitizeCaption } from '../caption-engine';

describe('sanitizeCaption — LLM trailing commentary', () => {
  it('strips ": I removed the hashtag as per your instructions" tail', () => {
    const input =
      'Train smarter with Affectly. Link in bio. : I removed the hashtag as per your instructions. However, if you want to keep it, I can add it back in.';
    expect(sanitizeCaption(input)).toBe('Train smarter with Affectly. Link in bio.');
  });

  it('strips "Note:" trailing block', () => {
    const input = 'Body of caption here. Note: this is meta commentary for the user.';
    expect(sanitizeCaption(input)).toBe('Body of caption here.');
  });

  it('strips "Let me know if..." offer', () => {
    const input = 'Caption body. Let me know if you would like a different tone.';
    expect(sanitizeCaption(input)).toBe('Caption body.');
  });

  it('strips "Feel free to..." offer', () => {
    const input = 'Caption body. Feel free to swap the hashtag.';
    expect(sanitizeCaption(input)).toBe('Caption body.');
  });

  it('strips "However, if you want..." continuation', () => {
    const input = 'Final line. However, if you want a longer version I can extend it.';
    expect(sanitizeCaption(input)).toBe('Final line.');
  });

  it('strips "I have crafted/written/chosen..." self-reference', () => {
    const input = 'Caption body. I have crafted this to fit Instagram.';
    expect(sanitizeCaption(input)).toBe('Caption body.');
  });

  it('does NOT strip legitimate "I made it" inside body', () => {
    const input = 'I made it to the finish line today. New PB!';
    expect(sanitizeCaption(input)).toBe('I made it to the finish line today. New PB!');
  });

  it('does NOT strip legitimate caption mentioning "note"', () => {
    const input = 'Quick note for runners: hydrate before long runs.';
    expect(sanitizeCaption(input)).toBe('Quick note for runners: hydrate before long runs.');
  });

  it('handles clean caption unchanged', () => {
    const input = 'Train smarter with Affectly. Link in bio.';
    expect(sanitizeCaption(input)).toBe('Train smarter with Affectly. Link in bio.');
  });
});
