// src/lib/research/sources.ts
//
// Where audience pain gets mined from.
//
// The method calls for scraping Reddit, because that is where people complain
// honestly. Reddit closed anonymous API access in 2023 — as of 2026-08-01
// `www.reddit.com/*.json` returns HTML, `old.reddit.com` 302s and
// `api.reddit.com` 403s — so it now requires OAuth credentials. Rather than
// block the whole feature on a signup, this starts with a source that is still
// genuinely open and adds Reddit as an upgrade.
//
// Stack Exchange: no key needed (300 requests/day anonymous), and its
// "how do I…" / "why does…" questions ARE pain points — they are precisely the
// things people are stuck on, just phrased as questions rather than complaints.
//
// Everything here fails soft. Research is an enhancement; a dead third-party
// API must never be able to break generation for a brand.

export interface Discussion {
  title: string;
  body: string;
  score: number;
  permalink: string;
  source: string;
}

export interface SourceDeps {
  fetcher?: typeof fetch;
}

// Communities worth mining, by rough topic. Kept small and explicit rather than
// guessed at runtime — pointing a brand at the wrong community produces
// confident, irrelevant pain points.
export const SOURCE_SITES: Record<string, { site: string; label: string }> = {
  fitness: { site: 'fitness', label: 'Physical Fitness' },
  health: { site: 'health', label: 'Health' },
  languagelearning: { site: 'languagelearning', label: 'Language Learning' },
  productivity: { site: 'productivity', label: 'Productivity' },
  parenting: { site: 'parenting', label: 'Parenting' },
  money: { site: 'money', label: 'Personal Finance' },
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

// The API returns HTML bodies. We want the words, not the markup.
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    // Tags become a space, not nothing, so "<p>one</p><p>two</p>" doesn't
    // become "onetwo". That leaves a gap before punctuation, tidied below.
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#?\w+;/g, m => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

interface StackExchangeItem {
  title?: string;
  body?: string;
  score?: number;
  link?: string;
}

// Highest-voted questions matching a topic. Votes indicate how many people
// share the problem, which is exactly the "most referenced" signal we rank on.
export async function fetchStackExchangeDiscussions(
  query: string,
  site: string,
  deps: SourceDeps = {},
): Promise<Discussion[]> {
  const fetcher = deps.fetcher ?? fetch;
  const url =
    `https://api.stackexchange.com/2.3/search/advanced` +
    `?order=desc&sort=votes&q=${encodeURIComponent(query)}` +
    `&site=${encodeURIComponent(site)}&pagesize=25&filter=withbody`;

  try {
    const res = await fetcher(url);
    if (!res.ok) {
      console.warn(`[research] stackexchange ${site} returned HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { items?: StackExchangeItem[] } | null;
    const items = json?.items;
    if (!Array.isArray(items)) return [];

    return items
      .map(item => ({
        title: stripHtml(item.title),
        body: stripHtml(item.body),
        score: item.score ?? 0,
        permalink: item.link ?? '',
        source: `stackexchange:${site}`,
      }))
      // A question with neither title nor body tells us nothing.
      .filter(d => d.title.length > 0 || d.body.length > 0);
  } catch (err) {
    console.warn('[research] stackexchange fetch failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
