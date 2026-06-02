// src/lib/ads/advice.ts
// Builds the brand-aware "what to do next" prompt for a single ad and calls
// Cerebras. Pure prompt builder is unit-tested; getAdvice is integration-tested
// via the route. House style mirrors ad-copy.ts (no dashes, no emojis, no markdown).
import { cerebrasChatCompletion } from '@/lib/cerebras';
import type { AdInsight } from '@/lib/meta/ad-insights';

export interface AdviceInput {
  brandName: string;
  objective: string; // OUTCOME_*
  insight: AdInsight;
  reasons: string[]; // from evaluateSignals
  headline: string | null;
  briefMd?: string | null;
  competitorContext?: string | null;
}

export function buildAdvicePrompt(input: AdviceInput): string {
  const i = input.insight;
  const brief = input.briefMd ? `\nBRAND BRAIN (voice + positioning ground truth):\n${input.briefMd.slice(0, 2500)}\n` : '';
  const comp = input.competitorContext ? `\nCOMPETITOR ANGLE (position against, do not copy):\n${input.competitorContext.slice(0, 1000)}\n` : '';
  return `You are advising on a live Meta ad for "${input.brandName}" (objective ${input.objective}).

CURRENT AD
Headline: ${input.headline ?? '(none)'}
Metrics (last 14 days): spend ${i.spend.toFixed(2)} ${i.currency ?? ''}, impressions ${i.impressions}, clicks ${i.clicks}, CTR ${i.ctr.toFixed(2)}%, CPC ${i.cpc.toFixed(2)}, frequency ${i.frequency.toFixed(1)}, results ${i.results} (${i.resultType}).

DIAGNOSIS (already computed): ${input.reasons.join(' ')}
${brief}${comp}
Give 3 concrete, specific next steps to improve this ad's results next time. Be tactical: name the exact hook angle, audience tweak, or creative change to try, grounded in the brand truth above. No dashes, no emojis, no markdown. Reply as 3 short numbered sentences.`;
}

export async function getAdvice(input: AdviceInput): Promise<string> {
  const content = await cerebrasChatCompletion(
    [
      { role: 'system', content: 'You are a senior Meta ads strategist. Be specific and tactical. No dashes, no emojis, no markdown.' },
      { role: 'user', content: buildAdvicePrompt(input) },
    ],
    { temperature: 0.7, maxTokens: 600 },
  );
  return (content ?? '').trim();
}
