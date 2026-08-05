'use client';

import { humanResultType, type LeaderboardAdRow } from '@/lib/leaderboard/ads';
import { formatCount } from '@/lib/format-number';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="text-sm font-semibold text-(--txt)">{value}</div>
      <div className="text-xs text-(--muted)">{label}</div>
    </div>
  );
}

export function AdRow({ row }: { row: LeaderboardAdRow }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-(--line) px-4 py-3 last:border-0">
      <span className="w-6 shrink-0 text-sm font-semibold text-(--muted)">{row.rank}</span>

      <div className="min-w-[180px] flex-1">
        <p className="text-sm text-(--txt)">{row.label}</p>
        {/* Meta is queried with date_preset=last_14d, so this is a trailing
            fortnight, not lifetime. Saying "so far" would overstate it. */}
        <p className="mt-1 text-xs text-(--muted)">
          ${row.spend.toFixed(2)} spent in the last 14 days
        </p>
      </div>

      <Metric
        label={`Cost per ${humanResultType(row.resultType)}`}
        value={row.costPerResult === null ? 'No results yet' : `$${row.costPerResult.toFixed(2)}`}
      />
      <Metric label="Results" value={formatCount(row.results)} />
      <Metric label="Times shown" value={formatCount(row.impressions)} />
      <Metric label="Clicked it" value={`${(row.clickRate * 100).toFixed(1)}%`} />
    </div>
  );
}
