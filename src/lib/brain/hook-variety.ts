// src/lib/brain/hook-variety.ts
//
// Forces structural range into hooks.
//
// The creative loop measured the problem this solves: across 76 backfilled
// posts, ~75% of every hook ever published was the same structural shape
// ('statement') — 15 of 23 for pacebrain, 28 of 36 for affectly. The existing
// no-reuse machinery (URL normalisation, pHash, text dedup) is excellent at
// preventing DUPLICATES but has no way to create RANGE: it only ever rejects
// what has been seen, never asks for something different in kind.
//
// This is the entropy problem in its cheapest form. The method's remedies —
// pulling competitor creative from Meta's Ad Library, mining YouTube and
// podcast transcripts — import range from outside. Both are currently blocked:
// Meta's public Ad Library API exposes only political ads, and transcript
// sources need a keyed API. The pain-point research already landed does import
// outside language; this complements it by varying the SHAPE of delivery
// rather than the subject.
//
// Deterministic on purpose. A random pick would sometimes choose the pattern
// just used, and "why did it pick that?" would be unanswerable.

import type { HookPattern } from './creative-stats';

// 'unknown' is excluded: it is a classification failure, not a shape to aim for.
export const TARGETABLE_PATTERNS: readonly HookPattern[] = [
  'question',
  'number',
  'contrarian',
  'personal',
  'statement',
];

// A shape occupying more than this share of recent hooks is crowding out the rest.
export const OVERUSE_THRESHOLD = 0.5;

// Fraction of recent hooks using each shape.
export function patternShare(recent: readonly string[]): Partial<Record<string, number>> {
  if (recent.length === 0) return {};
  const counts = new Map<string, number>();
  for (const pattern of recent) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);

  const out: Partial<Record<string, number>> = {};
  for (const [pattern, n] of counts) out[pattern] = n / recent.length;
  return out;
}

// Which shape should the next hook use?
//
// Never-used shapes win outright — they are the range actually missing. Beyond
// that, least-used wins, and the immediately-previous shape is excluded
// regardless, since back-to-back repetition reads as sameness however rare the
// shape is overall.
export function pickUnderusedPattern(recent: readonly string[]): HookPattern {
  const mostRecent = recent[recent.length - 1];
  const counts = new Map<HookPattern, number>(TARGETABLE_PATTERNS.map(p => [p, 0]));
  for (const pattern of recent) {
    if (counts.has(pattern as HookPattern)) {
      counts.set(pattern as HookPattern, (counts.get(pattern as HookPattern) ?? 0) + 1);
    }
  }

  const candidates = TARGETABLE_PATTERNS.filter(p => p !== mostRecent);
  const pool = candidates.length > 0 ? candidates : [...TARGETABLE_PATTERNS];

  // Ties break by the fixed order of TARGETABLE_PATTERNS, so the same history
  // always yields the same answer.
  return pool.reduce((best, p) => ((counts.get(p) ?? 0) < (counts.get(best) ?? 0) ? p : best), pool[0]);
}

const SHAPE_GUIDE: Record<HookPattern, string> = {
  question: 'open with a direct question the reader cannot answer without reading on',
  number: 'open with a specific number that frames what follows',
  contrarian: 'open by contradicting something the reader assumes is true',
  personal: 'open with a first-person admission or confession',
  statement: 'open with a flat declarative claim',
  unknown: 'open in whatever shape best fits',
};

// Prompt fragment steering the next hook towards an under-used shape.
export function buildVarietyDirective(target: HookPattern, recent: readonly string[]): string {
  const lines = [
    `HOOK SHAPE FOR THIS POST: ${target} — ${SHAPE_GUIDE[target]}.`,
  ];

  const share = patternShare(recent);
  const overused = Object.entries(share)
    .filter(([, fraction]) => (fraction ?? 0) > OVERUSE_THRESHOLD)
    .map(([pattern, fraction]) => `${pattern} (${Math.round((fraction ?? 0) * 100)}% of recent hooks)`);

  if (overused.length > 0) {
    lines.push(
      `Do NOT use these overused shapes: ${overused.join(', ')}. They already dominate this account and another one adds nothing.`,
    );
  } else if (recent.length > 0) {
    const last = recent.slice(-3).join(', ');
    lines.push(`Recent hook shapes were: ${last}. Do not repeat the most recent one.`);
  }

  return lines.join('\n');
}
