import { FORMAT_OPTIONS_JSON, SUPPORTED_FORMATS } from '@/lib/autopilot/capabilities';
import type { ComputeSignalsOutput } from './compute-signals';

export interface BriefPromptInput {
  brandName: string;
  todayIso: string;
  signals28d: ComputeSignalsOutput;
  signals7d: ComputeSignalsOutput;
  previousBriefMd: string | null;
}

export function buildBriefPrompt(input: BriefPromptInput): { system: string; user: string } {
  const formatConstraint =
    SUPPORTED_FORMATS.length === 1
      ? `MUST be ${SUPPORTED_FORMATS[0]} — single-photo posts are the only format the pipeline ships today. Even if reels or carousels would beat the medians, plan around a single-photo post.`
      : `One of: ${FORMAT_OPTIONS_JSON.replace(/"/g, '')}`;
  const system = `You write a one-page brand strategy brief from quantitative signals.
Be specific, cite numbers, avoid generic advice. Use the EXACT section headers
provided. Total length ≤ 500 words.

WHO IS READING THIS:
A marketer who is not technical and does not know how this app works. Write the
way you would explain it out loud to them. This brief is shown to them directly.

LANGUAGE RULES (these matter as much as the numbers):
- NEVER expose internal field names or codes. Write "Thursday at 11am", never
  "Thursday (dow 4)". Never mention dow, n=, sampleSize, clusters, pipeline,
  algorithm, signals, ingest, medians, or any snake_case name.
- Say what a number MEANS, not the statistic's name. Not "median reach per post
  is 0" but "a typical post reached nobody". Not "0 clusters were identified"
  but "your posts are not landing on any clear theme yet".
- Percentages need their base: "19 of 30 captions (63%)", never a bare 63%.
- Say "posts" not "samples", "people reached" not "reach", "saves" not "saved".
- Plain words over marketing-speak: "your posts" not "content assets".
- Do not use dashes as punctuation. Use full stops and commas.
- Every bullet must be something the reader could act on or understand without
  asking a follow-up question.

REQUIRED HEADERS, IN THIS ORDER:
## What's working
## What's not working
## Formula for the next 7 days
## Topics to lean into
## Topics to drop
## Competitor watch

RULES:
- Cite at least one number per bullet in "What's working" and "What's not working".
- Topics come from \`topic_clusters\`. Don't invent topics.
- Competitor watch only mentions account-level changes (followers, post cadence).
  No post-level claims — competitor post data isn't ingested in v1.
- If a section has no data, write "—" rather than fabricating.
- "Formula for the next 7 days" must be a bullet list with these exact bold labels:
  - **Format:** ${formatConstraint}
  - **Best slot:** Day, Hour local
  - **Hook patterns:** 2-3 short phrases
  - **CTA pattern:** phrase
  - **Caption shape:** N lines, N paragraphs, emoji density: low|medium|high`;

  const cf = input.signals28d.captionShape;
  const fingerprintBlock = `
# Caption fingerprint (from your top ${cf.sampleSize ?? 0} posts, ${cf.sourceWindow ?? 'all_posts_fallback'})
- Hook length: median ${cf.hookWordCountP50 ?? 0} words, p90 ${cf.hookWordCountP90 ?? 0} words
- Paragraph rhythm (median chars per paragraph 1-5): ${(cf.paragraphLengthsP50 ?? []).join(' / ') || '—'}
- Emoji density: ${cf.emojiDensity}, position: ${cf.emojiPosition}
- Hashtag count: median ${cf.hashtagCountP50 ?? 0}, p90 ${cf.hashtagCountP90 ?? 0}
- Questions per caption: ${cf.questionCountAvg ?? 0}
- List markers: ${cf.listMarkers}
- Top closing CTAs: ${(cf.ctaTerminalPhrases ?? []).join(', ') || '—'}
`;

  const user = `Brand: ${input.brandName}
Date: ${input.todayIso}

# 28-day signals
${JSON.stringify(input.signals28d, null, 2)}

# 7-day signals (compare deltas vs the 28d row)
${JSON.stringify(input.signals7d, null, 2)}
${fingerprintBlock}

# Previous brief (only flag changes; do not repeat unchanged guidance)
${input.previousBriefMd ?? '(none)'}`;

  return { system, user };
}
