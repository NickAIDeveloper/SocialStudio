'use client';

import { useEffect, useState } from 'react';

interface Row {
  value: string; n: number;
  meanReward: number | null; shrunkScore: number | null;
  borrowed: boolean; confident: boolean;
}
interface Dimension { dimension: string; ingredients: Row[] }

export default function GenomePage() {
  const [surface, setSurface] = useState<'ads' | 'organic'>('organic');
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/creative/genome?surface=${surface}`);
        const json = await res.json();
        if (!cancelled) setDimensions(json.dimensions ?? []);
      } catch {
        if (!cancelled) setDimensions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [surface]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-(--txt)">Creative genome</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Which ingredients earn attention. Scores are shrunk toward the average in
          proportion to how little data backs them, so a single lucky post cannot
          look like a proven winner.
        </p>
      </div>

      <div className="flex gap-2">
        {(['organic', 'ads'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSurface(s)}
            className={`rounded-full border px-3 py-1 text-xs ${
              surface === s
                ? 'border-(--violet-24) bg-(--violet-08) text-(--violet-bright)'
                : 'border-(--line-strong) text-(--muted)'
            }`}
          >
            {s === 'organic' ? 'Instagram posts' : 'Ads'}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-(--muted)">Loading…</p>}

      {!loading && dimensions.length === 0 && (
        <p className="text-sm text-(--muted)">
          Nothing recorded yet. Ingredients appear here once creatives have been
          generated with the genome enabled.
        </p>
      )}

      {dimensions.map(d => (
        <div key={d.dimension} className="overflow-hidden rounded-2xl border border-(--line) bg-(--surface)">
          <div className="border-b border-(--line) px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--muted)">
            {d.dimension.replace(/_/g, ' ')}
          </div>
          {d.ingredients.map(i => (
            <div key={i.value} className="grid grid-cols-4 gap-4 border-b border-(--line) px-4 py-3 text-sm last:border-0">
              <span className="font-medium text-(--txt)">{i.value.replace(/_/g, ' ')}</span>
              <span className="text-(--muted)">{i.n} {i.n === 1 ? 'use' : 'uses'}</span>
              <span className={i.confident ? 'text-(--txt)' : 'text-(--muted-2) italic'}>
                {i.shrunkScore != null ? i.shrunkScore.toFixed(3) : '— no data'}
                {!i.confident && i.n > 0 && ' (too few to trust)'}
              </span>
              <span className="text-xs text-(--muted)">
                {i.borrowed ? 'prior borrowed from Instagram' : ''}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
