'use client';

import { type FormatStats } from '@/lib/meta/ig-analytics';
import { formatNumber, FormatBadge } from './shared';

export function FormatStrip({ stats }: { stats: FormatStats[] }) {
  const hasData = stats.some((s) => s.sampleSize > 0);
  if (!hasData) return null;
  const top = stats.find((s) => s.sampleSize > 0);
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-white">Format performance</h4>
        <span className="text-[11px] text-white/40">median reach per post</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div
            key={s.format}
            className={`rounded-lg border p-3 ${
              s.sampleSize === 0
                ? 'border-white/5 bg-black/10 opacity-60'
                : s === top
                  ? 'border-emerald-400/30 bg-emerald-500/5'
                  : 'border-white/10 bg-black/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <FormatBadge format={s.format} />
              <span className="text-[10px] text-white/40">n = {s.sampleSize}</span>
            </div>
            <div className="mt-2 text-xl font-semibold text-white tabular-nums">
              {formatNumber(s.medianReach ?? undefined)}
            </div>
            {s.relativeToBest > 0 && s.relativeToBest < 1 && (
              <div className="text-[11px] text-white/50 mt-0.5">
                {(s.relativeToBest * 100).toFixed(0)}% of top
              </div>
            )}
            {s === top && s.sampleSize > 0 && (
              <div className="text-[11px] text-emerald-300/80 mt-0.5">Your top format</div>
            )}
          </div>
        ))}
      </div>
      {top && top.sampleSize >= 2 && (
        <p className="text-xs text-white/60">
          {top.format === 'REEL'
            ? 'Reels are getting the most reach — post 1–2 more per week.'
            : top.format === 'CAROUSEL'
              ? 'Carousels outperform your other formats — lead with carousels.'
              : 'Static images are leading — keep the strong visuals coming.'}
        </p>
      )}
    </div>
  );
}
