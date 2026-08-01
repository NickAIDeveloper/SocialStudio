import { describe, it, expect } from 'vitest';
import { auditAdCopy } from '../ad-copy-guard';

const CLEAN = {
  primaryText: 'What finish time awaits you?\n\nEnter your last race time and see what your body is ready for.\n\nStart your free trial and find out in seconds.',
  hook: 'What finish time awaits you?',
  headline: 'Predict your race time',
};

describe('auditAdCopy', () => {
  it('passes clean ad copy', () => {
    expect(auditAdCopy(CLEAN)).toEqual([]);
  });

  it('flags "link in bio" — the real failure from the first generated ad', () => {
    // A paid ad renders with a CTA button and destination URL. Telling the
    // reader to visit a bio sends them somewhere that does not exist and
    // wastes the click.
    const issues = auditAdCopy({
      ...CLEAN,
      primaryText: 'Great product.\n\nTap the link in bio to learn more and start your free trial today.',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('organic_navigation_phrase');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].detail).toMatch(/link in bio/i);
  });

  it.each([
    'link below',
    'swipe up',
    'DM us for details',
    'comment BELOW to get started',
    'check the link in our bio',
  ])('flags the organic phrasing %j', phrase => {
    const issues = auditAdCopy({ ...CLEAN, primaryText: `Body copy. ${phrase}.` });
    expect(issues.some(i => i.code === 'organic_navigation_phrase')).toBe(true);
  });

  it('flags a headline identical to the hook', () => {
    // Meta renders them in separate slots; duplicating wastes one.
    const issues = auditAdCopy({ ...CLEAN, headline: CLEAN.hook });
    expect(issues.some(i => i.code === 'headline_duplicates_hook')).toBe(true);
  });

  it('ignores case and trailing punctuation when comparing headline to hook', () => {
    const issues = auditAdCopy({ ...CLEAN, headline: '  what finish time awaits you!  ' });
    expect(issues.some(i => i.code === 'headline_duplicates_hook')).toBe(true);
  });

  it('flags a headline over the 40-character slot', () => {
    const issues = auditAdCopy({ ...CLEAN, headline: 'A'.repeat(41) });
    expect(issues.some(i => i.code === 'headline_too_long')).toBe(true);
  });

  it('does not flag legitimate uses of the word link', () => {
    // "the link between training and recovery" is prose, not an instruction.
    const issues = auditAdCopy({
      ...CLEAN,
      primaryText: 'Understand the link between your training load and recovery.',
    });
    expect(issues).toEqual([]);
  });

  it('reports every distinct problem at once rather than stopping at the first', () => {
    const issues = auditAdCopy({
      primaryText: 'Body. Tap the link in bio.',
      hook: 'Same words here',
      headline: 'Same words here',
    });
    expect(issues.map(i => i.code).sort()).toEqual(['headline_duplicates_hook', 'organic_navigation_phrase']);
  });

  it('tolerates missing fields without throwing', () => {
    expect(() => auditAdCopy({ primaryText: '', hook: '', headline: '' })).not.toThrow();
    expect(() => auditAdCopy({} as never)).not.toThrow();
  });
});
