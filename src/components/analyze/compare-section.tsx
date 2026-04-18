'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface Competitor {
  id: string;
  handle: string;
  postCount: number | null;
}

interface CompareRow {
  label: string;
  you: string | null;
  competitor: string | null;
}

// Minimal Compare view. Pulls competitors from /api/competitors and renders
// three side-by-side KPI rows. Each row renders a dashed placeholder when
// either side has no data. If competitor sample size < 10 we warn.
export function CompareSection() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);

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

  const selectedComp = competitors.find((c) => c.id === selected) ?? null;
  const sample = selectedComp?.postCount ?? 0;

  // Rows are placeholders until the data fetch for per-post reach, format
  // mix, and caption length is wired through on a follow-up pass. Structure
  // matches the spec so a reader understands what each column represents.
  const rows: CompareRow[] = [
    { label: 'Median reach', you: null, competitor: null },
    { label: 'Format mix', you: null, competitor: null },
    { label: 'Caption length sweet spot', you: null, competitor: null },
  ];

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
      </div>

      {selectedComp && sample > 0 && sample < 10 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertCircle className="h-3.5 w-3.5" />
          We have {sample} posts from @{selectedComp.handle}. Comparisons may be noisy.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/30">
        <div className="grid grid-cols-3 gap-4 border-b border-zinc-800/60 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <span>Metric</span>
          <span>Your account</span>
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
