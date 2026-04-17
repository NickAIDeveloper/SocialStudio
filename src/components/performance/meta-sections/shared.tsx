'use client';

// ── Shared types and helpers for meta-sections ───────────────────────────────
// Types and small utilities that are referenced by more than one extracted
// section component. Keep this file lean — only put things here that are
// genuinely shared; component-exclusive helpers live in their own file.

import { type MetricKey } from '@/lib/meta/ig-analytics';

export type { MetricKey };

// PostSummary is consumed by HeroCard, CaptionPatterns, PostAutopsy, and
// InstagramSection (which also calls buildPostSummary).
export interface PostSummary {
  id: string;
  caption?: string;
  mediaType: string;
  format: 'REEL' | 'CAROUSEL' | 'IMAGE';
  timestamp?: string;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
}

// ── Formatters ───────────────────────────────────────────────────────────────
// Meta returns numeric fields as strings. We parse + format defensively.
// Shared because HeroCard, FormatStrip, InstagramSection, etc. all need them.

export function formatNumber(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

// ── FormatBadge ───────────────────────────────────────────────────────────────
// Shared by InstagramSection (via IgInsightsPanel table), HeroCard, and
// FormatStrip. Kept here to avoid duplication.

export function FormatBadge({ format }: { format: 'REEL' | 'CAROUSEL' | 'IMAGE' }) {
  const style =
    format === 'REEL'
      ? 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30'
      : format === 'CAROUSEL'
        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
        : 'bg-white/10 text-white/70 border-white/15';
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${style}`}>
      {format}
    </span>
  );
}
