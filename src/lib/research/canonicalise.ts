// src/lib/research/canonicalise.ts
//
// Collapses free-text pain labels onto a small canonical set.
//
// Why this is needed: the extraction pass assigns a theme per discussion, and
// free-text labels essentially never collide — a live run over 83 fitness
// discussions produced 9 pains, ALL with n=1, so nothing crossed the trust
// threshold and the brief came out empty. "Plateaued load", "Plateaued
// progress" and "No improvement for months" are one complaint wearing three
// hats, and recurrence is the entire ranking signal.
//
// String normalisation alone cannot fix this (the words genuinely differ), so
// this is a second model pass whose ONLY job is to say which labels mean the
// same thing. It never sees the quotes, never invents a theme, and cannot
// change mention counts — it returns a label→label mapping that is applied in
// code, so an unmapped or hallucinated label simply keeps its original name.

import { cerebrasChatCompletion } from '@/lib/cerebras';
import type { PainMention } from './pain-points';

const SYSTEM = 'You group synonymous labels. You never invent new concepts and never drop labels.';

function buildPrompt(themes: readonly string[]): string {
  return `These are pain-point labels extracted from separate discussions. Several describe the SAME underlying frustration in different words.

Group them. For each input label, give the canonical label it belongs to.

RULES:
- Use one of the input labels as the canonical name for each group (the clearest one).
- A label with no synonym maps to itself.
- Every input label must appear exactly once in your output.
- Do not invent labels that are not in the list.

LABELS:
${themes.map(t => `- ${t}`).join('\n')}

Return ONLY a JSON object mapping each input label to its canonical label:
{"Plateaued load":"Plateaued progress","Plateaued progress":"Plateaued progress"}`;
}

export interface CanonicaliseDeps {
  complete?: typeof cerebrasChatCompletion;
}

function parseMapping(text: string): Record<string, string> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Rewrites each mention's theme to its canonical form. Returns the input
// unchanged on any failure — worse grouping is acceptable, losing the data is not.
export async function canonicaliseThemes(
  mentions: readonly PainMention[],
  deps: CanonicaliseDeps = {},
): Promise<PainMention[]> {
  const themes = [...new Set(mentions.map(m => m.theme.trim()).filter(Boolean))];
  // Nothing to merge below two distinct labels.
  if (themes.length < 2) return [...mentions];

  const complete = deps.complete ?? cerebrasChatCompletion;
  let raw: string;
  try {
    raw = await complete(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(themes) },
      ],
      { temperature: 0, maxTokens: 1500, responseFormat: 'json' },
    );
  } catch (err) {
    console.warn('[research] canonicalisation failed:', err instanceof Error ? err.message : err);
    return [...mentions];
  }

  const mapping = parseMapping(raw);
  const known = new Set(themes);

  return mentions.map(m => {
    const target = mapping[m.theme.trim()];
    // Only accept a mapping onto a label that actually came from the input —
    // otherwise the model could rename a pain into something nobody said.
    return target && known.has(target) ? { ...m, theme: target } : m;
  });
}
