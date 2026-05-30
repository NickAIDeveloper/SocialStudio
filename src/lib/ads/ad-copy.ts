// src/lib/ads/ad-copy.ts
// Premium, competitor-aware, psychology-driven ad-copy generator for the Meta
// ad builder. Pure-ish: it takes brand/brief/competitor data as inputs (no DB
// or auth) so it is fully unit-testable. The route does the fetching.
//
// The prompt deliberately bakes in real persuasion science (Cialdini), named
// copywriting frameworks (PAS / AIDA / BAB / 4Ps), and explicit instructions to
// out-position competitors rather than imitate them.

import { cerebrasChatCompletion } from '@/lib/cerebras';
import {
  OBJECTIVE_CONFIG,
  HEADLINE_MAX,
  MAX_HASHTAGS,
  type AdObjective,
} from '@/lib/meta/ads-types';
import { sanitizeCaption, sanitizeHook } from '@/lib/caption-engine';

export interface GenerateAdCopyInput {
  brand: { name: string; slug: string; description?: string | null; websiteUrl?: string | null };
  objective: AdObjective;
  destinationUrl: string;
  briefMd?: string | null;
  competitorContext?: string | null;
}

export interface AdCopy {
  primaryText: string;
  hook: string;
  headline: string;
  hashtags: string[];
}

// Cap a headline at HEADLINE_MAX on a word boundary so Meta never hard-truncates
// mid-word.
function capHeadline(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= HEADLINE_MAX) return clean;
  const cut = clean.slice(0, HEADLINE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trim();
}

