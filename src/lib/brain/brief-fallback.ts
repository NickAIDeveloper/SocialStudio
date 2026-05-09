import type { ComputeSignalsOutput } from './compute-signals';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildFallbackBrief(s: ComputeSignalsOutput): string {
  const day = s.topSlotDow !== null ? DAY_NAMES[s.topSlotDow] : '—';
  const hour = s.topSlotHour ?? '—';
  const fmt = s.topFormat ?? 'REEL';
  const shape = s.captionShape;

  return `## What's working
- ${s.rawKpis.totalPosts} posts captured in the last ${s.windowDays} days

## What's not working
- —

## Formula for the next 7 days
- **Format:** ${fmt}
- **Best slot:** ${day}, ${hour}
- **Hook patterns:** —
- **CTA pattern:** —
- **Caption shape:** ${shape.avgLines} lines, ${shape.avgParagraphs} paragraphs, emoji density: ${shape.emojiDensity}

## Topics to lean into
- —

## Topics to drop
- —

## Competitor watch
- ${s.competitorSummary.totalCompetitors} competitors tracked`;
}
