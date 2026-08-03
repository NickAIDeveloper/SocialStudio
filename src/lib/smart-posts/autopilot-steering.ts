// src/lib/smart-posts/autopilot-steering.ts
//
// Steering for the AUTOPILOT generation path (god-mode).
//
// Audited 2026-08-03: every piece of creative steering this repo owns was wired
// into /api/captions — the manual, human-driven single-post path — and none of
// it into god-mode, the path that publishes unattended every other day. So the
// rail with no human reviewing its output was the one rail generating without
// variety steering or audience research. The commit that claimed to "actually
// wire hook-shape variety into the pipelines" wired it into one pipeline.
//
// This module is the missing link, kept pure so it can be tested exhaustively
// without a database or an LLM. The route does the fetching; this decides what
// the prompt should say.
//
// Deliberately NOT included here: the creative-angle LRU rotation and the
// skeleton ban from /api/captions. Those need a variationSeed and an angle
// leaderboard that god-mode has no equivalent of, and god-mode's LLM already
// designs its own topic seed. Shape variety and audience pain are the two that
// transfer cleanly; pretending the rest transfer would be worse than leaving
// them where they are.

import { classifyHookPattern, type HookPattern } from '@/lib/brain/creative-stats';
import { pickUnderusedPattern, buildVarietyDirective } from '@/lib/brain/hook-shape';

export interface SteeringInput {
  // Raw hook text of recent posts, NEWEST FIRST (i.e. `.orderBy(desc(...))`).
  // May contain blanks from legacy or failed rows.
  recentHooks: readonly string[];
  // Pre-formatted audience research, or null when research has never run.
  painBrief: string | null;
}

export interface AutopilotSteering {
  targetPattern: HookPattern;
  varietyDirective: string;
  painBlock: string | null;
  // Prompt-ready blocks in the order they should appear.
  blocks: string[];
}

export function buildAutopilotSteering(input: SteeringInput): AutopilotSteering {
  // Blank hooks classify as 'unknown', which is a classification failure rather
  // than a shape anyone chose. Counting them would let dead rows drag the
  // distribution toward a target nobody is actually over-using.
  const patterns = input.recentHooks
    .map(h => (h ?? '').trim())
    .filter(Boolean)
    .map(h => classifyHookPattern(h));

  // An empty history is not a reason to skip steering: a brand should get range
  // from its first post, not once it has already published a run of identical
  // shapes and the problem is visible.
  const targetPattern = pickUnderusedPattern(patterns);
  const varietyDirective = buildVarietyDirective(targetPattern, patterns);

  const trimmedPain = (input.painBrief ?? '').trim();
  const painBlock = trimmedPain.length > 0 ? trimmedPain : null;

  // Pain first: it is what the reader already feels, and the post works by
  // naming that before anything else. The shape is only how it gets said.
  // Same ordering as ad-copy.ts, for the same reason.
  const blocks = [painBlock, varietyDirective].filter((b): b is string => b !== null);

  return { targetPattern, varietyDirective, painBlock, blocks };
}
