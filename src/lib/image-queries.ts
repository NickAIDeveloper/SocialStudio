// Sanitizer for LLM-derived stock-photo search queries.
//
// The LLM is asked to return {"queries":[...]} with 5 ranked queries. This
// module parses that response, drops cliches/abstractions, enforces shape
// (3-6 words, lowercase, no punctuation, length bounds), and verifies each
// query shares at least one substantive word with the post context so the
// LLM hasn't drifted off-topic (the "coins for a running post" failure mode).

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'your', 'have', 'will', 'more', 'just',
  'some', 'when', 'what', 'they', 'them', 'their', 'there', 'these', 'those',
  'into', 'about', 'than', 'then', 'been', 'being', 'were', 'which', 'would',
  'could', 'should', 'like', 'make', 'made', 'also', 'only',
]);

// Stock-photo cliches that always come back generic. Topical words like
// "mindset" or "success" are NOT banned — they may legitimately be the subject
// of the caption (and excluding them forces fallback to brand presets, which
// is the very behavior we're fixing).
const BANNED_RE = /\b(silhouette|contemplation|lifestyle stock)\b/i;

const META_LEAK_RE = /\b(query|reply|only|search|caption|hook|json|return)\b/i;

export function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
    if (raw.length >= 4 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

// Score an image's tag string against a set of post tokens. Tag strings on
// Pixabay/Unsplash are comma-separated; we tokenize the same way as the
// query check so an image's "running, sport, athlete" matches a post about
// "running" but a forest landscape's "forest, mountain, lake" scores 0
// against a post about "study, learning, pace". Higher score = better match.
export function scoreTagOverlap(tags: string, postTokens: Set<string>): number {
  const tagTokens = tokenize(tags);
  let overlap = 0;
  for (const t of tagTokens) if (postTokens.has(t)) overlap++;
  return overlap;
}

function hasContextOverlap(query: string, contexts: string[]): boolean {
  const q = tokenize(query);
  if (q.size === 0) return false;
  for (const ctx of contexts) {
    for (const tok of tokenize(ctx)) {
      if (q.has(tok)) return true;
    }
  }
  return false;
}

function normalizeQuery(raw: string): string {
  return raw
    .replace(/["'`]/g, '')
    .replace(/[.!?,;:#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');
}

function extractQueriesArray(raw: string): string[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (Array.isArray(obj.queries)) {
        return obj.queries.filter((q: unknown): q is string => typeof q === 'string');
      }
    } catch { /* fall through to bracket extraction */ }
  }
  const arrMatch = raw.match(/\[[\s\S]*?\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) return arr.filter((q: unknown): q is string => typeof q === 'string');
    } catch { /* ignore */ }
  }
  // Last-ditch: split on newlines and treat each line as a query
  return raw.split('\n').map((l) => l.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean);
}

export function sanitizeImageQueries(
  raw: string,
  opts: { contextTexts: string[]; max?: number } = { contextTexts: [], max: 6 },
): string[] {
  const max = opts.max ?? 6;
  const candidates = extractQueriesArray(raw);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const q = normalizeQuery(c);
    if (q.length < 6 || q.length > 80) continue;
    const wordCount = q.split(' ').length;
    if (wordCount < 2 || wordCount > 6) continue;
    if (BANNED_RE.test(q)) continue;
    if (META_LEAK_RE.test(q)) continue;
    if (opts.contextTexts.length > 0 && !hasContextOverlap(q, opts.contextTexts)) continue;
    if (seen.has(q)) continue;
    seen.add(q);
    out.push(q);
    if (out.length >= max) break;
  }

  return out;
}
