import {
  computeFormatPerformance,
  computeHeatmap,
  normalizeFormat,
  type IgMediaItem,
} from '@/lib/meta/ig-analytics';
import { extractCaptionFormat, type CaptionFormat } from './caption-format';
import type {
  CompetitorSummary,
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
  captionShape: CaptionFormat;
  topicClusters: TopicCluster[];
  competitorSummary: CompetitorSummary;
  adSummary: { hasCampaigns: boolean } | null;
  rawKpis: { totalPosts: number; totalReach: number; medianReach: number };
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
  // Defensive: ensure every media item has an `insights` array. The IG-analytics
  // helpers call `post.insights.find` which throws if insights is undefined.
  const safeMedia = ig?.media
    ? ig.media.map((m) => ({ ...m, insights: Array.isArray(m.insights) ? m.insights : [] }))
    : [];
  const captions = safeMedia.map((m) => m.caption ?? '').filter(Boolean);
  const formatStats = safeMedia.length > 0 ? computeFormatPerformance(safeMedia) : [];
  const heat = safeMedia.length > 0 ? computeHeatmap(safeMedia) : null;

  const topFormat: IgFormat | null = formatStats[0]?.sampleSize
    ? (formatStats[0].format as IgFormat)
    : safeMedia[0]
      ? (normalizeFormat(safeMedia[0]) as IgFormat)
      : null;

  const topSlot = heat?.topSlots?.[0];

  const totalReach = safeMedia.reduce((acc, m) => acc + (m.like_count ?? 0), 0);

  return {
    windowDays: input.windowDays,
    topFormat,
    topSlotDow: topSlot?.day ?? null,
    topSlotHour: topSlot?.hour ?? null,
    hookPatterns: topHookPatterns(captions),
    ctaPatterns: ctaPatterns(captions),
    captionShape: extractCaptionFormat(safeMedia),
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
