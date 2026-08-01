import { describe, it, expect, vi } from 'vitest';
import { fetchStackExchangeDiscussions, stripHtml, SOURCE_SITES } from '../sources';

function fakeFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  } as Response);
}

const ITEMS = {
  items: [
    { title: 'Why do my knees hurt after long runs?', body: '<p>Every time I go over 10k my knees <b>ache</b>.</p>', score: 42, link: 'https://fitness.stackexchange.com/q/1', question_id: 1 },
    { title: 'How do I stop plateauing?', body: '<p>Same 10k time for two years.</p>', score: 17, link: 'https://fitness.stackexchange.com/q/2', question_id: 2 },
  ],
  quota_remaining: 291,
};

describe('stripHtml', () => {
  it('removes tags but keeps the words', () => {
    expect(stripHtml('<p>Every time I go over 10k my knees <b>ache</b>.</p>'))
      .toBe('Every time I go over 10k my knees ache.');
  });

  it('decodes the entities the API actually returns', () => {
    expect(stripHtml('I&#39;m stuck &amp; frustrated &lt;here&gt;')).toBe("I'm stuck & frustrated <here>");
  });

  it('collapses whitespace left behind by block tags', () => {
    expect(stripHtml('<p>one</p>\n\n<p>two</p>')).toBe('one two');
  });

  it('handles empty and null input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});

describe('fetchStackExchangeDiscussions', () => {
  it('returns discussions with the HTML stripped out', async () => {
    const fetcher = fakeFetch(ITEMS);
    const out = await fetchStackExchangeDiscussions('running', 'fitness', { fetcher });

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      title: 'Why do my knees hurt after long runs?',
      score: 42,
      permalink: 'https://fitness.stackexchange.com/q/1',
      source: 'stackexchange:fitness',
    });
    expect(out[0].body).toBe('Every time I go over 10k my knees ache.');
  });

  it('requests the site and query it was given', async () => {
    const fetcher = fakeFetch(ITEMS);
    await fetchStackExchangeDiscussions('knee pain', 'fitness', { fetcher });

    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain('site=fitness');
    expect(url).toContain(encodeURIComponent('knee pain'));
    // withbody: the question text is where the pain is actually described.
    expect(url).toContain('filter=withbody');
  });

  it('returns nothing rather than throwing when the API errors', async () => {
    // Research is an enhancement. A dead third-party API must never be able to
    // break generation for a brand.
    const out = await fetchStackExchangeDiscussions('running', 'fitness', {
      fetcher: fakeFetch({}, false, 503),
    });
    expect(out).toEqual([]);
  });

  it('returns nothing rather than throwing when the network fails', async () => {
    const out = await fetchStackExchangeDiscussions('running', 'fitness', {
      fetcher: vi.fn().mockRejectedValue(new Error('ENOTFOUND')),
    });
    expect(out).toEqual([]);
  });

  it('tolerates a malformed payload', async () => {
    expect(await fetchStackExchangeDiscussions('x', 'fitness', { fetcher: fakeFetch({ items: null }) })).toEqual([]);
    expect(await fetchStackExchangeDiscussions('x', 'fitness', { fetcher: fakeFetch(null) })).toEqual([]);
  });

  it('skips items with no usable text', async () => {
    const out = await fetchStackExchangeDiscussions('x', 'fitness', {
      fetcher: fakeFetch({ items: [{ title: '', body: '', score: 3, link: 'l' }] }),
    });
    expect(out).toEqual([]);
  });

  it('exposes a site mapping so brands can be pointed at a relevant community', () => {
    expect(Object.keys(SOURCE_SITES).length).toBeGreaterThan(0);
    expect(SOURCE_SITES.fitness).toBeDefined();
  });
});
