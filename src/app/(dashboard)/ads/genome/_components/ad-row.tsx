'use client';

import { humanResultType, type LeaderboardAdRow } from '@/lib/leaderboard/ads';

function formatCount(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

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
        <p className="mt-1 text-xs text-(--muted)">
          ${row.spend.toFixed(2)} spent so far
        </p>
      </div>

      <Metric
        label={`Cost per ${humanResultType(row.resultType)}`}
        value={row.costPerResult === null ? 'No results yet' : `$${row.costPerResult.toFixed(2)}`}
      />
      <Metric label="Results" value={formatCount(row.results)} />
      <Metric label="Times shown" value={formatCount(row.impressions)} />
      <Metric
        label="Clicked it"
        value={row.clickRate === null ? 'n/a' : `${(row.clickRate * 100).toFixed(1)}%`}
      />
    </div>
  );
}