// Parse the hashtags field (string OR array) into a lowercased, deduped string[]
// of at most MAX_HASHTAGS entries.
function parseHashtags(raw: unknown): string[] {
  const text = Array.isArray(raw) ? raw.join(' ') : String(raw ?? '');
  const tags = (text.match(/#\w+/g) ?? []).map((t) => t.toLowerCase());
  return [...new Set(tags)].slice(0, MAX_HASHTAGS);
}

// Robust JSON extraction: strip ```json fences, isolate the {...} block, then
// JSON.parse with a couple of cheap repair passes (trailing commas, unescaped
// newlines inside string values).
function parseModelJson(content: string): Record<string, unknown> | null {
  const cleaned = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .replace(/^[^{]*/, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const repairs = [
    match[0],
    match[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'),
    match[0].replace(/(?<=:\s*"[^"]*)\n/g, '\\n'),
  ];
  for (const attempt of repairs) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      /* try next repair */
    }
  }
  return null;
}

function buildSystemPrompt(): string {
  return [
    'You are an elite direct-response ad copywriter and demand strategist who consistently produces Meta ads that out-convert the category.',
    'You think like a marketer who has read Cialdini, Ogilvy, Hopkins, and Sugarman, and who studies competitor positioning before writing a single word.',
    'You write copy grounded in five things: competitor analysis, what actually sells, human-psychology persuasion, real sales/market research, and out-positioning rivals.',
    'You NEVER fabricate statistics, studies, testimonials, user counts, or product features. You only use the brand truths you are given.',
    'House style: no dashes or hyphens, no emojis, no markdown. Reply with ONLY a JSON object and no other text.',
  ].join(' ');
}

function buildUserPrompt(input: GenerateAdCopyInput): string {
  const cfg = OBJECTIVE_CONFIG[input.objective];
  const brandName = input.brand.name || input.brand.slug;

  const brandTruth: string[] = [];
  if (input.brand.description) brandTruth.push(`ABOUT ${brandName.toUpperCase()}: ${input.brand.description}`);
  if (input.brand.websiteUrl) brandTruth.push(`Website: ${input.brand.websiteUrl}`);
  brandTruth.push(`Destination URL for this ad: ${input.destinationUrl}`);
  const brandTruthBlock = brandTruth.join('\n');

  const briefBlock = input.briefMd
    ? `\nBRAND BRAIN (latest strategic brief, use as ground truth for voice and positioning):\n${input.briefMd.slice(0, 3500)}\n`
    : '';

  const competitorBlock = input.competitorContext
    ? `\nCOMPETITOR INTELLIGENCE (what rivals are doing, position AGAINST this, do NOT copy it):\n${input.competitorContext.slice(0, 1200)}\n\nUse this to carve a DISTINCT angle. If competitors all lean on the same promise, attack from a different value. Make ${brandName} the obvious contrast, never an echo.\n`
    : `\nNo competitor data available. Lead with ${brandName}'s single strongest, most specific unique value and make it impossible to ignore.\n`;

  return `Write one premium Meta ad for "${brandName}".

CAMPAIGN OBJECTIVE: ${cfg.label} — ${cfg.description}
Match the angle and CTA to this goal. ${input.objective === 'TRAFFIC' ? 'Drive the click to learn more.' : input.objective === 'ENGAGEMENT' ? 'Provoke reaction, saves, and comments.' : input.objective === 'LEADS' ? 'Drive a sign-up; reduce friction and risk.' : 'Drive an app install; make the value instant and mobile-first.'}

${brandTruthBlock}
${briefBlock}${competitorBlock}

PERSUASION PSYCHOLOGY (deploy the 2-3 MOST fitting for this product, not all):
- Cialdini's principles: reciprocity, scarcity, authority, social proof, commitment/consistency, liking, unity.
- Loss aversion: frame the cost of NOT acting, not just the upside.
- Curiosity gap: open a loop the reader needs closed.
- Pattern interrupt: break the scroll with an unexpected first line.
Pick the principles that genuinely fit ${brandName}'s truth. Never manufacture fake social proof or authority to satisfy a principle.

COPYWRITING FRAMEWORK (choose the single best fit for this objective):
- PAS (Pain, Agitate, Solution) — best for problem-aware audiences.
- AIDA (Attention, Interest, Desire, Action) — best for broad cold traffic.
- BAB (Before, After, Bridge) — best for transformation products.
- 4Ps (Promise, Picture, Proof, Push) — best when you have a strong concrete promise.
Commit to ONE framework and structure the primaryText around it.
Use the chosen framework INTERNALLY as structure only. NEVER print framework names or stage labels in the output (do NOT write 'Attention:', 'Interest:', 'Desire:', 'Action:', 'PAS', 'AIDA', 'BAB', '4Ps', 'Problem:', 'Solution:', 'Before:', 'After:', 'Bridge:', etc.). The copy must read as natural persuasive prose, not a labelled template.

DIFFERENTIATION: position AGAINST the competitor angle above. Out-flank, do not imitate. Make the distinct value of ${brandName} the spine of the ad.

HARD RULES:
- NEVER invent stats, percentages, studies, testimonials, awards, or features that were not given above.
- Only reference real ${brandName} value. Soft language ("many people find") over fake science.
- No dashes or hyphens. No emojis. No markdown. No hashtags inside primaryText.

OUTPUT — return ONLY this JSON object:
{"primaryText":"2-4 short paragraphs, blank-line separated: a scroll-stopping hook line, then a body that runs the chosen framework, then a clear CTA matched to the objective","hook":"3-6 word scroll-stopper","headline":"<=40 chars, benefit-driven","hashtags":"#a #b #c #d #e (exactly 5, tiered broad, niche, then specific)"}`;
}

export async function generateAdCopy(input: GenerateAdCopyInput): Promise<AdCopy> {
  const content = await cerebrasChatCompletion(
    [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    { temperature: 0.9, maxTokens: 900, responseFormat: 'json' },
  );

  const parsed = parseModelJson(content);
  if (!parsed || typeof parsed.primaryText !== 'string' || parsed.primaryText.trim().length === 0) {
    throw new Error('ad-copy: model returned unparseable or empty output');
  }

  const primaryText = sanitizeCaption(String(parsed.primaryText ?? ''));
  const hook = sanitizeHook(String(parsed.hook ?? ''));
  const headline = capHeadline(sanitizeHook(String(parsed.headline ?? parsed.hook ?? '')));
  const hashtags = parseHashtags(parsed.hashtags);

  if (!primaryText.trim()) {
    throw new Error('ad-copy: primaryText empty after sanitization');
  }

  return { primaryText, hook, headline, hashtags };
}
