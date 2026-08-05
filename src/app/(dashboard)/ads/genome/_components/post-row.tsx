'use client';

import type { LeaderboardRow } from '@/lib/leaderboard/organic';

function formatCount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[92px]">
      <div className="text-sm font-semibold text-(--txt)">{value}</div>
      <div className="text-xs text-(--muted)">{label}</div>
    </div>
  );
}

export function PostRow({ row }: { row: LeaderboardRow }) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-(--line) px-4 py-3 last:border-0">
      <span className="w-6 shrink-0 text-sm font-semibold text-(--muted)">{row.rank}</span>

      {/* Post thumbnails come from whatever host generated them (blob storage,
          stock providers), so a plain img avoids next/image host allow-listing.
          Same call the other thumbnail strips in this app make. */}
      {row.imageUrl ? (
        <img
          src={row.imageUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-(--surface-2)" />
      )}

      <div className="min-w-[180px] flex-1">
        <p className="text-sm text-(--txt)">{row.headline}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {row.publishedAt && (
            <span className="text-xs text-(--muted)">{formatDate(row.publishedAt)}</span>
          )}
          {row.angleLabel && (
            <span className="rounded-full border border-(--violet-24) bg-(--violet-08) px-2 py-0.5 text-xs text-(--violet-bright)">
              {row.angleLabel}
            </span>
          )}
        </div>
      </div>

      <Metric label="People reached" value={formatCount(row.reach)} />
      <Metric label="Likes" value={formatCount(row.likes)} />
      <Metric
        label="Liked it"
        value={row.engagementRate === null ? 'n/a' : `${(row.engagementRate * 100).toFixed(1)}%`}
      />
    </div>
  );
}
