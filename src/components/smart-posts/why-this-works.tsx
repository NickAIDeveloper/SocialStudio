'use client';

// Task 10 stub. Task 11 replaces this with the real, styled panel.
// Keep the prop surface stable so Task 11 can swap the implementation without
// touching smart-posts-dashboard.tsx.

import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export interface WhyThisWorksProps {
  rationale?: string;
  contributions?: Record<string, string>;
  deepProfile?: DeepProfile;
}

export function WhyThisWorks({ rationale, contributions, deepProfile }: WhyThisWorksProps) {
  const contributionEntries = contributions ? Object.entries(contributions) : [];
  const hasAnything =
    Boolean(rationale) || contributionEntries.length > 0 || Boolean(deepProfile);

  if (!hasAnything) return null;

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3 text-xs text-white">
      <p className="mb-2 font-semibold text-white">Why this works</p>
      <ul className="list-disc space-y-1 pl-4">
        {rationale && <li>{rationale}</li>}
        {contributionEntries.map(([type, text]) => (
          <li key={type}>
            <span className="text-white/60">{type}:</span> {text}
          </li>
        ))}
        {deepProfile && (
          <li className="text-white/60">
            Deep profile for @{deepProfile.handle} ({deepProfile.sampleSize} posts).
          </li>
        )}
      </ul>
    </div>
  );
}
