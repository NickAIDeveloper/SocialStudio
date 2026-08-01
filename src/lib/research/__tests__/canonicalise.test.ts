import { describe, it, expect, vi } from 'vitest';
import { canonicaliseThemes } from '../canonicalise';
import type { PainMention } from '../pain-points';

const m = (theme: string): PainMention => ({ theme, quote: `q:${theme}`, source: 's', upvotes: 1 });
const complete = (reply: string) => vi.fn().mockResolvedValue(reply);

describe('canonicaliseThemes', () => {
  it('merges synonymous labels onto one canonical name', () => {
    // The real failure: 9 pains all at n=1 because every label was unique.
    const mentions = [m('Plateaued load'), m('Plateaued progress'), m('No improvement for months')];
    return canonicaliseThemes(mentions, {
      complete: complete(JSON.stringify({
        'Plateaued load': 'Plateaued progress',
        'Plateaued progress': 'Plateaued progress',
        'No improvement for months': 'Plateaued progress',
      })) as never,
    }).then(out => {
      expect(out.map(x => x.theme)).toEqual(['Plateaued progress', 'Plateaued progress', 'Plateaued progress']);
    });
  });

  it('preserves every mention — grouping must never lose data', async () => {
    const mentions = [m('A'), m('B'), m('C')];
    const out = await canonicaliseThemes(mentions, {
      complete: complete(JSON.stringify({ A: 'A', B: 'A', C: 'C' })) as never,
    });
    expect(out).toHaveLength(3);
    expect(out.map(x => x.quote)).toEqual(['q:A', 'q:B', 'q:C']);
  });

  it('rejects a canonical label that was not in the input', async () => {
    // Otherwise the model could rename a pain into something nobody actually said.
    const out = await canonicaliseThemes([m('Knee pain'), m('Shin splints')], {
      complete: complete(JSON.stringify({ 'Knee pain': 'Lower body discomfort', 'Shin splints': 'Lower body discomfort' })) as never,
    });
    expect(out.map(x => x.theme)).toEqual(['Knee pain', 'Shin splints']);
  });

  it('leaves unmapped labels untouched', async () => {
    const out = await canonicaliseThemes([m('A'), m('B')], {
      complete: complete(JSON.stringify({ A: 'A' })) as never,
    });
    expect(out.map(x => x.theme)).toEqual(['A', 'B']);
  });

  it('returns input unchanged when the model fails', async () => {
    const out = await canonicaliseThemes([m('A'), m('B')], {
      complete: vi.fn().mockRejectedValue(new Error('502')) as never,
    });
    expect(out.map(x => x.theme)).toEqual(['A', 'B']);
  });

  it('returns input unchanged on unparseable output', async () => {
    const out = await canonicaliseThemes([m('A'), m('B')], { complete: complete('no json here') as never });
    expect(out.map(x => x.theme)).toEqual(['A', 'B']);
  });

  it('skips the model entirely when there is nothing to merge', async () => {
    const fn = complete('{}');
    await canonicaliseThemes([m('Only one')], { complete: fn as never });
    expect(fn).not.toHaveBeenCalled();
  });
});
