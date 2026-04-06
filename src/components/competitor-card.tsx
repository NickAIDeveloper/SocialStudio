'use client';

import { X } from 'lucide-react';

interface CompetitorCardProps {
  id: string;
  handle: string;
  followerCount: number | null;
  lastScrapedAt: string | null;
  onRemove: (id: string) => void;
}

function formatFollowers(count: number | null): string {
  if (count === null) return '\u2014';
  if (count >= 1_000_000) {
    const value = count / 1_000_000;
    return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}M`;
  }
  if (count >= 1_000) {
    const value = count / 1_000;
    return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}K`;
  }
  return count.toLocaleString();
}

function getFreshness(lastScrapedAt: string | null): {
  dotColor: string;
  label: string;
} {
  if (!lastScrapedAt) {
    return { dotColor: 'bg-zinc-500', label: 'Not yet scraped' };
  }

  const scrapedDate = new Date(lastScrapedAt);
  const now = new Date();
  const diffMs = now.getTime() - scrapedDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const dotColor = diffDays <= 7 ? 'bg-green-500' : 'bg-amber-500';

  let label: string;
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      label = `Last scraped: ${Math.max(1, diffMinutes)}m ago`;
    } else {
      label = `Last scraped: ${diffHours}h ago`;
    }
  } else {
    label = `Last scraped: ${diffDays}d ago`;
  }

  return { dotColor, label };
}

export default function CompetitorCard({
  id,
  handle,
  followerCount,
  lastScrapedAt,
  onRemove,
}: CompetitorCardProps) {
  const { dotColor, label } = getFreshness(lastScrapedAt);

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/50 rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-white font-medium truncate">@{handle}</p>
        <p className="text-sm text-zinc-400">
          {formatFollowers(followerCount)} followers
        </p>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-xs text-zinc-500">{label}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
        aria-label={`Remove @${handle}`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
