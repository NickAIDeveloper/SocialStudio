import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainSignals } from '@/lib/db/schema';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import type { CompetitorIntel } from '@/lib/brain/competitor-intel';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface SignalsRow {
  computedAt: Date;
  topFormat: string | null;
  topSlotDow: number | null;
  topSlotHour: number | null;
  hookPatterns: unknown;
  ctaPatterns: unknown;
  captionShape: unknown;
  topicClusters: unknown;
  rawKpis: unknown;
}

interface HookPattern { pattern: string; sampleSize: number; medianReach?: number }
interface CaptionShape { avgLines?: number; avgParagraphs?: number; hashtagCountP50?: number; emojiDensity?: string }
interface RawKpis { totalPosts?: number; totalReach?: number; medianReach?: number }
interface TopicCluster { topic: string; sampleSize: number; medianEngagement?: number }

const cache = new Map<string, { narrative: string; bullets: string[]; lastAnalysisAt: string }>();

function topOf<T extends { sampleSize?: number }>(raw: unknown): T | null {
  if (!Array.isArray(raw)) return null;
  const list = raw as T[];
  if (list.length === 0) return null;
  return [...list].sort((a, b) => (b.sampleSize ?? 0) - (a.sampleSize ?? 0))[0];
}

function fmtSlot(dow: number | null, hour: number | null): string | null {
  if (dow === null || hour === null) return null;
  const day = DAY_NAMES[dow] ?? '?';
  const period = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} ${h12}${period}`;
}

function buildDiff(prev: SignalsRow | null, curr: SignalsRow, ci: CompetitorIntel | null) {
  const prevHook = prev ? topOf<HookPattern>(prev.hookPatterns)?.pattern : null;
  const currHook = topOf<HookPattern>(curr.hookPatterns)?.pattern ?? null;

  const prevShape = (prev?.captionShape as CaptionShape | null) ?? null;
  const currShape = (curr.captionShape as CaptionShape | null) ?? null;

  const prevKpis = (prev?.rawKpis as RawKpis | null) ?? null;
  const currKpis = (curr.rawKpis as RawKpis | null) ?? null;

  const prevTopic = prev ? topOf<TopicCluster>(prev.topicClusters)?.topic : null;
  const currTopic = topOf<TopicCluster>(curr.topicClusters)?.topic ?? null;

  return {
    isFirstRun: prev === null,
    format: { prev: prev?.topFormat ?? null, curr: curr.topFormat ?? null },
    slot: { prev: fmtSlot(prev?.topSlotDow ?? null, prev?.topSlotHour ?? null), curr: fmtSlot(curr.topSlotDow, curr.topSlotHour) },
    topHook: { prev: prevHook, curr: currHook },
    captionLines: { prev: prevShape?.avgLines ?? null, curr: currShape?.avgLines ?? null },
    hashtagCount: { prev: prevShape?.hashtagCountP50 ?? null, curr: currShape?.hashtagCountP50 ?? null },
    emojiDensity: { prev: prevShape?.emojiDensity ?? null, curr: currShape?.emojiDensity ?? null },
    medianReach: { prev: prevKpis?.medianReach ?? null, curr: currKpis?.medianReach ?? null },
    totalPosts: { prev: prevKpis?.totalPosts ?? null, curr: currKpis?.totalPosts ?? null },
    topTopic: { prev: prevTopic, curr: currTopic },
    competitorTopHashtags: ci?.topHashtags.slice(0, 3).map((h) => ({ tag: h.tag, avgEng: h.avgEngagement })) ?? [],
    competitorTopHook: ci?.topHookPatterns[0]?.pattern ?? null,
    competitorTopSlot: ci?.topPostingSlots[0] ? `${ci.topPostingSlots[0].day.slice(0, 3)} ${ci.topPostingSlots[0].hour}h` : null,
  };
}

const SYSTEM_PROMPT =
  'You write a tight changelog-style summary for an Instagram autopilot. Plain English, no jargon, no markdown, no emojis. Cite numbers. ' +
  'Reply ONLY with valid JSON matching the schema. The "narrative" is 2 to 3 short sentences explaining what changed since the last analysis and what autopilot will do differently because of it. ' +
  'The "bullets" are 2 to 4 ultra-short action items (max 10 words each) the user can scan in one second.';

function buildPrompt(diff: ReturnType<typeof buildDiff>): string {
  if (diff.isFirstRun) {
    return [
      'This is the brain\'s FIRST analysis for this brand. No previous data to diff against.',
      '',
      'CURRENT_STATE_JSON:',
      JSON.stringify(diff, null, 2),
      '',
      'Output JSON: { "narrative": "...", "bullets": ["...", "..."] }.',
      'Narrative: 2-3 sentences saying it\'s the first analysis, what was found, and what autopilot will start doing.',
      'Bullets: 2-3 action items autopilot will start with.',
    ].join('\n');
  }
  return [
    'Compare the previous analysis to the current one. Identify the meaningful CHANGES — what shifted, what got stronger or weaker, what competitor patterns are now in play.',
    '',
    'DIFF_JSON:',
    JSON.stringify(diff, null, 2),
    '',
    'Output JSON: { "narrative": "...", "bullets": ["...", "..."] }.',
    'Narrative: 2-3 sentences. First sentence: what the brain discovered or what changed. Second sentence: what autopilot will do differently as a result. Optional third sentence if there\'s a competitor borrow worth flagging.',
    'Bullets: 2-4 short action items, each under 10 words. Examples: "Switched best slot to Wed 8am", "Borrowing #saam from competitors", "Tightening captions to 6 lines".',
    'If nothing meaningful changed, narrative should say so plainly and bullets can be empty.',
  ].join('\n');
}

function stripFences(s: string): string {
  const m = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return m ? m[1].trim() : s.trim();
}

export interface BrainNarrative {
  narrative: string;
  bullets: string[];
  lastAnalysisAt: string;
}

export async function buildBrainNarrative(args: {
  brandId: string;
  briefVersion: number;
  competitorIntel: CompetitorIntel | null;
}): Promise<BrainNarrative | null> {
  const cacheKey = `${args.brandId}:${args.briefVersion}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (!isCerebrasAvailable()) return null;

  const rows = await db
    .select({
      computedAt: brainSignals.computedAt,
      topFormat: brainSignals.topFormat,
      topSlotDow: brainSignals.topSlotDow,
      topSlotHour: brainSignals.topSlotHour,
      hookPatterns: brainSignals.hookPatterns,
      ctaPatterns: brainSignals.ctaPatterns,
      captionShape: brainSignals.captionShape,
      topicClusters: brainSignals.topicClusters,
      rawKpis: brainSignals.rawKpis,
    })
    .from(brainSignals)
    .where(and(eq(brainSignals.brandId, args.brandId), eq(brainSignals.windowDays, 28)))
    .orderBy(desc(brainSignals.computedAt))
    .limit(2);

  if (rows.length === 0) return null;
  const [curr, prev] = rows;
  const diff = buildDiff(prev ?? null, curr, args.competitorIntel);

  let raw: string;
  try {
    raw = await cerebrasChatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(diff) },
      ],
      { temperature: 0.3, maxTokens: 350, responseFormat: 'json' },
    );
  } catch (err) {
    console.warn('[autopilot/narrative] cerebras call failed:', err instanceof Error ? err.message : err);
    return null;
  }

  let parsed: { narrative?: unknown; bullets?: unknown };
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    console.warn('[autopilot/narrative] could not parse LLM output:', raw.slice(0, 200));
    return null;
  }

  const narrative = typeof parsed.narrative === 'string' ? parsed.narrative.trim() : '';
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.filter((b): b is string => typeof b === 'string' && b.trim().length > 0).map((b) => b.trim()).slice(0, 4)
    : [];

  if (!narrative) return null;

  const out: BrainNarrative = {
    narrative,
    bullets,
    lastAnalysisAt: curr.computedAt.toISOString(),
  };
  cache.set(cacheKey, out);
  return out;
}
