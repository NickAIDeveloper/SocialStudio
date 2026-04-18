'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface IgInsightRow {
  name: string;
  values?: Array<{ value: number | Record<string, number> }>;
  total_value?: { value: number };
}

interface IgMediaItem {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  insights?: IgInsightRow[];
}

interface InsightsResponse {
  data?: { media?: IgMediaItem[] };
  error?: string;
}

interface Performer {
  id: string;
  thumb: string | null;
  caption: string;
  reach: number;
}

// Reach lives in the per-media insights array. Prefer total_value.value when
// present; fall back to the first `values` entry for older response shapes.
function extractReach(media: IgMediaItem): number {
  const row = media.insights?.find((r) => r.name === 'reach');
  if (!row) return 0;
  if (row.total_value && typeof row.total_value.value === 'number') return row.total_value.value;
  const first = row.values?.[0]?.value;
  return typeof first === 'number' ? first : 0;
}

function formatReach(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TopPerformersStrip({ igUserId }: { igUserId: string }) {
  const [performers, setPerformers] = useState<Performer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/meta/instagram/insights?igUserId=${encodeURIComponent(igUserId)}`,
        );
        const json = (await res.json().catch(() => ({}))) as InsightsResponse;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? 'Failed to load Instagram insights');
          setPerformers([]);
          return;
        }
        const media = json.data?.media ?? [];
        const ranked = media
          .map<Performer>((m) => ({
            id: m.id,
            thumb: m.thumbnail_url ?? m.media_url ?? null,
            caption: m.caption ?? '',
            reach: extractReach(m),
          }))
          .filter((p) => p.reach > 0)
          .sort((a, b) => b.reach - a.reach)
          .slice(0, 3);
        setPerformers(ranked);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [igUserId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 text-xs text-white/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading top performers…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-200">
        Couldn&apos;t load top performers: {error}
      </div>
    );
  }

  if (!performers || performers.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="px-1 text-sm font-semibold text-white">Top performers</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {performers.map((p) => (
          <article
            key={p.id}
            className="flex flex-col overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/50"
          >
            {p.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.thumb}
                alt=""
                className="h-32 w-full object-cover"
              />
            ) : (
              <div className="flex h-32 w-full items-center justify-center bg-zinc-950 text-xs text-white/40">
                No thumbnail
              </div>
            )}
            <div className="flex flex-1 flex-col gap-2 p-3">
              <p className="line-clamp-2 text-xs text-white/80">
                {p.caption.slice(0, 140) || '(no caption)'}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-emerald-300">
                Reach {formatReach(p.reach)}
              </p>
              <Link
                href={`/smart-posts?source=meta&ig=${encodeURIComponent(igUserId)}&likeOf=${encodeURIComponent(p.id)}`}
                className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate one like this
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
