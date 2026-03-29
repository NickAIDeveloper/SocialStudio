'use client';

import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { analyzeBufferPosts } from '@/lib/buffer-analyzer';
import type { BufferPostWithAnalytics as LibBufferPost } from '@/lib/buffer';
import type { IntelligenceReport } from '@/lib/content-intelligence';
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Hash,
  Lightbulb,
  Target,
  Zap,
  ArrowUpDown,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (inline, matching API response shape)
// ---------------------------------------------------------------------------

interface PostStatistics {
  likes: number;
  comments: number;
  reach: number;
  impressions: number;
  saves: number;
  shares: number;
  clicks: number;
  engagementRate: number;
}

interface BufferPostWithAnalytics {
  id: string;
  status: string;
  text: string;
  dueAt: string | null;
  createdAt: string;
  channelId: string;
  channelService: string;
  channelName: string;
  shareMode: string;
  statistics: PostStatistics;
  brand: 'affectly' | 'pacebrain';
  hashtags: string[];
  captionLength: number;
  mediaType: string;
}

interface BufferAnalysis {
  summary: {
    totalPosts: number;
    avgEngagementRate: number;
    totalReach: number;
    totalImpressions: number;
    totalLikes: number;
    totalComments: number;
    bestBrand: 'affectly' | 'pacebrain' | 'tied';
    trend: 'improving' | 'declining' | 'stable';
  };
  topPosts: {
    post: BufferPostWithAnalytics;
    rank: number;
    strengths: string[];
  }[];
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    evidence: string;
    action: string;
  }[];
  timing: {
    bestDay: string;
    bestHour: number;
    worstDay: string;
    topWindows: { day: string; hour: number; avgEngagement: number }[];
  };
  hashtags: {
    top: { tag: string; avgEngagement: number; useCount: number }[];
    optimalCount: number;
    overused: string[];
    underrated: string[];
  };
  contentPatterns: {
    avgCaptionLength: number;
    bestCaptionRange: string;
    topThemes: { theme: string; avgEngagement: number; count: number }[];
    savesToLikesRatio: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SortKey = 'engagement' | 'likes' | 'comments' | 'saves' | 'reach' | 'recent';
type TabKey = 'overview' | 'posts' | 'strategy' | 'intelligence';
type BrandFilter = 'all' | 'affectly' | 'pacebrain';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function pct(n: number): string {
  return n.toFixed(1);
}

function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function sortPosts(posts: BufferPostWithAnalytics[], key: SortKey): BufferPostWithAnalytics[] {
  const sorted = [...posts];
  switch (key) {
    case 'engagement':
      return sorted.sort((a, b) => b.statistics.engagementRate - a.statistics.engagementRate);
    case 'likes':
      return sorted.sort((a, b) => b.statistics.likes - a.statistics.likes);
    case 'comments':
      return sorted.sort((a, b) => b.statistics.comments - a.statistics.comments);
    case 'saves':
      return sorted.sort((a, b) => b.statistics.saves - a.statistics.saves);
    case 'reach':
      return sorted.sort((a, b) => b.statistics.reach - a.statistics.reach);
    case 'recent':
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    default:
      return sorted;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cardClass = 'rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5';
const activePill = 'bg-zinc-800 text-white rounded-lg px-3 py-1.5 text-sm font-medium';
const inactivePill = 'text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors';

function brandBadge(brand: 'affectly' | 'pacebrain') {
  return brand === 'affectly'
    ? 'bg-teal-400/10 text-teal-400 text-xs px-2 py-0.5 rounded-full font-medium'
    : 'bg-blue-400/10 text-blue-400 text-xs px-2 py-0.5 rounded-full font-medium';
}

function priorityBadge(priority: 'high' | 'medium' | 'low') {
  const map = {
    high: 'bg-red-400/10 text-red-400',
    medium: 'bg-amber-400/10 text-amber-400',
    low: 'bg-blue-400/10 text-blue-400',
  };
  return `${map[priority]} text-xs px-2 py-0.5 rounded-full font-medium capitalize`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return <div className={cn(cardClass, 'animate-pulse h-28')} />;
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <p className="text-zinc-400 text-sm text-center">Analyzing your Buffer posts...</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className={cn(cardClass, 'max-w-xl mx-auto text-center space-y-4')}>
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
      <h3 className="text-lg font-semibold text-white">Buffer API Connection Issue</h3>
      <p className="text-zinc-400 text-sm">{message}</p>
      <div className="text-left text-sm text-zinc-500 space-y-1 mt-4">
        <p className="font-medium text-zinc-300">To fix this:</p>
        <p>1. Go to <span className="text-teal-400">buffer.com/developers/apps</span></p>
        <p>2. Generate an API access token</p>
        <p>3. Add <code className="text-teal-400">BUFFER_API_KEY=your_token</code> to <code>.env.local</code></p>
        <p>4. Restart the dev server</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className={cn(cardClass, 'max-w-xl mx-auto text-center space-y-3')}>
      <Target className="w-10 h-10 text-zinc-500 mx-auto" />
      <h3 className="text-lg font-semibold text-white">No Sent Posts Found</h3>
      <p className="text-zinc-400 text-sm">
        Schedule and send some posts first, then come back to see your analytics.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function PostCard({ post, label, labelColor }: { post: BufferPostWithAnalytics; label: string; labelColor: string }) {
  const caption = post.text.replace(/#\w+/g, '').trim();
  const brandColor = post.brand === 'affectly' ? 'bg-teal-400/10 text-teal-400' : 'bg-blue-400/10 text-blue-400';
  return (
    <div className={cn(cardClass, 'flex flex-col gap-3')}>
      <div className="flex items-center justify-between">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', labelColor)}>{label}</span>
        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', brandColor)}>
          {post.brand === 'affectly' ? 'Affectly' : 'PaceBrain'}
        </span>
      </div>
      <p className="text-sm text-zinc-300 line-clamp-3">{caption.slice(0, 160)}{caption.length > 160 ? '...' : ''}</p>
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{fmt(post.statistics.likes)}</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{fmt(post.statistics.comments)}</span>
        <span className="flex items-center gap-1"><Bookmark className="h-3 w-3" />{fmt(post.statistics.saves)}</span>
        {post.statistics.reach > 0 && <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{fmt(post.statistics.reach)}</span>}
        <span className="ml-auto text-zinc-600">{relativeTime(post.createdAt)}</span>
      </div>
      {post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {post.hashtags.slice(0, 5).map(t => (
            <span key={t} className="text-[10px] text-zinc-500">{t}</span>
          ))}
          {post.hashtags.length > 5 && <span className="text-[10px] text-zinc-600">+{post.hashtags.length - 5}</span>}
        </div>
      )}
    </div>
  );
}

function OverviewTab({ analysis, posts }: { analysis: BufferAnalysis; posts: BufferPostWithAnalytics[] }) {
  const { summary, contentPatterns, timing } = analysis;
  const hasReach = summary.totalReach > 0;
  const igCount = posts.filter((p) => p.id.startsWith('ig-')).length;

  // Rank posts by engagement (reach-based if available, otherwise likes+comments)
  const ranked = useMemo(() => {
    const sorted = [...posts].sort((a, b) => {
      if (hasReach) return b.statistics.engagementRate - a.statistics.engagementRate;
      return (b.statistics.likes + b.statistics.comments * 2) - (a.statistics.likes + a.statistics.comments * 2);
    });
    return sorted;
  }, [posts, hasReach]);

  const topPosts = ranked.slice(0, 5);
  const bottomPosts = [...ranked].reverse().slice(0, 5);

  const engColor =
    summary.avgEngagementRate > 3
      ? 'text-green-400'
      : summary.avgEngagementRate >= 1
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Posts</p>
          <p className="text-3xl font-mono font-bold text-white">{fmt(summary.totalPosts)}</p>
          {igCount > 0 && (
            <p className="text-xs text-teal-400/70 mt-1">{igCount} from Instagram</p>
          )}
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Likes</p>
          <p className="text-3xl font-mono font-bold text-white">{fmt(summary.totalLikes)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Comments</p>
          <p className="text-3xl font-mono font-bold text-white">{fmt(summary.totalComments)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Avg Engagement</p>
          <p className={cn('text-3xl font-mono font-bold', engColor)}>
            {pct(summary.avgEngagementRate)}{hasReach ? '%' : ''}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {hasReach ? 'engagement rate' : 'likes + comments per post'}
          </p>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Reach</p>
          <p className="text-2xl font-mono font-bold text-white">
            {hasReach ? fmt(summary.totalReach) : '\u2014'}
          </p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Best Brand</p>
          <p className="text-2xl font-bold text-white capitalize">
            {summary.bestBrand === 'tied' ? 'Tied' : (
              <span className={summary.bestBrand === 'affectly' ? 'text-teal-400' : 'text-blue-400'}>
                {summary.bestBrand}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Content patterns */}
      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Content Patterns</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Best Caption Length</p>
          <p className="text-xl font-mono font-bold text-white">{contentPatterns.bestCaptionRange} chars</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Saves-to-Likes Ratio</p>
          <p className="text-xl font-mono font-bold text-white">
            {(contentPatterns.savesToLikesRatio * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {contentPatterns.savesToLikesRatio > 0.3
              ? 'Your audience finds your content worth saving'
              : contentPatterns.savesToLikesRatio < 0.1
                ? 'Focus on creating more saveable content'
                : 'Decent save rate, room to improve'}
          </p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Top Content Themes</p>
          <div className="flex flex-wrap gap-2">
            {contentPatterns.topThemes.length === 0 && (
              <p className="text-zinc-500 text-sm">No themes detected</p>
            )}
            {contentPatterns.topThemes.map((t) => (
              <span
                key={t.theme}
                className="bg-zinc-800 text-zinc-300 text-xs px-2.5 py-1 rounded-lg"
              >
                {t.theme} <span className="text-zinc-500">({pct(t.avgEngagement)})</span>
              </span>
            ))}
          </div>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Avg Caption Length</p>
          <p className="text-xl font-mono font-bold text-white">{contentPatterns.avgCaptionLength} chars</p>
        </div>
      </div>

      {/* Timing */}
      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Timing Insights</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-zinc-500" />
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Best Day</p>
          </div>
          <p className="text-xl font-bold text-white">{timing.bestDay}</p>
        </div>
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-zinc-500" />
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Best Hour</p>
          </div>
          <p className="text-xl font-bold text-white">{formatHour(timing.bestHour)}</p>
        </div>
        <div className={cn(cardClass, 'sm:col-span-2 lg:col-span-1')}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Top Posting Windows</p>
          {timing.topWindows.length === 0 && (
            <p className="text-zinc-500 text-sm">Not enough data</p>
          )}
          <ul className="space-y-1">
            {timing.topWindows.map((w, i) => (
              <li key={i} className="text-sm text-zinc-300 flex justify-between">
                <span>{w.day} at {formatHour(w.hour)}</span>
                <span className="font-mono text-zinc-500">{pct(w.avgEngagement)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Highest & Lowest Performing Posts */}
      {posts.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" /> Highest Performing
            </h3>
            <div className="space-y-3">
              {topPosts.map((p, i) => (
                <PostCard key={p.id} post={p} label={`#${i + 1}`} labelColor="bg-green-400/10 text-green-400" />
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400" /> Lowest Performing
            </h3>
            <div className="space-y-3">
              {bottomPosts.map((p, i) => (
                <PostCard key={p.id} post={p} label={`#${posts.length - i}`} labelColor="bg-red-400/10 text-red-400" />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Posts
// ---------------------------------------------------------------------------

function PostsTab({
  posts,
  analysis,
  sortBy,
  setSortBy,
}: {
  posts: BufferPostWithAnalytics[];
  analysis: BufferAnalysis;
  sortBy: SortKey;
  setSortBy: (k: SortKey) => void;
}) {
  const topPostIds = useMemo(() => {
    const map = new Map<string, { rank: number; strengths: string[] }>();
    for (const tp of analysis.topPosts) {
      map.set(tp.post.id, { rank: tp.rank, strengths: tp.strengths });
    }
    return map;
  }, [analysis.topPosts]);

  const sorted = useMemo(() => sortPosts(posts, sortBy), [posts, sortBy]);

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'engagement', label: 'Engagement' },
    { value: 'likes', label: 'Likes' },
    { value: 'comments', label: 'Comments' },
    { value: 'saves', label: 'Saves' },
    { value: 'reach', label: 'Reach' },
    { value: 'recent', label: 'Recent' },
  ];

  return (
    <div className="space-y-4">
      {/* Sort */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4 text-zinc-500" />
        <span className="text-sm text-zinc-400">Sort by:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {sorted.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">No posts to display.</p>
      )}

      {/* Post list */}
      {sorted.map((post) => {
        const topInfo = topPostIds.get(post.id);
        return (
          <div key={post.id} className={cn(cardClass, 'space-y-3')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={brandBadge(post.brand)}>{post.brand}</span>
                  {topInfo && (
                    <span className="bg-amber-400/10 text-amber-400 text-xs px-2 py-0.5 rounded-full font-bold">
                      #{topInfo.rank}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">{relativeTime(post.createdAt)}</span>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {post.text.length > 120 ? `${post.text.slice(0, 120)}...` : post.text}
                </p>
                {topInfo && topInfo.strengths.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {topInfo.strengths.map((s) => (
                      <span key={s} className="bg-amber-400/5 text-amber-300/80 text-xs px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Metrics grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 pt-2 border-t border-zinc-800/60">
              <div className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-red-400" />
                <span className="font-mono text-sm text-zinc-300">{fmt(post.statistics.likes)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-blue-400" />
                <span className="font-mono text-sm text-zinc-300">{fmt(post.statistics.comments)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono text-sm text-zinc-300">{fmt(post.statistics.saves)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-green-400" />
                <span className="font-mono text-sm text-zinc-300">{fmt(post.statistics.shares)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-mono text-sm text-zinc-300">{fmt(post.statistics.reach)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-mono text-sm text-zinc-300">{pct(post.statistics.engagementRate)}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Strategy
// ---------------------------------------------------------------------------

function StrategyTab({ analysis }: { analysis: BufferAnalysis }) {
  const { recommendations, hashtags, timing } = analysis;

  const highPriority = recommendations.filter((r) => r.priority === 'high');
  const otherPriority = recommendations.filter((r) => r.priority !== 'high');

  const maxHashtagEng = hashtags.top.length > 0
    ? Math.max(...hashtags.top.map((t) => t.avgEngagement))
    : 1;

  return (
    <div className="space-y-8">
      {/* High priority */}
      {highPriority.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide flex items-center gap-2">
            <Zap className="w-4 h-4" /> High Priority
          </h3>
          {highPriority.map((rec, i) => (
            <div key={i} className={cn(cardClass, 'space-y-2')}>
              <div className="flex items-center gap-2">
                <span className={priorityBadge(rec.priority)}>{rec.priority}</span>
                <span className="text-xs text-zinc-500">{rec.category}</span>
              </div>
              <p className="text-sm font-bold text-white">{rec.title}</p>
              <p className="text-sm text-zinc-400">{rec.description}</p>
              <p className="text-xs text-zinc-500 italic">{rec.evidence}</p>
              <p className="text-xs text-teal-400">{rec.action}</p>
            </div>
          ))}
        </section>
      )}

      {/* Hashtag strategy */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
          <Hash className="w-4 h-4" /> Hashtag Strategy
        </h3>
        <div className={cn(cardClass, 'space-y-4')}>
          {hashtags.top.length === 0 && (
            <p className="text-zinc-500 text-sm">No hashtag data yet.</p>
          )}
          {hashtags.top.slice(0, 10).map((t) => (
            <div key={t.tag} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-300">{t.tag}</span>
                <span className="text-zinc-500 font-mono">{pct(t.avgEngagement)} eng &middot; {t.useCount}x</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-teal-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.max(5, (t.avgEngagement / maxHashtagEng) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="text-sm text-zinc-400 pt-2">
            Optimal count: <span className="font-mono text-white">{hashtags.optimalCount}</span> hashtags per post
          </p>
          {hashtags.overused.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-zinc-500 mb-1.5">Drop these (overused, underperforming):</p>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.overused.map((t) => (
                  <span key={t} className="bg-red-400/10 text-red-400 text-xs px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}
          {hashtags.underrated.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-zinc-500 mb-1.5">Try these more (underused, high-performing):</p>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.underrated.map((t) => (
                  <span key={t} className="bg-green-400/10 text-green-400 text-xs px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Timing */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
          <Clock className="w-4 h-4" /> Timing
        </h3>
        <div className={cn(cardClass, 'space-y-2')}>
          <p className="text-sm text-zinc-300">
            Best day: <span className="font-bold text-white">{timing.bestDay}</span> at{' '}
            <span className="font-bold text-white">{formatHour(timing.bestHour)}</span>
          </p>
          <p className="text-sm text-zinc-300">
            Avoid: <span className="text-zinc-500">{timing.worstDay}</span>
          </p>
          {timing.topWindows.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-zinc-500 mb-1.5">Top 5 posting windows:</p>
              <ul className="space-y-1">
                {timing.topWindows.map((w, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex justify-between">
                    <span>{w.day} at {formatHour(w.hour)}</span>
                    <span className="font-mono text-zinc-500">{pct(w.avgEngagement)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Medium + low priority */}
      {otherPriority.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
            <Lightbulb className="w-4 h-4" /> More Recommendations
          </h3>
          {otherPriority.map((rec, i) => (
            <div key={i} className={cn(cardClass, 'space-y-2')}>
              <div className="flex items-center gap-2">
                <span className={priorityBadge(rec.priority)}>{rec.priority}</span>
                <span className="text-xs text-zinc-500">{rec.category}</span>
              </div>
              <p className="text-sm font-bold text-white">{rec.title}</p>
              <p className="text-sm text-zinc-400">{rec.description}</p>
              <p className="text-xs text-zinc-500 italic">{rec.evidence}</p>
              <p className="text-xs text-teal-400">{rec.action}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Intelligence
// ---------------------------------------------------------------------------

function IntelligenceTab() {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [scrapingCompetitors, setScrapingCompetitors] = useState(false);
  const [compScrapeInfo, setCompScrapeInfo] = useState<string | null>(null);
  const [reportKey, setReportKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadReport() {
      setLoadingReport(true);
      try {
        const res = await fetch('/api/scrape?action=intelligence');
        const data = await res.json();
        if (!cancelled) setReport(data.report || null);
      } catch {
        // Intelligence data not available
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    }
    loadReport();
    return () => { cancelled = true; };
  }, [reportKey]);

  async function handleCompetitorScrape() {
    setScrapingCompetitors(true);
    setCompScrapeInfo(null);
    try {
      const res = await fetch('/api/scrape?target=competitors', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCompScrapeInfo(`Synced ${data.postsScraped} competitor posts from ${data.accounts.length} accounts`);
        setReportKey((k) => k + 1);
      } else {
        setCompScrapeInfo(`Sync failed: ${data.error}`);
      }
    } catch {
      setCompScrapeInfo('Competitor sync failed');
    } finally {
      setScrapingCompetitors(false);
    }
  }

  if (loadingReport) {
    return (
      <div className="space-y-4">
        <div className={cn(cardClass, 'animate-pulse h-20')} />
        <div className={cn(cardClass, 'animate-pulse h-40')} />
      </div>
    );
  }

  const fmtHour = (h: number) => {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  };

  return (
    <div className="space-y-6">
      {/* Competitor sync button */}
      <div className={cn(cardClass, 'flex items-center justify-between')}>
        <div>
          <p className="text-sm font-semibold text-white">Competitor Intelligence</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Scrape competitor Instagram accounts to compare strategies and find what works.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleCompetitorScrape}
            disabled={scrapingCompetitors}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              scrapingCompetitors
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
            )}
          >
            {scrapingCompetitors ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
                Scraping competitors...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Competitors
              </>
            )}
          </button>
          {compScrapeInfo && <p className="text-xs text-zinc-400">{compScrapeInfo}</p>}
        </div>
      </div>

      {!report ? (
        <div className={cn(cardClass, 'text-center py-8')}>
          <Target className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white">No Intelligence Data Yet</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Sync your Instagram posts first, then optionally sync competitors for a full comparison report.
          </p>
        </div>
      ) : (
        <>
          {/* Action plan */}
          {report.actionPlan.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" /> Action Plan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {report.actionPlan.map((item, i) => (
                  <div key={i} className={cn(cardClass, 'border-l-2 border-amber-400/40')}>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-zinc-400 mt-1">{item.description}</p>
                    <p className="text-[10px] text-zinc-600 mt-2">{item.basedOn}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Winning vs Losing patterns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {report.ownPerformance.winningPatterns.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> What&apos;s Working
                </h3>
                <div className="space-y-2">
                  {report.ownPerformance.winningPatterns.map((p, i) => (
                    <div key={i} className={cn(cardClass, 'border-l-2 border-green-400/40')}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white">{p.pattern}</p>
                        <span className="text-xs text-green-400 font-mono">{p.avgEngagement.toFixed(1)} avg</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{p.count} posts use this pattern</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.ownPerformance.losingPatterns.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" /> What&apos;s Not Working
                </h3>
                <div className="space-y-2">
                  {report.ownPerformance.losingPatterns.map((p, i) => (
                    <div key={i} className={cn(cardClass, 'border-l-2 border-red-400/40')}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-white">{p.pattern}</p>
                        <span className="text-xs text-red-400 font-mono">{p.avgEngagement.toFixed(1)} avg</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{p.count} posts use this pattern</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Insights grid */}
          {report.insights.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-teal-400" /> Insights
              </h3>
              <div className="space-y-3">
                {report.insights.map((insight, i) => (
                  <div key={i} className={cardClass}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        insight.priority === 'high' ? 'bg-red-400/10 text-red-400'
                          : insight.priority === 'medium' ? 'bg-amber-400/10 text-amber-400'
                            : 'bg-blue-400/10 text-blue-400',
                      )}>
                        {insight.priority}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{insight.category}</span>
                    </div>
                    <p className="text-sm font-medium text-white">{insight.title}</p>
                    <p className="text-xs text-zinc-400 mt-1">{insight.description}</p>
                    <p className="text-xs text-teal-400/70 mt-1">{insight.action}</p>
                    {insight.dataPoints.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {insight.dataPoints.map((dp, j) => (
                          <span key={j} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                            {dp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Timing heatmap */}
          {report.ownPerformance.timingInsights.bestWindows.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
                <Clock className="w-4 h-4" /> Best Posting Windows
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {report.ownPerformance.timingInsights.bestWindows.map((w, i) => (
                  <div key={i} className={cn(cardClass, i === 0 && 'border-teal-400/30 border')}>
                    <p className="text-xs text-zinc-500">{w.day}</p>
                    <p className="text-lg font-mono font-bold text-white">{fmtHour(w.hour)}</p>
                    <p className="text-xs text-teal-400">{w.avgEngagement.toFixed(1)} avg eng</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Hashtag insights */}
          {report.ownPerformance.hashtagInsights.topPerforming.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
                <Hash className="w-4 h-4" /> Top Hashtags
              </h3>
              <div className="flex flex-wrap gap-2">
                {report.ownPerformance.hashtagInsights.topPerforming.map((t, i) => (
                  <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded-lg">
                    {t.tag} <span className="text-teal-400 ml-1">{t.avgEngagement.toFixed(1)}</span>
                    <span className="text-zinc-600 ml-1">({t.useCount}x)</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* Competitor benchmarks */}
          {report.competitorBenchmarks.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" /> Competitor Benchmarks
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.competitorBenchmarks.map((comp, i) => (
                  <div key={i} className={cardClass}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-white">@{comp.handle}</p>
                        <span className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-medium',
                          comp.brand === 'affectly' ? 'bg-teal-400/10 text-teal-400' : 'bg-blue-400/10 text-blue-400',
                        )}>
                          {comp.brand === 'affectly' ? 'Affectly' : 'PaceBrain'} competitor
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-mono font-bold text-white">{comp.avgEngagement}</p>
                        <p className="text-[10px] text-zinc-500">avg engagement</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <p className="text-xs text-zinc-500">Posts</p>
                        <p className="text-sm font-mono text-white">{comp.totalPosts}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Avg Likes</p>
                        <p className="text-sm font-mono text-white">{comp.avgLikes}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Avg Comments</p>
                        <p className="text-sm font-mono text-white">{comp.avgComments}</p>
                      </div>
                    </div>
                    {comp.winningPatterns.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Winning Patterns</p>
                        <div className="flex flex-wrap gap-1">
                          {comp.winningPatterns.slice(0, 3).map((wp, j) => (
                            <span key={j} className="text-[10px] bg-green-400/10 text-green-400 px-2 py-0.5 rounded-full">
                              {wp.pattern}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {comp.lessonsForUs.length > 0 && (
                      <div className="border-t border-zinc-800 pt-2 mt-2">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Lessons for Us</p>
                        {comp.lessonsForUs.map((lesson, j) => (
                          <p key={j} className="text-xs text-teal-400/80 mt-0.5">{lesson}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AnalyticsDashboard() {
  const [posts, setPosts] = useState<BufferPostWithAnalytics[]>([]);
  const [analysis, setAnalysis] = useState<BufferAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('all');
  const [dateRange, setDateRange] = useState<number>(90);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [sortBy, setSortBy] = useState<SortKey>('engagement');
  const [scraping, setScraping] = useState(false);
  const [scrapeInfo, setScrapeInfo] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleScrape() {
    setScraping(true);
    setScrapeInfo(null);
    try {
      const res = await fetch('/api/scrape', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScrapeInfo(`Synced ${data.postsScraped} posts from Instagram`);
        setRefreshKey((k) => k + 1);
      } else {
        setScrapeInfo(`Sync failed: ${data.error}`);
      }
    } catch {
      setScrapeInfo('Sync failed — check console for details');
    } finally {
      setScraping(false);
    }
  }

  /** Normalize text for fuzzy caption matching between Buffer and Instagram. */
  function normalizeCaption(text: string): string {
    return text
      .toLowerCase()
      .replace(/#\w+/g, '')      // strip hashtags
      .replace(/[^\w\s]/g, '')   // strip punctuation
      .replace(/\s+/g, ' ')      // collapse whitespace
      .trim()
      .slice(0, 80);
  }

  /**
   * Merge scraped Instagram data into Buffer posts, then re-compute analysis.
   * - Matched posts: Instagram likes/comments overwrite Buffer values
   * - Unmatched scraped posts: added as new entries so Instagram-only posts appear
   */
  function mergeScrapedIntoBuffer(
    bufferPosts: BufferPostWithAnalytics[],
    scrapedPosts: { shortcode: string; caption: string; likes: number; comments: number; timestamp: string; imageUrl: string; isVideo: boolean; brand: 'affectly' | 'pacebrain' }[],
  ): BufferPostWithAnalytics[] {
    const merged = bufferPosts.map((p) => ({ ...p, statistics: { ...p.statistics } }));
    const matchedShortcodes = new Set<string>();

    for (const scraped of scrapedPosts) {
      const scrapedNorm = normalizeCaption(scraped.caption || '');
      if (scrapedNorm.length < 10) continue;

      const match = merged.find((p) => {
        const bufferNorm = normalizeCaption(p.text || '');
        if (bufferNorm.length < 10) return false;
        // Check if either starts with the other (handles IG prepending "username on Date:")
        return bufferNorm.startsWith(scrapedNorm.slice(0, 40)) ||
               scrapedNorm.startsWith(bufferNorm.slice(0, 40)) ||
               bufferNorm.includes(scrapedNorm.slice(0, 40)) ||
               scrapedNorm.includes(bufferNorm.slice(0, 40));
      });

      if (match) {
        // Update with real Instagram metrics (prefer scraped values when > 0)
        match.statistics = {
          ...match.statistics,
          likes: scraped.likes > 0 ? scraped.likes : match.statistics.likes,
          comments: scraped.comments > 0 ? scraped.comments : match.statistics.comments,
        };
        matchedShortcodes.add(scraped.shortcode);
      }
    }

    // Add Instagram-only posts (not found in Buffer) so they appear in analytics
    for (const scraped of scrapedPosts) {
      if (matchedShortcodes.has(scraped.shortcode)) continue;
      if (!scraped.caption || scraped.caption.length < 10) continue;

      // Extract hashtags from caption
      const hashtags = (scraped.caption.match(/#\w+/g) || []).map((t) => t.toLowerCase());

      merged.push({
        id: `ig-${scraped.shortcode}`,
        status: 'sent',
        text: scraped.caption,
        dueAt: null,
        createdAt: scraped.timestamp || new Date().toISOString(),
        channelId: `instagram-${scraped.brand}`,
        channelService: 'instagram',
        channelName: `@${scraped.brand === 'affectly' ? 'affectly.app' : 'pacebrain.app'}`,
        shareMode: 'direct',
        statistics: {
          likes: scraped.likes,
          comments: scraped.comments,
          reach: 0,
          impressions: 0,
          saves: 0,
          shares: 0,
          clicks: 0,
          engagementRate: 0,
        },
        brand: scraped.brand,
        hashtags,
        captionLength: scraped.caption.length,
        mediaType: scraped.isVideo ? 'video' as const : 'image' as const,
      });
    }

    return merged;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch Buffer analytics and scraped Instagram data in parallel
        const params = new URLSearchParams({ action: 'analyze', days: String(dateRange) });
        if (brandFilter !== 'all') params.set('brand', brandFilter);

        const [bufferRes, scrapeRes] = await Promise.all([
          fetch(`/api/buffer?${params}`),
          fetch('/api/scrape').catch(() => null),
        ]);

        if (!bufferRes.ok) throw new Error('Failed to fetch analytics');
        const bufferData = await bufferRes.json();

        if (cancelled) return;

        const bufferPosts: BufferPostWithAnalytics[] = bufferData.posts || [];
        let scrapedPosts: { shortcode: string; caption: string; likes: number; comments: number; timestamp: string; imageUrl: string; isVideo: boolean; brand: 'affectly' | 'pacebrain' }[] = [];
        let syncTimestamp: string | null = null;

        if (scrapeRes?.ok) {
          const scrapeData = await scrapeRes.json();
          let allScraped = scrapeData.posts || [];

          // Apply the same brand + date filters to scraped posts
          if (brandFilter !== 'all') {
            allScraped = allScraped.filter(
              (p: { brand: string }) => p.brand === brandFilter,
            );
          }
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - dateRange);
          allScraped = allScraped.filter(
            (p: { timestamp: string }) =>
              !p.timestamp || new Date(p.timestamp) >= cutoff,
          );

          scrapedPosts = allScraped;
          syncTimestamp = scrapeData.scrapedAt || null;
        }

        if (cancelled) return;

        // Merge Instagram data into Buffer posts
        const merged = scrapedPosts.length > 0
          ? mergeScrapedIntoBuffer(bufferPosts, scrapedPosts)
          : bufferPosts;

        // Re-compute analysis on the merged dataset so Instagram metrics
        // flow into summary cards, timing insights, and recommendations
        const freshAnalysis = merged.length > 0
          ? analyzeBufferPosts(merged as unknown as LibBufferPost[])
          : bufferData.analysis || null;

        setPosts(merged);
        setAnalysis(freshAnalysis);
        setLastSyncedAt(syncTimestamp);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandFilter, dateRange, refreshKey]);

  const dateOptions: { value: number; label: string }[] = [
    { value: 7, label: '7d' },
    { value: 30, label: '30d' },
    { value: 90, label: '90d' },
  ];

  const brandOptions: { value: BrandFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'affectly', label: 'Affectly' },
    { value: 'pacebrain', label: 'PaceBrain' },
  ];

  const tabs: { value: TabKey; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'posts', label: 'Posts' },
    { value: 'strategy', label: 'Strategy' },
    { value: 'intelligence', label: 'Intelligence' },
  ];

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Date range pills */}
        <div className="flex gap-1 bg-zinc-900/50 rounded-lg p-1 border border-zinc-800/60">
          {dateOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => setDateRange(o.value)}
              className={dateRange === o.value ? activePill : inactivePill}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Brand filter pills */}
        <div className="flex gap-1 bg-zinc-900/50 rounded-lg p-1 border border-zinc-800/60">
          {brandOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => setBrandFilter(o.value)}
              className={brandFilter === o.value ? activePill : inactivePill}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Sync from Instagram */}
        <div className="flex flex-col items-start">
          <button
            onClick={handleScrape}
            disabled={scraping}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              scraping
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-teal-500/10 text-teal-400 hover:bg-teal-500/20'
            )}
          >
            {scraping ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-teal-400/30 border-t-teal-400 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Sync from Instagram
              </>
            )}
          </button>
          {scrapeInfo && (
            <p className="text-xs text-zinc-400 mt-1">{scrapeInfo}</p>
          )}
          {lastSyncedAt && !scrapeInfo && (
            <p className="text-xs text-zinc-500 mt-1">
              Last synced {relativeTime(lastSyncedAt)}
            </p>
          )}
        </div>

        {/* Trend badge */}
        {analysis && (
          <div className="ml-auto">
            {analysis.summary.trend === 'improving' && (
              <span className="flex items-center gap-1 text-green-400 text-sm font-medium">
                <TrendingUp className="w-4 h-4" /> Improving
              </span>
            )}
            {analysis.summary.trend === 'declining' && (
              <span className="flex items-center gap-1 text-red-400 text-sm font-medium">
                <TrendingDown className="w-4 h-4" /> Declining
              </span>
            )}
            {analysis.summary.trend === 'stable' && (
              <span className="flex items-center gap-1 text-zinc-400 text-sm font-medium">
                <Minus className="w-4 h-4" /> Stable
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-zinc-800/60 pb-px">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors rounded-t-lg -mb-px',
              activeTab === t.value
                ? 'text-white border-b-2 border-teal-400'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && <LoadingState />}
      {error && !loading && <ErrorState message={error} />}
      {!loading && !error && posts.length === 0 && <EmptyState />}
      {!loading && !error && analysis && posts.length > 0 && (
        <>
          {activeTab === 'overview' && <OverviewTab analysis={analysis} posts={posts} />}
          {activeTab === 'posts' && (
            <PostsTab posts={posts} analysis={analysis} sortBy={sortBy} setSortBy={setSortBy} />
          )}
          {activeTab === 'strategy' && <StrategyTab analysis={analysis} />}
          {activeTab === 'intelligence' && <IntelligenceTab />}
        </>
      )}
    </div>
  );
}
