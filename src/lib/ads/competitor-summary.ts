// src/lib/ads/competitor-summary.ts
// Distil competitor intel into a concise, prompt-friendly string (<=800 chars)
// for the ad-copy / advice generators. Shared by /api/ads/generate and
// /api/ads/advice. (/api/ads/copy keeps a slightly richer local variant that
// also folds in competitor hashtags — intentionally left distinct.)
import type { CompetitorIntel } from '@/lib/brain/competitor-intel';

export function summarizeCompetitorIntel(intel: CompetitorIntel | null): string | null {
  if (!intel || intel.competitorCount === 0 || intel.sampleSize === 0) return null;
  const parts: string[] = [];
  parts.push(`${intel.competitorCount} competitors, ${intel.sampleSize} top posts analyzed.`);
  if (intel.topHookPatterns.length > 0) {
    parts.push(`Their best hooks lean: ${intel.topHookPatterns.map((h) => h.pattern).slice(0, 3).join(', ')}.`);
  }
  if (intel.topPosts.length > 0) {
    const hooks = intel.topPosts.slice(0, 3).map((p) => `"${p.hook.slice(0, 70)}"`).join(' / ');
    parts.push(`Top competitor hooks: ${hooks}.`);
  }
  return parts.join(' ').slice(0, 800);
}
