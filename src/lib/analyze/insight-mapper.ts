import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export interface InsightCardLike {
  id: string;
  title: string;
  verdict: 'positive' | 'negative' | 'opportunity';
  summary: string;
  action?: string;
  priority: number;
  drillDown?: { label: string; lines: string[] };
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function mapDeepProfileToCards(profile: DeepProfile | null): InsightCardLike[] {
  if (!profile) return [];
  const cards: InsightCardLike[] = [];

  const topFormat = [...profile.formatPerformance]
    .filter((f) => f.count > 0)
    .sort((a, b) => b.liftVsOverall - a.liftVsOverall)[0];
  if (topFormat) {
    const lift = topFormat.liftVsOverall.toFixed(1);
    cards.push({
      id: 'best-format',
      title: `${topFormat.format} is your strongest format`,
      verdict: topFormat.liftVsOverall >= 1 ? 'positive' : 'opportunity',
      summary: `${topFormat.format} posts get ${lift}× your overall median reach across ${topFormat.count} samples.`,
      action: `Make more ${topFormat.format.toLowerCase()}s.`,
      priority: 2,
      drillDown: {
        label: 'Format breakdown',
        lines: profile.formatPerformance.map(
          (f) => `${f.format}: ${f.count} posts, ${f.liftVsOverall.toFixed(2)}× lift, median reach ${f.medianReach}`,
        ),
      },
    });
  }

  const len = profile.captionLengthSweetSpot;
  cards.push({
    id: 'caption-length-sweet-spot',
    title: `${len.winner.charAt(0).toUpperCase() + len.winner.slice(1)} captions win for you`,
    verdict: 'opportunity',
    summary: `Your ${len.winner} captions have the highest median reach. Short: ${len.shortMedian}, medium: ${len.mediumMedian}, long: ${len.longMedian}.`,
    action: `Default to ${len.winner}-length captions on the next post.`,
    priority: 3,
  });

  const topSlot = profile.timing.bestSlots[0];
  if (topSlot) {
    cards.push({
      id: 'best-time-slot',
      title: `${topSlot.day} ${formatHour(topSlot.hour)} is your peak`,
      verdict: 'positive',
      summary: `Posts in this slot have median reach ${topSlot.medianReach}. That's your strongest window.`,
      action: 'Schedule next post here.',
      priority: 2,
      drillDown:
        profile.timing.bestSlots.length > 1
          ? {
              label: 'Other strong slots',
              lines: profile.timing.bestSlots
                .slice(1, 5)
                .map((s) => `${s.day} ${formatHour(s.hour)} → median reach ${s.medianReach}`),
            }
          : undefined,
    });
  }

  const topHook = profile.hookPatterns[0];
  if (topHook) {
    cards.push({
      id: 'top-hook',
      title: `Hook pattern that wins: ${topHook.pattern}`,
      verdict: 'positive',
      summary: `${topHook.pattern} hooks get average reach ${Math.round(topHook.avgReach)} across ${topHook.occurrences} posts.`,
      action: 'Open Smart Posts and seed a new post with this hook.',
      priority: 3,
      drillDown:
        topHook.exampleCaptions.length > 0
          ? {
              label: 'Examples',
              lines: topHook.exampleCaptions.slice(0, 3),
            }
          : undefined,
    });
  }

  return cards;
}
