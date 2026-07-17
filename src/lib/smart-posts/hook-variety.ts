// Hook variety analysis — pure, no I/O.
//
// Detects when generated overlay hooks have collapsed into one repeated sentence
// SHAPE (the "Your pace is hiding" / "Your X is Y" wall) and classifies a hook
// into a creative angle so the generator can rotate away from recently-used
// shapes. Paired with creative-angles.ts.

import type { AngleId } from './creative-angles';

// Common function/structure words kept verbatim in a skeleton; every other
// ("content") word becomes a wildcard. This is what makes "your pace is hiding",
// "your pace is lying" and "your race plan is wrong" all collapse to the SAME
// skeleton "your * is *" so we can detect the overused shape.
const FUNCTION_WORDS = new Set([
  'your', 'my', 'our', 'their', 'his', 'her', 'its',
  'you', 'we', 'i', 'they', 'he', 'she', 'it',
  'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with',
  'that', 'this', 'these', 'those',
  'not', 'no', 'and', 'or', 'but', 'so',
]);

/**
 * Reduces a hook to its structural skeleton: lowercase, punctuation stripped,
 * runs of content words collapsed to a single `*`, function words kept. Returns
 * '' for empty/non-alphanumeric input.
 *
 *   "Your pace is hiding"     -> "your * is *"
 *   "Your race plan is wrong" -> "your * is *"
 *   "Stop chasing splits"     -> "*"
 *   "Nobody talks about this" -> "* this"
 */
export function hookSkeleton(hook: string | null | undefined): string {
  const words = (hook ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const tokens: string[] = [];
  for (const w of words) {
    const token = FUNCTION_WORDS.has(w) ? w : '*';
    if (token === '*' && tokens[tokens.length - 1] === '*') continue; // collapse runs
    tokens.push(token);
  }
  return tokens.join(' ');
}

/** Renders a skeleton for humans/prompts: "your * is *" -> "your ___ is ___". */
export function skeletonToHuman(skeleton: string | null | undefined): string {
  return (skeleton ?? '').replace(/\*/g, '___');
}

/** True when `hook`'s skeleton equals `skeleton` (a collapse match). */
export function hookMatchesSkeleton(
  hook: string | null | undefined,
  skeleton: string | null | undefined,
): boolean {
  const s = (skeleton ?? '').trim();
  if (!s) return false;
  return hookSkeleton(hook) === s;
}

/**
 * Returns the dominant hook skeleton across recent hooks when one shape has
 * taken over, else null. A shape is "dominant" when it appears in at least
 * `minCount` hooks AND at least `minShare` of them — the signal that the feed
 * has collapsed and that shape must be banned from the next hook.
 */
export function dominantHookSkeleton(
  hooks: readonly (string | null | undefined)[],
  opts: { minShare?: number; minCount?: number } = {},
): string | null {
  const { minShare = 0.34, minCount = 3 } = opts;
  // Only STRUCTURED skeletons can be "dominant". A bare "*" (any all-content-word
  // hook like "Stop chasing splits" / "Mile 18 legs gone") carries no reusable
  // shape — those are exactly the varied punchy hooks the command/story angles
  // produce. Banning "*" would render as a meaningless "___" and over-fire the
  // regeneration guard, so degenerate skeletons are excluded from the pool.
  const skeletons = hooks
    .map(hookSkeleton)
    .filter((s) => s.length > 0 && s.split(' ').some((t) => t !== '*'));
  if (skeletons.length === 0) return null;

  const counts = new Map<string, number>();
  for (const s of skeletons) counts.set(s, (counts.get(s) ?? 0) + 1);

  let bestSkeleton: string | null = null;
  let bestCount = 0;
  for (const [s, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      bestSkeleton = s;
    }
  }
  if (bestSkeleton === null) return null;
  const share = bestCount / skeletons.length;
  return bestCount >= minCount && share >= minShare ? bestSkeleton : null;
}

const COMMAND_VERB = /^(stop|start|do|don'?t|try|quit|drop|ditch|avoid|never|always|make|build|forget|skip|ignore|delete|kill|fix|read)\b/i;
const MYTH_CUE = /\b(lying|lie|lies|hiding|hidden|wrong|false|myth|broken|isn'?t|aren'?t|won'?t|doesn'?t|nobody|misleading)\b/i;
const CONFESSION_CUE = /\b(i|i'?m|i'?ve|my|me|we|us)\b/i;
const METAPHOR_CUE = /\b(like|as)\b/i;

/**
 * Classifies a hook into the closest creative angle by cheap surface signals.
 * Order matters — the first matching rule wins. Used to infer which angles the
 * recent posts already used so the generator can pick a least-recently-used one.
 */
export function classifyHookAngle(hook: string | null | undefined): AngleId {
  const text = (hook ?? '').trim();
  if (!text) return 'curiosity';
  if (/\?\s*$/.test(text)) return 'question';
  if (/\d/.test(text)) return 'stat';
  if (COMMAND_VERB.test(text)) return 'command';
  if (MYTH_CUE.test(text)) return 'myth';
  if (METAPHOR_CUE.test(text)) return 'metaphor';
  if (CONFESSION_CUE.test(text)) return 'confession';
  return 'curiosity';
}

/**
 * Extracts the transferable *techniques* from the brand's winning hook so they
 * can be carried forward as guidance (never the literal line). These describe
 * the psychology that made the top post perform, not its wording.
 */
export function hookTechniques(hook: string | null | undefined): string[] {
  const text = (hook ?? '').trim();
  const techniques: string[] = [];
  if (!text) return techniques;
  if (/\byou'?r?e?\b|\byour\b/i.test(text)) {
    techniques.push('direct second-person "you" address');
  }
  if (MYTH_CUE.test(text)) {
    techniques.push('a contrarian reframe that challenges a belief the reader holds');
  }
  if (/\?\s*$/.test(text)) {
    techniques.push('an open question that creates tension');
  }
  if (/\d/.test(text)) {
    techniques.push('a concrete number that promises specificity');
  }
  // Short, punchy hooks with no number/question rely on a curiosity gap.
  if (techniques.length === 0 || (text.split(/\s+/).length <= 6 && !/\d/.test(text) && !/\?\s*$/.test(text))) {
    techniques.push('a curiosity gap that withholds the payoff');
  }
  return Array.from(new Set(techniques));
}
