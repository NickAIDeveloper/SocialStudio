'use client';

import { useState, useEffect } from 'react';
import { type MetricKey, type IgMediaItem } from '@/lib/meta/ig-analytics';
import { type PostSummary, formatNumber, FormatBadge } from './shared';

interface HeroAnalysis {
  verdict?: string;
  suggestion?: string;
  makeMorePrompt?: string;
}

export function HeroCard({
  posts,
  medians,
  allMedia,
}: {
  posts: PostSummary[];
  medians: Record<MetricKey, number | null>;
  allMedia: IgMediaItem[];
}) {
  const [loading, setLoading] = useState(true);
  const [top, setTop] = useState<PostSummary | null>(null);
  const [analysis, setAnalysis] = useState<HeroAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch on mount. The API is cached upstream (future: add key-by-top-id
  // memoization client-side too) but a single call on page load is cheap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/meta/instagram/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'hero', posts, medians }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setTop(json.data?.top ?? null);
        setAnalysis((json.data?.analysis as HeroAnalysis) ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topMedia = top ? allMedia.find((m) => m.id === top.id) : null;
  const thumb = topMedia?.thumbnail_url ?? topMedia?.media_url;

  return (
    <div className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-fuchsia-500/5 to-sky-500/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-amber-300/80">What&apos;s working</span>
          {loading && <span className="text-[11px] text-white/50">· analyzing…</span>}
        </div>
      </div>
      {error && <div className="text-xs text-rose-300/80">{error}</div>}
      {top && (
        <div className="flex gap-4">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-20 w-20 rounded-lg object-cover border border-white/10" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-medium line-clamp-2">
              {top.caption?.slice(0, 120) || '(no caption)'}
            </div>
            <div className="text-[11px] text-white/50 mt-1">
              <FormatBadge format={top.format} /> · reach{' '}
              <span className="text-emerald-300 font-semibold">
                {formatNumber(top.reach ?? undefined)}
              </span>
              {medians.reach && top.reach && (
                <span className="ml-1">({(top.reach / medians.reach).toFixed(1)}× median)</span>
              )}
            </div>
            {analysis?.verdict && (
              <p className="text-sm text-white/90 mt-2 leading-snug">{analysis.verdict}</p>
            )}
            {analysis?.suggestion && (
              <p className="text-xs text-amber-200/80 mt-1">
                <span className="font-semibold">Next: </span>
                {analysis.suggestion}
              </p>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            {analysis?.makeMorePrompt && (
              <a
                href={`/smart-posts?preset=${encodeURIComponent(analysis.makeMorePrompt)}`}
                className="whitespace-nowrap rounded-lg bg-gradient-to-r from-fuchsia-500 to-amber-500 px-3 py-2 text-xs font-medium text-white hover:opacity-90"
              >
                Make more like this
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
