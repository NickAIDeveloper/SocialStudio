// src/lib/brain/caption-format.ts
import type { IgMediaItem } from '@/lib/meta/ig-analytics';
import { getMetric } from '@/lib/meta/ig-analytics';
import type { EmojiDensity } from './types';

export interface CaptionFormat {
  // Existing fields (back-compat with brain v1 captionShape)
  avgLines: number;
  avgParagraphs: number;
  emojiDensity: EmojiDensity;
  hookToBodyRatio: number;
  // New richer fields
  hookWordCountP50: number;
  hookWordCountP90: number;
  paragraphLengthsP50: number[];        // median paragraph char-lengths (up to 5)
  emojiPosition: 'opener' | 'closer' | 'sprinkled' | 'none';
  ctaTerminalPhrases: string[];          // top 3 closing phrases observed
  hashtagCountP50: number;
  hashtagCountP90: number;
  questionCountAvg: number;
  listMarkers: 'numbered' | 'bulleted' | 'none';
  // Provenance
  sampleSize: number;
  sourceWindow: 'top_25pct_by_reach' | 'all_posts_fallback';
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const QUESTION_RE = /\?/g;
const NUMBERED_LIST_RE = /^\s*\d+[.)]\s+/m;
const BULLET_RE = /^\s*[•·\-*]\s+/m;
const CTA_PHRASES = [
  'link in bio', 'comment below', 'tag a friend', 'save this',
  'share this', 'try it', 'sign up', 'follow for more',
  'drop a', 'let me know', 'what do you think',
];

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function emojiDensityFor(captions: string[]): EmojiDensity {
  if (captions.length === 0) return 'low';
  const total = captions.reduce((acc, c) => acc + (c.match(EMOJI_RE)?.length ?? 0), 0);
  const per = total / captions.length;
  if (per < 1) return 'low';
  if (per < 3) return 'medium';
  return 'high';
}

function detectEmojiPosition(captions: string[]): CaptionFormat['emojiPosition'] {
  if (captions.length === 0) return 'none';
  let opener = 0, closer = 0, sprinkled = 0, none = 0;
  for (const c of captions) {
    const trimmed = c.trim();
    if (trimmed.length === 0) { none++; continue; }
    const matches = [...trimmed.matchAll(EMOJI_RE)];
    if (matches.length === 0) { none++; continue; }
    const firstIdx = matches[0].index ?? 0;
    const lastIdx = matches[matches.length - 1].index ?? 0;
    const isOpener = firstIdx < trimmed.length * 0.15;
    const isCloser = lastIdx > trimmed.length * 0.85;
    if (isOpener && !isCloser) opener++;
    else if (isCloser && !isOpener) closer++;
    else sprinkled++;
  }
  const max = Math.max(opener, closer, sprinkled, none);
  if (max === none) return 'none';
  if (max === opener) return 'opener';
  if (max === closer) return 'closer';
  return 'sprinkled';
}

function detectListMarkers(captions: string[]): CaptionFormat['listMarkers'] {
  let numbered = 0, bulleted = 0;
  for (const c of captions) {
    if (NUMBERED_LIST_RE.test(c)) numbered++;
    else if (BULLET_RE.test(c)) bulleted++;
  }
  if (numbered > captions.length * 0.4) return 'numbered';
  if (bulleted > captions.length * 0.4) return 'bulleted';
  return 'none';
}

function detectCtaTerminalPhrases(captions: string[]): string[] {
  const counts = new Map<string, number>();
  for (const c of captions) {
    const tail = c.slice(-200).toLowerCase();
    for (const phrase of CTA_PHRASES) {
      if (tail.includes(phrase)) {
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p]) => p);
}

function paragraphLengths(captions: string[]): number[] {
  // For each caption split into paragraphs, collect lengths of paragraph N
  // (positionally), then take median across captions for each position up to 5.
  const positional: number[][] = [[], [], [], [], []];
  for (const c of captions) {
    const paras = c.split(/\n\s*\n/).map((p) => p.length);
    for (let i = 0; i < Math.min(5, paras.length); i++) {
      positional[i].push(paras[i]);
    }
  }
  return positional.map((arr) => Math.round(median(arr)));
}

function hookWordCounts(captions: string[]): number[] {
  return captions.map((c) => {
    const firstLine = c.split('\n')[0] ?? '';
    return firstLine.trim().split(/\s+/).filter(Boolean).length;
  });
}

function selectTopByReach(media: IgMediaItem[]): {
  posts: IgMediaItem[];
  source: CaptionFormat['sourceWindow'];
} {
  const withReach = media
    .map((m) => ({ post: m, reach: getMetric(m, 'reach') ?? 0 }))
    .filter((x) => x.reach > 0);
  if (withReach.length < 5) {
    return { posts: media, source: 'all_posts_fallback' };
  }
  withReach.sort((a, b) => b.reach - a.reach);
  const cutoff = Math.max(5, Math.ceil(withReach.length * 0.25));
  return { posts: withReach.slice(0, cutoff).map((x) => x.post), source: 'top_25pct_by_reach' };
}

export function extractCaptionFormat(media: IgMediaItem[]): CaptionFormat {
  const empty: CaptionFormat = {
    avgLines: 0, avgParagraphs: 0, emojiDensity: 'low', hookToBodyRatio: 0,
    hookWordCountP50: 0, hookWordCountP90: 0,
    paragraphLengthsP50: [],
    emojiPosition: 'none', ctaTerminalPhrases: [],
    hashtagCountP50: 0, hashtagCountP90: 0,
    questionCountAvg: 0, listMarkers: 'none',
    sampleSize: 0, sourceWindow: 'all_posts_fallback',
  };
  if (media.length === 0) return empty;

  const { posts, source } = selectTopByReach(media);
  const captions = posts.map((m) => m.caption ?? '').filter(Boolean);
  if (captions.length === 0) return { ...empty, sampleSize: 0, sourceWindow: source };

  const lineCounts = captions.map((c) => c.split('\n').length);
  const paraCounts = captions.map((c) => c.split(/\n\s*\n/).length);
  const hookWords = hookWordCounts(captions);
  const hashtagCounts = captions.map((c) => (c.match(HASHTAG_RE) ?? []).length);
  const questionCounts = captions.map((c) => (c.match(QUESTION_RE) ?? []).length);

  const hookToBodyTotal = captions.reduce((acc, c) => {
    const lines = c.split('\n');
    const first = lines[0]?.length ?? 0;
    const rest = c.length - first;
    return acc + (rest > 0 ? first / rest : 1);
  }, 0);

  return {
    avgLines: +(lineCounts.reduce((a, b) => a + b, 0) / captions.length).toFixed(1),
    avgParagraphs: +(paraCounts.reduce((a, b) => a + b, 0) / captions.length).toFixed(1),
    emojiDensity: emojiDensityFor(captions),
    hookToBodyRatio: +(hookToBodyTotal / captions.length).toFixed(2),
    hookWordCountP50: percentile(hookWords, 0.5),
    hookWordCountP90: percentile(hookWords, 0.9),
    paragraphLengthsP50: paragraphLengths(captions),
    emojiPosition: detectEmojiPosition(captions),
    ctaTerminalPhrases: detectCtaTerminalPhrases(captions),
    hashtagCountP50: percentile(hashtagCounts, 0.5),
    hashtagCountP90: percentile(hashtagCounts, 0.9),
    questionCountAvg: +(questionCounts.reduce((a, b) => a + b, 0) / captions.length).toFixed(1),
    listMarkers: detectListMarkers(captions),
    sampleSize: captions.length,
    sourceWindow: source,
  };
}
