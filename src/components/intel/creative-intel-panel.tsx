'use client';

import { useEffect, useState } from 'react';

interface Stat { value: string; samples: number; meanScore: number; confident: boolean }
interface DimensionBlock { dimension: string; verdict: string; stats: Stat[] }

interface Intel {
  brand: string;
  generations: number;
  withOutcome: number;
  minConfidentSamples: number;
  reach: { recent: Array<{ reach: number; views: number }>; avgReach: number; avgViews: number };
  dimensions: DimensionBlock[];
  hookShape: { share: Record<string, number>; unused: string[]; nextTarget: string };
}

const DIMENSION_LABELS: Record<string, string> = {
  hookPattern: 'Hook shape',
  angle: 'Creative angle',
  imageProvider: 'Image source',
  contentType: 'Content type',
};

const VERDICT_COPY: Record<string, { text: string; tone: string }> = {
  winner: { text: 'Clear winner', tone: 'text-(--success)' },
  no_difference: { text: 'No real difference', tone: 'text-(--muted)' },
  insufficient_data: { text: 'Not enough data yet', tone: 'text-amber-300' },
};

export function CreativeIntelPanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [d, setD] = useState<Intel | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/intel/creative?brandId=${brandId}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setD)
      .catch(e => setErr(e instanceof Error ? e.message : String(e)));
  }, [brandId]);

  if (err) return <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">{err}</div>;
  if (!d) return <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5 text-sm text-(--muted)">Loading…</div>;

  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5 space-y-5">
      <div>
        <div className="font-medium text-(--txt)">🧪 Creative intelligence · {brandName}</div>
        <div className="text-xs text-(--muted-2) mt-0.5">
          {d.generations} generations recorded, {d.withOutcome} with performance data.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-(--line) px-3 py-2">
          <div className="text-[11px] text-(--muted-2)">Avg reach (last {d.reach.recent.length})</div>
          <div className="text-xl font-semibold text-(--txt)">{d.reach.avgReach}</div>
        </div>
        <div className="rounded-lg border border-(--line) px-3 py-2">
          <div className="text-[11px] text-(--muted-2)">Avg views</div>
          <div className="text-xl font-semibold text-(--txt)">{d.reach.avgViews}</div>
        </div>
      </div>

      {/* What the next post will do differently, and why. */}
      <div className="rounded-lg border border-(--violet)/40 bg-(--violet)/5 px-3 py-2.5">
        <div className="text-xs font-medium text-(--txt)">Next hook will be a “{d.hookShape.nextTarget}”</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Object.entries(d.hookShape.share)
            .sort((a, b) => b[1] - a[1])
            .map(([shape, frac]) => (
              <span
                key={shape}
                className={`text-[10px] rounded px-1.5 py-0.5 border ${
                  frac > 0.5 ? 'border-amber-900/60 text-amber-300' : 'border-(--line) text-(--muted)'
                }`}
              >
                {shape} {Math.round(frac * 100)}%
              </span>
            ))}
          {d.hookShape.unused.map(shape => (
            <span key={shape} className="text-[10px] rounded px-1.5 py-0.5 border border-(--line) text-(--muted-2)">
              {shape} — never used
            </span>
          ))}
        </div>
        <div className="mt-1.5 text-[10px] text-(--muted-2)">
          Anything above 50% is crowding out the rest, so generation is steered away from it.
        </div>
      </div>

      {d.dimensions.map(block => {
        const verdict = VERDICT_COPY[block.verdict] ?? VERDICT_COPY.insufficient_data;
        return (
          <div key={block.dimension}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-(--txt)">{DIMENSION_LABELS[block.dimension] ?? block.dimension}</span>
              <span className={`text-[10px] ${verdict.tone}`}>{verdict.text}</span>
            </div>
            <div className="mt-1.5 space-y-1">
              {block.stats.slice(0, 5).map(s => (
                <div key={s.value} className="flex items-center gap-2 text-[11px]">
                  <span className="text-(--muted) w-28 truncate">{s.value}</span>
                  <span className="text-(--muted-2)">n={s.samples}</span>
                  <span className="text-(--txt)">{s.meanScore.toFixed(1)}</span>
                  {!s.confident && (
                    <span className="text-[10px] text-amber-300/80" title={`Fewer than ${d.minConfidentSamples} samples`}>
                      too few to trust
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="text-[10px] text-(--muted-2) border-t border-(--line) pt-3">
        Score is reach plus a heavy weight on saves. Nothing below {d.minConfidentSamples} samples is acted
        on — showing it anyway is deliberate, so you can see what is being ignored and why.
      </div>
    </div>
  );
}
