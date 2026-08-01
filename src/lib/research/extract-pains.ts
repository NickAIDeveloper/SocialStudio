// src/lib/research/extract-pains.ts
//
// Turns raw community discussions into labelled pain mentions that
// rankPainPoints can stack by recurrence.
//
// The model's ONLY job here is labelling and quoting — it assigns a short theme
// to each discussion and pulls the person's own words. It never invents pains,
// never merges them, and never decides what matters. Ranking is done in code
// from mention counts, so "what the audience cares about" is decided by
// arithmetic over real posts rather than by an LLM's impression of a topic.
//
// That split matters: if the model were asked to "summarise the top pain
// points", it would happily produce a confident, plausible list that owes more
// to its training data than to this audience.

import { cerebrasChatCompletion } from '@/lib/cerebras';
import type { Discussion } from './sources';
import type { PainMention } from './pain-points';

const SYSTEM =
  'You label customer pain points. You never invent problems, and you only ever quote text that appears verbatim in the input.';

// One theme per discussion. Deliberately not asked to deduplicate — grouping is
// normalisePainKey's job, and a model merging themes would quietly destroy the
// mention counts the ranking depends on.
function buildPrompt(discussions: readonly Discussion[]): string {
  const numbered = discussions
    .map((d, i) => `[${i}] ${d.title}\n${d.body.slice(0, 400)}`)
    .join('\n\n');

  return `Below are real discussions from a community. For EACH item, identify the single underlying frustration and quote the words that express it.

RULES:
- theme: 2-4 words naming the frustration (e.g. "Plateaued progress", "Injury risk", "Rigid plans"). Reuse the SAME wording when two items share a frustration.
- quote: a short verbatim span COPIED from that item. Never paraphrase, never write your own sentence.
- If an item expresses no frustration, omit it entirely.
- Do not merge items. One entry per item that has a frustration.

DISCUSSIONS:
${numbered}

Return ONLY a JSON array:
[{"index":0,"theme":"...","quote":"..."}]`;
}

interface RawLabel {
  index?: number;
  theme?: string;
  quote?: string;
}

function parseLabels(text: string): RawLabel[] {
  // Models often wrap JSON in prose or a code fence; take the array itself.
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? (parsed as RawLabel[]) : [];
  } catch {
    return [];
  }
}

export interface ExtractDeps {
  complete?: typeof cerebrasChatCompletion;
}

// Returns [] on any failure — research must never break the caller.
export async function extractPainMentions(
  discussions: readonly Discussion[],
  deps: ExtractDeps = {},
): Promise<PainMention[]> {
  if (discussions.length === 0) return [];
  const complete = deps.complete ?? cerebrasChatCompletion;

  let raw: string;
  try {
    raw = await complete(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(discussions) },
      ],
      { temperature: 0.1, maxTokens: 2000, responseFormat: 'json' },
    );
  } catch (err) {
    console.warn('[research] pain extraction failed:', err instanceof Error ? err.message : err);
    return [];
  }

  return parseLabels(raw)
    .map((label): PainMention | null => {
      const source = typeof label.index === 'number' ? discussions[label.index] : undefined;
      if (!source || !label.theme?.trim() || !label.quote?.trim()) return null;
      return {
        theme: label.theme.trim(),
        quote: label.quote.trim(),
        source: source.source,
        permalink: source.permalink,
        // Community votes stand in for "how many people share this", which is
        // what makes one phrasing better evidence than another.
        upvotes: source.score,
      };
    })
    .filter((m): m is PainMention => m !== null);
}
