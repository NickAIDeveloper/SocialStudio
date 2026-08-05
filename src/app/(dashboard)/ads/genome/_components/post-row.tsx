'use client';

import type { LeaderboardRow } from '@/lib/leaderboard/organic';
import { formatCount } from '@/lib/format-number';

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

/**
 * Bar width as a share of the best post's reach. A leaderboard whose ranking is
 * only conveyed by row order makes the reader compare numbers by eye; the bar
 * shows the GAP, which is the actual story (a top post 5x the rest reads very
 * differently from a flat field).
 */
function reachShare(reach: number, maxReach: number): number {
  if (maxReach <= 0 || reach <= 0) return 0;
  return Math.max(2, Math.round((reach / maxReach) * 100));
}

export function PostRow({ row, maxReach }: { row: LeaderboardRow; maxReach: number }) {
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

      <div className="min-w-[150px] flex-1">
        <div className="text-sm font-semibold text-(--txt)">{formatCount(row.reach)}</div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-(--surface-2)">
          <div
            className="h-full rounded-full bg-(--violet)"
            style={{ width: `${reachShare(row.reach, maxReach)}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-(--muted)">People reached</div>
      </div>
      <Metric label="Likes" value={formatCount(row.likes)} />
      <Metric
        label="Liked it"
        value={row.engagementRate === null ? 'n/a' : `${(row.engagementRate * 100).toFixed(1)}%`}
      />
    </div>
  );
}
