'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PenSquare, Grid3x3, BarChart3, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cachedBufferFetch } from '@/lib/buffer-cache';

interface BufferPost {
  id: string;
  text: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
  channelId: string;
  channelService: string;
  shareMode: string;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getBrand(post: BufferPost): string {
  // Extract brand name from channel name or post text
  const text = `${post.channelId} ${post.channelService} ${post.text}`.toLowerCase();
  // Try to match any word before common suffixes
  const match = text.match(/(\w+)\.app/);
  if (match) return match[1];
  return 'post';
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-zinc-800/60', className)} />
  );
}

function BrandBadge({ brand }: { brand: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-teal-500/10 text-teal-400">
      {brand}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: 'bg-emerald-500/10 text-emerald-400',
    pending: 'bg-amber-500/10 text-amber-400',
    draft: 'bg-zinc-500/10 text-white',
    scheduled: 'bg-blue-500/10 text-blue-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        styles[status] ?? 'bg-zinc-500/10 text-white'
      )}
    >
      {status}
    </span>
  );
}

export function CommandCenter() {
  const [posts, setPosts] = useState<BufferPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        const data = await cachedBufferFetch<{ posts: BufferPost[] }>('/api/buffer?action=posts');
        if (data) setPosts(data.posts || []);
      } catch {
        // Silently fail — show empty state
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, []);

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const postsThisWeek = posts.filter((p) => {
    const created = new Date(p.createdAt).getTime();
    return created >= oneWeekAgo && p.status === 'sent';
  });

  const scheduledPosts = posts
    .filter((p) => p.status === 'scheduled' && p.dueAt)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());

  const nextScheduled = scheduledPosts[0] ?? null;

  const pendingPosts = posts.filter(
    (p) => p.status === 'pending' || p.status === 'scheduled'
  );

  const recentPosts = [...posts]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  // Calculate top content type from sent posts
  const topContentType = (() => {
    const sentPosts = posts.filter(p => p.status === 'sent');
    if (sentPosts.length === 0) return 'N/A';
    const counts: Record<string, number> = {};
    for (const p of sentPosts) {
      const type = p.shareMode || 'post';
      counts[type] = (counts[type] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const label = sorted[0][0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  })();

  return (
    <div className="space-y-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Posts This Week */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-white mb-1">
            Posts This Week
          </p>
          {loading ? (
            <Skeleton className="h-8 w-12 mt-1" />
          ) : (
            <p className="text-2xl font-semibold text-white font-mono">
              {posts.length > 0 ? postsThisWeek.length : '\u2014'}
            </p>
          )}
          <p className="text-xs text-white mt-1">Sent in last 7 days</p>
        </div>

        {/* Next Scheduled */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-white mb-1">
            Next Scheduled
          </p>
          {loading ? (
            <Skeleton className="h-8 w-24 mt-1" />
          ) : nextScheduled ? (
            <>
              <p className="text-2xl font-semibold text-white font-mono">
                {new Date(nextScheduled.dueAt!).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <BrandBadge brand={getBrand(nextScheduled)} />
                <span className="text-xs text-white">
                  {new Date(nextScheduled.dueAt!).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-white">None scheduled</p>
              <Link
                href="/generate"
                className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-block"
              >
                Create a post &rarr;
              </Link>
            </>
          )}
        </div>

        {/* Queue Depth */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-white mb-1">
            Queue Depth
          </p>
          {loading ? (
            <Skeleton className="h-8 w-10 mt-1" />
          ) : (
            <p className="text-2xl font-semibold text-white font-mono">
              {posts.length > 0 ? pendingPosts.length : '\u2014'}
            </p>
          )}
          <p className="text-xs text-white mt-1">Pending across all channels</p>
        </div>

        {/* Top Content Type */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-white mb-1">
            Top Content Type
          </p>
          <p className="text-2xl font-semibold text-white font-mono">{topContentType}</p>
          <p className="text-xs text-white mt-1">{postsThisWeek.length > 0 ? 'Most used format this week' : 'No posts this week'}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-white mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/generate"
            className="group rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-6 transition-colors hover:bg-zinc-800/60"
          >
            <PenSquare className="h-6 w-6 text-teal-400 mb-3" />
            <p className="text-base font-semibold text-white">Create Post</p>
            <p className="text-sm text-white mt-1">
              Generate captions, find images, schedule
            </p>
          </Link>

          <Link
            href="/batch"
            className="group rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-6 transition-colors hover:bg-zinc-800/60"
          >
            <Grid3x3 className="h-6 w-6 text-blue-400 mb-3" />
            <p className="text-base font-semibold text-white">Generate Batch</p>
            <p className="text-sm text-white mt-1">Create 20 posts at once</p>
          </Link>

          <Link
            href="/analytics"
            className="group rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-6 transition-colors hover:bg-zinc-800/60"
          >
            <BarChart3 className="h-6 w-6 text-amber-400 mb-3" />
            <p className="text-base font-semibold text-white">View Analytics</p>
            <p className="text-sm text-white mt-1">See what&apos;s performing</p>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-white mb-3">
          Recent Activity
        </h2>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50">
          {loading ? (
            <div className="divide-y divide-zinc-800/60">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentPosts.length > 0 ? (
            <div className="divide-y divide-zinc-800/60">
              {recentPosts.map((post) => {
                const brand = getBrand(post);
                const snippet =
                  post.text.length > 80
                    ? post.text.slice(0, 80) + '...'
                    : post.text;

                return (
                  <div
                    key={post.id}
                    className="flex items-start justify-between gap-4 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">{snippet}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <BrandBadge brand={brand} />
                        <StatusBadge status={post.status} />
                        <span className="text-xs text-white">
                          {relativeTime(post.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Zap className="h-8 w-8 text-zinc-600 mb-3" />
              <p className="text-sm text-white">
                No posts yet. Create your first post to get started!
              </p>
              <Link
                href="/generate"
                className="mt-3 text-sm font-medium text-teal-400 hover:text-teal-300"
              >
                Create a post &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
