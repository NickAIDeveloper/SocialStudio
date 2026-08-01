// src/lib/ads/ad-copy-guard.ts
//
// Checks generated ad copy for the mistakes a prompt alone cannot prevent.
//
// Prompts are suggestions; code is enforcement. The first ad this platform
// generated (2026-08-01) closed with "Tap the link in bio to learn more" —
// organic-post phrasing in a PAID ad, which renders with its own CTA button and
// destination URL. There is no bio and no link in the caption, so that sentence
// sends the reader nowhere and wastes the click. The prompt now forbids it; this
// catches it when the model forgets anyway.
//
// Reports every issue found rather than stopping at the first, so one pass shows
// the full picture.

export interface AdCopyDraft {
  primaryText?: string | null;
  hook?: string | null;
  headline?: string | null;
}

export interface AdCopyIssue {
  code: 'organic_navigation_phrase' | 'headline_duplicates_hook' | 'headline_too_long';
  severity: 'error' | 'warning';
  detail: string;
}

// Meta truncates the headline slot around here.
const MAX_HEADLINE = 40;

// Instructions that only make sense on an organic post. Deliberately specific:
// matching the bare word "link" would flag legitimate prose like "the link
// between training and recovery".
const ORGANIC_PHRASES: RegExp[] = [
  /link\s+in\s+(our\s+|the\s+)?bio/i,
  /link\s+below/i,
  /swipe\s+up/i,
  /\bDM\s+(us|me)\b/i,
  /comment\s+[A-Z]{2,}\b/,
  /check\s+(out\s+)?(the\s+|our\s+)?bio/i,
];

// Compare headline and hook ignoring case, surrounding space and end
// punctuation — "What finish time awaits you?" and "what finish time awaits
// you!" occupy the same slot to a reader.
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[!?.,:;\s]+$/, '');
}

export function auditAdCopy(draft: AdCopyDraft): AdCopyIssue[] {
  const issues: AdCopyIssue[] = [];
  const primaryText = draft?.primaryText ?? '';
  const hook = draft?.hook ?? '';
  const headline = draft?.headline ?? '';

  for (const pattern of ORGANIC_PHRASES) {
    const match = primaryText.match(pattern);
    if (match) {
      issues.push({
        code: 'organic_navigation_phrase',
        severity: 'error',
        detail: `Copy says "${match[0]}" — this is a paid ad with its own CTA button and destination URL, so there is nowhere else to send the reader.`,
      });
      break; // one report per draft is enough; the fix is the same either way
    }
  }

  if (hook && headline && normalise(hook) === normalise(headline)) {
    issues.push({
      code: 'headline_duplicates_hook',
      severity: 'warning',
      detail: 'Headline is the same sentence as the hook; Meta renders them in separate slots, so one is wasted.',
    });
  }

  if (headline.length > MAX_HEADLINE) {
    issues.push({
      code: 'headline_too_long',
      severity: 'warning',
      detail: `Headline is ${headline.length} characters; Meta truncates around ${MAX_HEADLINE}.`,
    });
  }

  return issues;
}
