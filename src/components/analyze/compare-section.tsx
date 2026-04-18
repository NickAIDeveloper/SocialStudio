'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';

interface Competitor {
  id: string;
  handle: string;
  postCount: number | null;
}

interface Stat {
  medianLikes: number | null;
  videoCount: number;
  imageCount: number;
  topVideoLikes: number | null;
  topImageLikes: number | null;
  sweetSpot: { range: string; samples: number } | null;
  sampleSize: number;
}

interface CompareResponse {
  you: Stat | null;
  competitor: Stat | null;
  competitorHandle: string | null;
  youHandle: string | null;
}

interface CompareRow {
  label: string;
  you: string | null;
  competitor: string | null;
}

function formatMix(stat: Stat | null): string | null {
  if (!stat) return null;
  const total = stat.videoCount + stat.imageCount;
  if (total === 0) return null;
  const topFormat =
    stat.videoCount >= stat.imageCount
      ? `video · top ${stat.topVideoLikes ?? 0} likes`
      : `image · top ${stat.topImageLikes ?? 0} likes`;
  return `${stat.videoCount} video / ${stat.imageCount} image — best: ${topFormat}`;
}

function rowsFromStats(
  you: Stat | null,
  competitor: Stat | null,
): CompareRow[] {
  return [
    {
      label: 'Median engagement (likes)',
      you: you?.medianLikes != null ? String(you.medianLikes) : null,
      competitor: competitor?.medianLikes != null ? String(competitor.medianLikes) : null,
    },
    {
      label: 'Format mix',
      you: formatMix(you),
      competitor: formatMix(competitor),
    },
    {
      label: 'Caption length sweet spot',
      you: you?.sweetSpot ? `${you.sweetSpot.range} (${you.sweetSpot.samples} top posts)` : null,
      competitor: competitor?.sweetSpot
        ? `${competitor.sweetSpot.range} (${competitor.sweetSpot.samples} top posts)`
        : null,
    },
  ];
}

export function CompareSection() {
  const searchParams = useSearchParams();
  const brandId = searchParams.get('brand');

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CompareResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/competitors')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { competitors?: Competitor[] } | null) => {
        const rows = data?.competitors ?? [];
        setCompetitors(rows);
        if (rows[0]) setSelected(rows[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Refetch compare stats whenever the selected competitor or the brand
  // context changes. We intentionally key on both so switching brands in the
  // URL updates the "you" side as well.
  useEffect(() => {
    if (!selected) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    const params = new URLSearchParams({ competitorId: selected });
    if (brandId) params.set('brandId', brandId);
    fetch(`/api/analyze/compare?${params.toString()}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setStatsError((json as { error?: string }).error ?? 'Failed to load compare data');
          setStats(null);
          return;
        }
        setStats(json as CompareResponse);
      })
      .catch((err) => {
        if (!cancelled) setStatsError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, brandId]);

  const selectedComp = competitors.find((c) => c.id === selected) ?? null;
  const sample = stats?.competitor?.sampleSize ?? selectedComp?.postCount ?? 0;
  const rows = rowsFromStats(stats?.you ?? null, stats?.competitor ?? null);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-10 text-center text-sm text-white">
        Loading competitors…
      </div>
    );
  }

  if (competitors.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-10 text-center text-sm text-white">
        Add a competitor on the Competitors tab to compare side by side.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-4">
        <label htmlFor="compare-competitor" className="text-sm text-white">Compare with</label>
        <select
          id="compare-competitor"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
        >
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>@{c.handle}</option>
          ))}
        </select>
        {statsLoading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
            <Loader2 className="h-3 w-3 animate-spin" /> Crunching numbers…
          </span>
        )}
      </div>

      {statsError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {statsError}
        </div>
      )}

      {selectedComp && sample > 0 && sample < 10 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertCircle className="h-3.5 w-3.5" />
          We have {sample} posts from @{selectedComp.handle}. Comparisons may be noisy.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/30">
        <div className="grid grid-cols-3 gap-4 border-b border-zinc-800/60 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <span>Metric</span>
          <span>{stats?.youHandle ? `@${stats.youHandle}` : 'Your account'}</span>
          <span>{selectedComp ? `@${selectedComp.handle}` : 'Competitor'}</span>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-3 gap-4 border-b border-zinc-800/40 px-4 py-4 text-sm last:border-0">
            <span className="font-medium text-white">{row.label}</span>
            <span className={row.you ? 'text-white' : 'text-zinc-500 italic'}>
              {row.you ?? '— no data'}
            </span>
            <span className={row.competitor ? 'text-white' : 'text-zinc-500 italic'}>
              {row.competitor ?? '— no data'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
