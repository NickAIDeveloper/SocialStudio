import {
  computeFormatPerformance,
  computeHeatmap,
  normalizeFormat,
  type IgMediaItem,
} from '@/lib/meta/ig-analytics';
import type {
  CaptionShape,
  CompetitorSummary,
  EmojiDensity,
  HookPattern,
  IgFormat,
  TopicCluster,
} from './types';

export interface ComputeSignalsInput {
  windowDays: 7 | 14 | 28;
  ig: { media: IgMediaItem[]; insightsByMediaId: Record<string, unknown> } | null;
  ads: { hasCampaigns: boolean; insights: unknown } | null;
  competitors: { handle: string; followerCount: number | null; postCount: number | null }[];
}

export interface ComputeSignalsOutput {
  windowDays: number;
  topFormat: IgFormat | null;
  topSlotDow: number | null;
  topSlotHour: number | null;
  hookPatterns: HookPattern[];
  ctaPatterns: { pattern: string; sampleSize: number }[];
  captionShape: CaptionShape;
  topicClusters: TopicCluster[];
  competitorSummary: CompetitorSummary;
  adSummary: { hasCampaigns: boolean } | null;
  rawKpis: { totalPosts: number; totalReach: number; medianReach: number };
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function emojiDensity(captions: string[]): EmojiDensity {
  if (captions.length === 0) return 'low';
  const total = captions.reduce((acc, c) => acc + (c.match(EMOJI_RE)?.length ?? 0), 0);
  const perCaption = total / captions.length;
  if (perCaption < 1) return 'low';
  if (perCaption < 3) return 'medium';
  return 'high';
}

function captionShape(captions: string[]): CaptionShape {
  if (captions.length === 0) {
    return { avgLines: 0, avgParagraphs: 0, emojiDensity: 'low', hookToBodyRatio: 0 };
  }
  let lines = 0;
  let paragraphs = 0;
  let hookToBody = 0;
  for (const c of captions) {
    const ls = c.split('\n');
    lines += ls.length;
    paragraphs += c.split(/\n\s*\n/).length;
    const firstLine = ls[0]?.length ?? 0;
    const rest = c.length - firstLine;
    hookToBody += rest > 0 ? firstLine / rest : 1;
  }
  return {
    avgLines: +(lines / captions.length).toFixed(1),
    avgParagraphs: +(paragraphs / captions.length).toFixed(1),
    emojiDensity: emojiDensity(captions),
    hookToBodyRatio: +(hookToBody / captions.length).toFixed(2),
  };
}

function topHookPatterns(captions: string[]): HookPattern[] {
  // v1: bucket by first-line shape (question | stat | imperative | other).
  const buckets: Record<string, string[]> = {};
  for (const c of captions) {
    const first = c.split('\n')[0] ?? '';
    let key = 'other';
    if (/\?$/.test(first)) key = 'question';
    else if (/\b\d+(\.\d+)?\b/.test(first)) key = 'stat';
    else if (/^(stop|start|try|do|don't|never|always)\b/i.test(first)) key = 'imperative';
    (buckets[key] ??= []).push(first);
  }
  return Object.entries(buckets).map(([pattern, lines]) => ({
    pattern,
    sampleSize: lines.length,
    medianReach: 0,
  }));
}

function ctaPatterns(captions: string[]): { pattern: string; sampleSize: number }[] {
  const phrases = [
    'link in bio',
    'comment below',
    'tag a friend',
    'save this',
    'share this',
    'try it',
    'sign up',
  ];
  const out: { pattern: string; sampleSize: number }[] = [];
  for (const phrase of phrases) {
    const re = new RegExp(phrase, 'i');
    const count = captions.filter((c) => re.test(c)).length;
    if (count > 0) out.push({ pattern: phrase, sampleSize: count });
  }
  return out;
}

export function computeSignals(input: ComputeSignalsInput): ComputeSignalsOutput {
  const ig = input.ig;
  const captions = ig ? ig.media.map((m) => m.caption ?? '').filter(Boolean) : [];
  const formatStats = ig ? computeFormatPerformance(ig.media) : [];
  const heat = ig ? computeHeatmap(ig.media) : null;

  const topFormat: IgFormat | null = formatStats[0]?.sampleSize
    ? (formatStats[0].format as IgFormat)
    : ig?.media[0]
      ? (normalizeFormat(ig.media[0]) as IgFormat)
      : null;

  const topSlot = heat?.topSlots?.[0];

  const totalReach = ig
    ? ig.media.reduce((acc, m) => acc + (m.like_count ?? 0), 0)
    : 0;

  return {
    windowDays: input.windowDays,
    topFormat,
    topSlotDow: topSlot?.day ?? null,
    topSlotHour: topSlot?.hour ?? null,
    hookPatterns: topHookPatterns(captions),
    ctaPatterns: ctaPatterns(captions),
    captionShape: captionShape(captions),
    topicClusters: [], // v1: not implemented; subsystem #4.
    competitorSummary: {
      totalCompetitors: input.competitors.length,
      followerGrowthMedian: null,
      postsPerWeekMedian: null,
    },
    adSummary: input.ads ? { hasCampaigns: input.ads.hasCampaigns } : null,
    rawKpis: {
      totalPosts: ig?.media.length ?? 0,
      totalReach,
      medianReach: 0,
    },
  };
}
