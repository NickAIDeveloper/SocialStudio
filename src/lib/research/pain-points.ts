// src/lib/research/pain-points.ts
//
// Ranks what real people actually complain about, so creative is written from
// the audience's words rather than from our description of the product.
//
// This is step one of the marketing-agent method: scrape a place where people
// complain honestly (Reddit), extract the pains, then "rank stack by most
// referenced" and let the top few seed everything downstream. Our generator
// currently writes from brand description and competitor data — i.e. entirely
// from our own view of the product — which is a plausible reason posts reach
// 3-15 people: they may simply not be about anything anyone urgently cares
// about.
//
// The ranking rule that matters: RECURRENCE, not popularity. A single
// 5000-upvote rant is one person having a bad week; the same complaint phrased
// forty different ways by forty people is a market. Upvotes are used only to
// pick which phrasing to quote, never to decide what ranks.
//
// Same honesty discipline as the creative loop: a pain mentioned once is an
// anecdote, and feeding it to generation as a finding would make the system
// chase noise confidently. Everything carries its mention count and a `trusted`
// flag.

// Below this many independent mentions, a pain is reported but not trusted.
export const MIN_MENTIONS_TO_TRUST = 3;

// Keep the brief readable — three pieces of evidence is plenty to write from.
const MAX_QUOTES = 3;

export interface PainMention {
  // Short label for the pain, assigned by the extraction step.
  theme: string;
  // The person's own words. This is what seeds creative.
  quote: string;
  source: string;
  permalink?: string | null;
  upvotes?: number | null;
}

export interface RankedPain {
  theme: string;
  mentions: number;
  trusted: boolean;
  // Best-phrased evidence, most upvoted first.
  topQuote: string;
  quotes: string[];
  totalUpvotes: number;
}

// Words that carry no meaning at the start of a theme and would otherwise split
// one pain into two buckets.
const LEADING_FILLER = /^(the|a|an|my|our|their)\s+/;

// Group themes that are the same complaint in different clothes: casing,
// punctuation, spacing, and simple plurals.
export function normalisePainKey(theme: string): string {
  return theme
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_FILLER, '')
    .split(' ')
    // Crude singularisation is deliberate: "training plans" and "training plan"
    // must land in one bucket, and a stemmer would be overkill for short labels.
    .map(word => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
}

export function rankPainPoints(mentions: readonly PainMention[]): RankedPain[] {
  const groups = new Map<string, { label: string; items: PainMention[] }>();

  for (const mention of mentions) {
    const key = normalisePainKey(mention.theme ?? '');
    if (!key) continue; // never create a blank bucket
    const group = groups.get(key) ?? { label: mention.theme.trim(), items: [] };
    group.items.push(mention);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ label, items }) => {
      const byUpvotes = [...items].sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0));
      const totalUpvotes = items.reduce((sum, i) => sum + (i.upvotes ?? 0), 0);
      return {
        theme: label,
        mentions: items.length,
        trusted: items.length >= MIN_MENTIONS_TO_TRUST,
        topQuote: byUpvotes[0]?.quote ?? '',
        quotes: byUpvotes.slice(0, MAX_QUOTES).map(i => i.quote),
        totalUpvotes,
      };
    })
    // Recurrence first; upvotes only break ties, so ordering is deterministic.
    .sort((a, b) => b.mentions - a.mentions || b.totalUpvotes - a.totalUpvotes);
}

// Renders the top pains for injection into the caption/ad brief. Only trusted
// pains are included — an untrusted one would read to the model as established
// fact and there is no way for it to know otherwise.
// How long researched pain points stay usable before a refresh is worth its
// cost. What an audience complains about shifts over weeks, not hours, while a
// refresh costs a full scrape plus two LLM passes per brand — so a daily cron
// asking "is this stale?" is far cheaper than a daily cron that re-researches.
export const PAIN_RESEARCH_MAX_AGE_DAYS = 7;

const DAY_MS = 86_400_000;

// Should the refresh actually do work? Lets the cron stay dumb (call daily) and
// keeps the decision here, where it is testable without a network or a model.
export function isPainResearchStale(
  fetchedAt: Date | null | undefined,
  now: Date,
  maxAgeDays: number = PAIN_RESEARCH_MAX_AGE_DAYS,
): boolean {
  if (!fetchedAt) return true;
  const ageMs = now.getTime() - fetchedAt.getTime();
  // A negative age means the stored timestamp is ahead of us — clock skew
  // between app and database, not stale data. Re-scraping on skew would mean
  // paying for a full refresh on every single run.
  if (ageMs < 0) return false;
  return ageMs >= maxAgeDays * DAY_MS;
}

export function buildPainBrief(ranked: readonly RankedPain[], limit = 3): string {
  const usable = ranked.filter(p => p.trusted).slice(0, limit);
  if (usable.length === 0) return '';

  const lines = usable.map(
    p => `- ${p.theme} (${p.mentions} people): "${p.topQuote.replace(/"/g, "'")}"`,
  );
  return [
    'AUDIENCE PAIN POINTS (from real discussions, most-referenced first).',
    'Write to these in the audience\'s own language. Do not invent others.',
    ...lines,
  ].join('\n');
}
