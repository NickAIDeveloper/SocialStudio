import { describe, it, expect } from 'vitest';
import { sanitizeCaption, sanitizeHook, reconcileCountClaim } from '../caption-engine';

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

describe('sanitizeCaption — leading meta-commentary', () => {
  it('strips "Sure! Here\'s the caption:" opener', () => {
    const input = "Sure! Here's the caption: Train smarter today.";
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('strips "Here is the post:" opener', () => {
    const input = 'Here is the post: Train smarter today.';
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('strips "Final caption:" label', () => {
    const input = 'Final caption: Train smarter today.';
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('strips "Option 1:" prefix', () => {
    const input = 'Option 1: Train smarter today.';
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('strips "I have crafted a caption for you:" opener', () => {
    const input = "I've crafted a caption for you: Train smarter today.";
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('strips wrapping quotes hidden behind leading meta', () => {
    const input = 'Here is the caption: "Train smarter today."';
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('does NOT strip body text mentioning "here"', () => {
    const input = 'Here we go again. Another long run done.';
    expect(sanitizeCaption(input)).toBe('Here we go again. Another long run done.');
  });
});

describe('sanitizeCaption — JSON array remnants', () => {
  it('strips bare hashtag-array remnant', () => {
    const input = 'Train smarter today. ["#run", "#pace"]';
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('strips quoted-string array remnant', () => {
    const input = 'Train smarter today. ["pace", "stride"]';
    expect(sanitizeCaption(input)).toBe('Train smarter today.');
  });

  it('does NOT strip legitimate bracketed text', () => {
    const input = 'New PR [unofficial] today.';
    expect(sanitizeCaption(input)).toBe('New PR [unofficial] today.');
  });
});

describe('sanitizeHook — hardening', () => {
  it('strips "Here is the hook:" leading meta', () => {
    expect(sanitizeHook('Here is the hook: Save this for later')).toBe('Save this for later');
  });

  it('strips "Sure! Here\'s a hook:" opener', () => {
    expect(sanitizeHook("Sure! Here's a hook: Save this")).toBe('Save this');
  });

  it('strips smart quotes wrapping hook', () => {
    expect(sanitizeHook('\u201CSave this for later\u201D')).toBe('Save this for later');
  });

  it('caps at 60 chars', () => {
    const long = 'x'.repeat(80);
    expect(sanitizeHook(long).length).toBe(60);
  });
});

describe('reconcileCountClaim — hook number vs list count mismatch', () => {
  it('coerces hook "5 science hacks" to "3 science hacks" when caption lists 3', () => {
    const hookText = '5 science hacks for runners';
    const caption =
      'Try these 5 ways to make your runs more scientific:\n1. Track pace zones.\n2. Optimize training.\n3. Find your signature.';
    const out = reconcileCountClaim(hookText, caption);
    expect(out.hookText).toBe('3 science hacks for runners');
    expect(out.caption).toContain('Try these 3 ways');
    expect(out.caption).toContain('1. Track pace zones.');
    expect(out.caption).toContain('3. Find your signature.');
  });

  it('leaves hook unchanged when promised count already matches list count', () => {
    const hookText = '3 ways to train smarter';
    const caption = 'Body line.\n1. First.\n2. Second.\n3. Third.';
    const out = reconcileCountClaim(hookText, caption);
    expect(out.hookText).toBe('3 ways to train smarter');
    expect(out.caption).toBe(caption);
  });

  it('leaves hook unchanged when caption has no numbered list', () => {
    const hookText = '5 ways to train smarter';
    const caption = 'Just a body with no list at all. Sentences only.';
    const out = reconcileCountClaim(hookText, caption);
    expect(out.hookText).toBe('5 ways to train smarter');
    expect(out.caption).toBe(caption);
  });

  it('leaves hook unchanged when hook has no number promise', () => {
    const hookText = 'Save this for later';
    const caption = 'Body.\n1. First.\n2. Second.';
    const out = reconcileCountClaim(hookText, caption);
    expect(out.hookText).toBe('Save this for later');
    expect(out.caption).toBe(caption);
  });

  it('handles adjective between number and noun ("5 brutal mistakes")', () => {
    const hookText = '5 brutal mistakes runners make';
    const caption = 'Body.\n1. One.\n2. Two.';
    const out = reconcileCountClaim(hookText, caption);
    expect(out.hookText).toBe('2 brutal mistakes runners make');
  });

  it('bumps hook number UP when caption has more items than promised', () => {
    const hookText = '3 ways to recover faster';
    const caption = 'Body.\n1. One.\n2. Two.\n3. Three.\n4. Four.\n5. Five.';
    const out = reconcileCountClaim(hookText, caption);
    expect(out.hookText).toBe('5 ways to recover faster');
  });

  it('only patches the first count-promise occurrence in the caption', () => {
    const hookText = '5 tips for runners';
    const caption =
      'Try these 5 tips today.\n1. One.\n2. Two.\n3. Three.\nSee 5 tips daily.';
    const out = reconcileCountClaim(hookText, caption);
    expect(out.caption).toContain('Try these 3 tips today');
    expect(out.caption).toContain('See 5 tips daily');
  });
});
