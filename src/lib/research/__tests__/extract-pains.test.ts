import { describe, it, expect, vi } from 'vitest';
import { extractPainMentions } from '../extract-pains';
import type { Discussion } from '../sources';

const DISCUSSIONS: Discussion[] = [
  { title: 'Why do I keep plateauing?', body: 'Same 10k time for two years now.', score: 42, permalink: 'https://x/1', source: 'stackexchange:fitness' },
  { title: 'Knee pain on long runs', body: 'Anything over 10k and my knees ache.', score: 17, permalink: 'https://x/2', source: 'stackexchange:fitness' },
];

const complete = (reply: string) => vi.fn().mockResolvedValue(reply);

describe('extractPainMentions', () => {
  it('maps labels back to their source discussion', async () => {
    const out = await extractPainMentions(DISCUSSIONS, {
      complete: complete(JSON.stringify([
        { index: 0, theme: 'Plateaued progress', quote: 'Same 10k time for two years' },
        { index: 1, theme: 'Injury risk', quote: 'my knees ache' },
      ])) as never,
    });

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      theme: 'Plateaued progress',
      quote: 'Same 10k time for two years',
      permalink: 'https://x/1',
      // Community votes carry through as the "how many share this" signal.
      upvotes: 42,
    });
  });

  it('tolerates a model that wraps JSON in prose or a code fence', async () => {
    const out = await extractPainMentions(DISCUSSIONS, {
      complete: complete('Sure! Here you go:\n```json\n[{"index":0,"theme":"Plateau","quote":"Same 10k time"}]\n```') as never,
    });
    expect(out).toHaveLength(1);
    expect(out[0].theme).toBe('Plateau');
  });

  it('drops entries pointing at a discussion that does not exist', async () => {
    // A hallucinated index would otherwise attach a real-looking pain to no
    // evidence at all.
    const out = await extractPainMentions(DISCUSSIONS, {
      complete: complete(JSON.stringify([{ index: 99, theme: 'Made up', quote: 'nope' }])) as never,
    });
    expect(out).toEqual([]);
  });

  it('drops entries missing a theme or quote', async () => {
    const out = await extractPainMentions(DISCUSSIONS, {
      complete: complete(JSON.stringify([
        { index: 0, theme: '', quote: 'x' },
        { index: 1, theme: 'Injury risk', quote: '   ' },
      ])) as never,
    });
    expect(out).toEqual([]);
  });

  it('returns nothing when the model returns unparseable output', async () => {
    const out = await extractPainMentions(DISCUSSIONS, { complete: complete('I could not do that') as never });
    expect(out).toEqual([]);
  });

  it('returns nothing rather than throwing when the model call fails', async () => {
    const out = await extractPainMentions(DISCUSSIONS, {
      complete: vi.fn().mockRejectedValue(new Error('502 upstream')) as never,
    });
    expect(out).toEqual([]);
  });

  it('does not call the model at all for an empty input', async () => {
    const fn = complete('[]');
    expect(await extractPainMentions([], { complete: fn as never })).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});
