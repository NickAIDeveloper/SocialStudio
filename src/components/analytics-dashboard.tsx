'use client';

import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
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
type TabKey = 'overview' | 'posts' | 'strategy';
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
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Avg Engagement Rate</p>
          <p className={cn('text-3xl font-mono font-bold', engColor)}>
            {pct(summary.avgEngagementRate)}%
          </p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Reach</p>
          <p className="text-3xl font-mono font-bold text-white">
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ action: 'analyze', days: String(dateRange) });
        if (brandFilter !== 'all') params.set('brand', brandFilter);
        const res = await fetch(`/api/buffer?${params}`);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        const data = await res.json();
        if (!cancelled) {
          const merged = [...(data.posts || [])];

          // Merge scraped Instagram data
          try {
            const scrapeRes = await fetch('/api/scrape');
            const scrapeData = await scrapeRes.json();
            if (scrapeData.posts?.length > 0) {
              for (const scraped of scrapeData.posts) {
                const captionStart = scraped.caption?.slice(0, 50)?.toLowerCase() || '';
                const match = merged.find(
                  (p: BufferPostWithAnalytics) =>
                    captionStart.length > 10 &&
                    p.text?.toLowerCase()?.startsWith(captionStart)
                );
                if (match) {
                  match.statistics = {
                    ...match.statistics,
                    likes: scraped.likes || match.statistics.likes,
                    comments: scraped.comments || match.statistics.comments,
                  };
                }
              }
            }
          } catch {
            // Scraped data not available, that's fine
          }

          setPosts(merged);
          setAnalysis(data.analysis || null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
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
        </>
      )}
    </div>
  );
}
