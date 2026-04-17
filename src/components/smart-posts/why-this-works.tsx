'use client';

// "Why this works" panel. Sits between the post caption and the action buttons
// in smart-posts-dashboard. Renders whichever of three signals is present:
//   - rationale (god-mode path, 4-6 LLM sentences, split into bullets)
//   - contributions (scrape path, pre-written sentence per insight)
//   - deepProfile (god-mode path, numeric callouts derived here)
// When none are present the component renders nothing.

import { Sparkles } from 'lucide-react';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export interface WhyThisWorksProps {
  rationale?: string;
  contributions?: Record<string, string>;
  deepProfile?: DeepProfile;
}

// Sentences worth turning into a bullet must end with ., !, or ? and have
// an uppercase start on the next sentence. Keeps the split conservative so
// we don't break mid-sentence on numeric abbreviations.
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z])/;

function splitRationale(rationale: string): string[] {
  return rationale
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Formats an hour as HH:00 (24h). Matches the rest of the app's convention.
function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// Numeric callouts derived from the DeepProfile. Only surfaces signals that
// are clearly meaningful (e.g. format lift >1.5x, a distinct best slot).
// Returns an empty array when nothing crosses the threshold.
function deepProfileCallouts(profile: DeepProfile): string[] {
  const callouts: string[] = [];

  const topFormat = [...profile.formatPerformance].sort(
    (a, b) => b.liftVsOverall - a.liftVsOverall,
  )[0];
  if (topFormat && topFormat.count > 0 && topFormat.liftVsOverall >= 1.5) {
    const lift = topFormat.liftVsOverall.toFixed(1);
    callouts.push(
      `${topFormat.format} posts reach ${lift}x your overall median, so this one is a ${topFormat.format}.`,
    );
  }

  const bestSlot = profile.timing.bestSlots[0];
  if (bestSlot && profile.medians.reach && profile.medians.reach > 0) {
    const ratio = bestSlot.medianReach / profile.medians.reach;
    if (ratio >= 1.5) {
      const lift = ratio.toFixed(1);
      callouts.push(
        `${bestSlot.day} at ${formatHour(bestSlot.hour)} is your best slot (${lift}x your overall median reach).`,
      );
    }
  }

  return callouts.slice(0, 2);
}

export function WhyThisWorks({ rationale, contributions, deepProfile }: WhyThisWorksProps) {
  const rationaleBullets = rationale ? splitRationale(rationale) : [];
  const contributionEntries = contributions ? Object.entries(contributions) : [];
  const deepCallouts = deepProfile ? deepProfileCallouts(deepProfile) : [];

  const hasAnything =
    rationaleBullets.length > 0 || contributionEntries.length > 0 || deepCallouts.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-white">
      <p className="mb-2 inline-flex items-center gap-1.5 font-semibold text-emerald-300">
        <Sparkles className="h-3.5 w-3.5" />
        Why this works
      </p>
      <ul className="list-disc space-y-1.5 pl-4 text-white/90">
        {rationaleBullets.map((sentence, i) => (
          <li key={`r-${i}`}>{sentence}</li>
        ))}
        {contributionEntries.map(([type, text]) => (
          <li key={type}>{text}</li>
        ))}
        {deepCallouts.map((text, i) => (
          <li key={`d-${i}`} className="text-emerald-200/90">
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
