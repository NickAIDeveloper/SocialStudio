import type { ComputeSignalsOutput } from './compute-signals';

export interface BriefPromptInput {
  brandName: string;
  todayIso: string;
  signals28d: ComputeSignalsOutput;
  signals7d: ComputeSignalsOutput;
  previousBriefMd: string | null;
}

export function buildBriefPrompt(input: BriefPromptInput): { system: string; user: string } {
  const system = `You write a one-page brand strategy brief from quantitative signals.
Be specific, cite numbers, avoid generic advice. Use the EXACT section headers
provided. Total length ≤ 500 words.

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
  - **Format:** REEL | CAROUSEL | IMAGE
  - **Best slot:** Day, Hour local
  - **Hook patterns:** 2-3 short phrases
  - **CTA pattern:** phrase
  - **Caption shape:** N lines, N paragraphs, emoji density: low|medium|high`;

  const user = `Brand: ${input.brandName}
Date: ${input.todayIso}

# 28-day signals
${JSON.stringify(input.signals28d, null, 2)}

# 7-day signals (compare deltas vs the 28d row)
${JSON.stringify(input.signals7d, null, 2)}

# Previous brief (only flag changes; do not repeat unchanged guidance)
${input.previousBriefMd ?? '(none)'}`;

  return { system, user };
}
