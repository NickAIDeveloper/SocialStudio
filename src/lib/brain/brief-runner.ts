// src/lib/brain/brief-runner.ts
import { buildBriefPrompt } from './brief-prompt';
import { validateBrief, parseFormula } from './brief-parser';
import { buildFallbackBrief } from './brief-fallback';
import type { ComputeSignalsOutput } from './compute-signals';

export interface BriefResult {
  briefMd: string;
  briefVersion: number;
  status: 'ok' | 'partial' | 'fallback';
  error?: string;
}

export async function runBrief(args: {
  brandName: string;
  todayIso: string;
  signals28d: ComputeSignalsOutput;
  signals7d: ComputeSignalsOutput;
  previousBriefMd: string | null;
  previousVersion: number;
  llmCall: (system: string, user: string) => Promise<string>;
}): Promise<BriefResult> {
  const { system, user } = buildBriefPrompt({
    brandName: args.brandName,
    todayIso: args.todayIso,
    signals28d: args.signals28d,
    signals7d: args.signals7d,
    previousBriefMd: args.previousBriefMd,
  });

  let lastError: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const md = await args.llmCall(system, user);
      const v = validateBrief(md);
      if (v.ok && parseFormula(md) !== null) {
        return { briefMd: md, briefVersion: args.previousVersion + 1, status: 'ok' };
      }
      lastError = 'malformed_brief';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    briefMd: args.previousBriefMd ?? buildFallbackBrief(args.signals28d),
    briefVersion: args.previousBriefMd ? args.previousVersion : 0,
    status: args.previousBriefMd ? 'partial' : 'fallback',
    error: lastError,
  };
}
