import {
  type AdDraft,
  type AdObjective,
  OBJECTIVE_CONFIG,
  HEADLINE_MAX,
  MAX_HASHTAGS,
} from '@/lib/meta/ads-types';

export interface CaptionResult {
  caption: string;
  hashtags: string; // space- or newline-separated "#tag" string
  hookText: string;
}

export interface BuildAdDraftInput {
  objective: AdObjective;
  destinationUrl: string;
  caption: CaptionResult;
  imageUrl: string;
  interestSuggestions: string[];
}

function capHeadline(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= HEADLINE_MAX) return clean;
  const cut = clean.slice(0, HEADLINE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trim();
}

function parseHashtags(raw: string): string[] {
  const tags = (raw.match(/#\w+/g) ?? []).map((t) => t.toLowerCase());
  return [...new Set(tags)].slice(0, MAX_HASHTAGS);
}

export function buildAdDraft(input: BuildAdDraftInput): AdDraft {
  const cfg = OBJECTIVE_CONFIG[input.objective];
  return {
    objective: input.objective,
    destinationUrl: input.destinationUrl,
    primaryText: input.caption.caption,
    hook: input.caption.hookText.trim(),
    headline: capHeadline(input.caption.hookText || input.caption.caption),
    hashtags: parseHashtags(input.caption.hashtags),
    cta: cfg.defaultCta,
    imageUrl: input.imageUrl,
    interestSuggestions: [...new Set(input.interestSuggestions)].slice(0, 10),
  };
}
