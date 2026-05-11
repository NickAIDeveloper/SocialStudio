// src/lib/smart-posts/image-query.ts
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

const SEMANTIC_OVERLAP_STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'your', 'have', 'will', 'more', 'just',
  'some', 'when', 'what', 'they', 'them', 'their', 'there', 'these', 'those',
  'into', 'about', 'than', 'then', 'been', 'being', 'were', 'which', 'would',
  'could', 'should', 'like', 'make', 'made', 'also', 'only',
]);

function tokenizeForOverlap(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
    if (raw.length >= 4 && !SEMANTIC_OVERLAP_STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

function hasContextOverlap(query: string, contextTexts: string[]): boolean {
  const queryTokens = tokenizeForOverlap(query);
  if (queryTokens.size === 0) return false;
  for (const ctx of contextTexts) {
    for (const tok of tokenizeForOverlap(ctx)) {
      if (queryTokens.has(tok)) return true;
    }
  }
  return false;
}

export interface DeriveImageQueryInput {
  brandName: string;
  brandDescription: string;
  hookText: string;
  caption: string;
  contentType: string;
  fallback: string;
}

export async function deriveImageQuery(args: DeriveImageQueryInput): Promise<string> {
  if (!isCerebrasAvailable()) return args.fallback;
  try {
    const captionExcerpt = args.caption.split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 400);
    const prompt = `Pick the best stock-photo search query for this Instagram post.

BRAND: ${args.brandName}${args.brandDescription ? ` — ${args.brandDescription.slice(0, 200)}` : ''}
HOOK: ${args.hookText}
CAPTION: ${captionExcerpt}

Your job: extract the most CONCRETE VISUAL SUBJECT from the caption above (not the brand, not the hook — the caption) and turn it into a 3–5 word stock-photo query.

Process:
1. Identify the literal activity, scene, or object the caption is about (e.g. "studying in bed at night", "running on a treadmill", "writing in a journal", "hiking alone at dawn", "taking notes in a cafe").
2. Turn that into 3–5 concrete words a stock-photo search would return well (people + activity + setting).

HARD BANS — these stock cliches always come back generic and ruin the post:
- silhouette / person looking at sunset / person looking at water / person on mountain
- abstract nature (frost, twigs, waves, clouds, leaves) unless the caption is literally about that
- hands holding a phone, hands typing, generic "lifestyle" stock
- "contemplation", "reflection", "journey" as query words

Good queries match a SCENE. Bad queries match a MOOD.

Return ONLY the query: 3–5 words, lowercase, no quotes, no punctuation.`;

    const content = await cerebrasChatCompletion(
      [
        { role: 'system', content: 'You are a visual editor. You pick stock-photo queries that precisely match post subjects. Reply with ONLY the query.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 30 },
    );
    const cleaned = content
      .replace(/["'`]/g, '')
      .replace(/[.!?,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ');
    if (cleaned.length < 6 || cleaned.length > 80) return args.fallback;
    if (/query|reply|only|search|caption|hook/.test(cleaned)) return args.fallback;
    if (/silhouette|sunset|contemplation|reflection|journey\b/.test(cleaned)) {
      return args.fallback;
    }
    const contextTexts = [args.brandName, args.brandDescription, args.hookText, args.caption];
    if (!hasContextOverlap(cleaned, contextTexts)) return args.fallback;
    return cleaned;
  } catch {
    return args.fallback;
  }
}
