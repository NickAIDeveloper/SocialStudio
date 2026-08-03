import { describe, it, expect } from 'vitest';
import {
  normalisePainKey,
  rankPainPoints,
  isPainResearchStale,
  MIN_MENTIONS_TO_TRUST,
  type PainMention,
} from '../pain-points';

const m = (theme: string, quote: string, over: Partial<PainMention> = {}): PainMention => ({
  theme,
  quote,
  source: 'reddit',
  permalink: 'https://reddit.com/r/running/x',
  upvotes: 1,
  ...over,
});

describe('normalisePainKey', () => {
  it('collapses casing, punctuation and spacing', () => {
    expect(normalisePainKey('  Race-day Anxiety! ')).toBe('race day anxiety');
  });

  it('treats singular and plural as the same pain', () => {
    // "training plan" and "training plans" are one complaint, not two.
    expect(normalisePainKey('training plans')).toBe(normalisePainKey('training plan'));
  });

  it('ignores leading filler so themes group properly', () => {
    expect(normalisePainKey('the injury risk')).toBe(normalisePainKey('injury risk'));
  });
});

describe('rankPainPoints', () => {
  it('ranks by how often a pain is mentioned, not by upvotes', () => {
    // Cody's "rank stack by most referenced": recurrence across many people is
    // the signal, not one popular post. A single 5000-upvote rant is one person.
    const ranked = rankPainPoints([
      m('Injury risk', 'I keep getting hurt', { upvotes: 5000 }),
      m('Plateau', 'stuck at the same pace'),
      m('Plateau', 'no improvement for months'),
      m('Plateau', 'my times have not moved'),
    ]);
    expect(ranked[0].theme).toBe('Plateau');
    expect(ranked[0].mentions).toBe(3);
  });

  it('groups mentions that differ only in wording', () => {
    const ranked = rankPainPoints([
      m('Training plans', 'plans are too rigid'),
      m('training plan', 'the plan never adapts'),
      m('  Training Plans! ', 'plans ignore how I feel'),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].mentions).toBe(3);
  });

  it('keeps the most upvoted quote as the evidence for a theme', () => {
    // The quote is what seeds creative, so it should be the most resonant
    // phrasing of the pain, even though ranking ignores upvotes.
    const ranked = rankPainPoints([
      m('Plateau', 'meh wording', { upvotes: 2 }),
      m('Plateau', 'I have run the same 10K time for two years', { upvotes: 400 }),
    ]);
    expect(ranked[0].topQuote).toBe('I have run the same 10K time for two years');
  });

  it('caps evidence quotes so the brief stays readable', () => {
    const ranked = rankPainPoints(
      Array.from({ length: 20 }, (_, i) => m('Plateau', `quote ${i}`, { upvotes: i })),
    );
    expect(ranked[0].mentions).toBe(20);
    expect(ranked[0].quotes.length).toBeLessThanOrEqual(3);
  });

  it('marks thinly-referenced pains as untrusted', () => {
    // Same discipline as the creative loop: one person complaining is an
    // anecdote, and feeding it to generation as a "finding" chases noise.
    const ranked = rankPainPoints([m('Odd niche gripe', 'only I care about this')]);
    expect(ranked[0].mentions).toBe(1);
    expect(ranked[0].trusted).toBe(false);
  });

  it('marks a well-referenced pain as trusted', () => {
    const ranked = rankPainPoints(
      Array.from({ length: MIN_MENTIONS_TO_TRUST }, (_, i) => m('Plateau', `q${i}`)),
    );
    expect(ranked[0].trusted).toBe(true);
  });

  it('breaks ties deterministically by total upvotes', () => {
    const ranked = rankPainPoints([
      m('Alpha', 'a', { upvotes: 10 }),
      m('Alpha', 'a2', { upvotes: 10 }),
      m('Beta', 'b', { upvotes: 500 }),
      m('Beta', 'b2', { upvotes: 500 }),
    ]);
    expect(ranked.map(r => r.theme)).toEqual(['Beta', 'Alpha']);
  });

  it('drops empty or whitespace-only themes rather than creating a blank bucket', () => {
    const ranked = rankPainPoints([m('', 'x'), m('   ', 'y'), m('Plateau', 'z')]);
    expect(ranked.map(r => r.theme)).toEqual(['Plateau']);
  });

  it('returns nothing for no input', () => {
    expect(rankPainPoints([])).toEqual([]);
  });
});

// ─── Staleness gate (added 2026-08-03) ──────────────────────────────────────
//
// The refresh route is HMAC-gated for cron use but was never called by one, so
// research only ever ran when a human clicked. Adding it to the daily cron
// naively would re-scrape and run two LLM passes per brand per day for data
// that shifts monthly. The cron stays dumb and calls daily; this decides
// whether that call should do any work.

describe('isPainResearchStale', () => {
  const now = new Date('2026-08-03T12:00:00Z');

  it('treats never-researched as stale', () => {
    expect(isPainResearchStale(null, now)).toBe(true);
    expect(isPainResearchStale(undefined, now)).toBe(true);
  });

  it('leaves fresh research alone', () => {
    expect(isPainResearchStale(new Date('2026-08-02T12:00:00Z'), now)).toBe(false);
  });

  it('refreshes research older than the window', () => {
    expect(isPainResearchStale(new Date('2026-07-25T12:00:00Z'), now)).toBe(true);
  });

  it('treats exactly the window boundary as stale', () => {
    expect(isPainResearchStale(new Date('2026-07-27T12:00:00Z'), now)).toBe(true);
  });

  it('does not re-scrape on a future timestamp', () => {
    // Clock skew between the app and the DB must not trigger an expensive
    // rescrape on every run.
    expect(isPainResearchStale(new Date('2026-08-04T12:00:00Z'), now)).toBe(false);
  });

  it('honours a custom window', () => {
    const twoDaysAgo = new Date('2026-08-01T12:00:00Z');
    expect(isPainResearchStale(twoDaysAgo, now, 1)).toBe(true);
    expect(isPainResearchStale(twoDaysAgo, now, 30)).toBe(false);
  });
});
