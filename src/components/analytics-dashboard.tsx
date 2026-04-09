'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
  AreaChart, Area, CartesianGrid,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { InsightCard as InsightCardType } from '@/lib/health-score';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InsightsResponse {
  insights: InsightCardType[];
  healthScore?: number;
  summary?: string;
  computedAt: string;
}

type Status = 'loading' | 'error' | 'empty' | 'ready';

const COLORS = {
  teal: '#14b8a6',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
  green: '#10b981',
  purple: '#a855f7',
  pink: '#ec4899',
  orange: '#f97316',
};

const PIE_COLORS = [COLORS.teal, COLORS.blue, COLORS.amber, COLORS.purple, COLORS.pink];

// ---------------------------------------------------------------------------
// Visual Components
// ---------------------------------------------------------------------------

function HealthGauge({ score }: { score: number }) {
  const color = score >= 70 ? COLORS.green : score >= 40 ? COLORS.amber : COLORS.red;
  const label = score >= 70 ? 'Strong' : score >= 40 ? 'Needs Work' : 'Critical';
  const data = [{ value: score, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <div className="w-48 h-48">
        <ResponsiveContainer>
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="70%" outerRadius="90%"
            startAngle={225} endAngle={-45}
            data={data}
          >
            <RadialBar
              dataKey="value"
              background={{ fill: '#27272a' }}
              cornerRadius={10}
              max={100}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center -mt-24">
        <p className="text-5xl font-bold text-white">{score}</p>
        <p className="text-sm font-medium mt-1" style={{ color }}>{label}</p>
      </div>
    </div>
  );
}

function ContentTypeChart({ data }: { data: Record<string, unknown> }) {
  const bars = data.bars as Array<{ label: string; pct: number }> | undefined;
  if (!bars || bars.length === 0) return null;

  const chartData = bars.map((b, i) => ({
    name: b.label,
    value: b.pct,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div className="flex items-center gap-4">
      <div className="w-32 h-32">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%" cy="50%"
              innerRadius={30}
              outerRadius={55}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2">
        {chartData.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
            <span className="text-sm text-white flex-1">{item.name}</span>
            <span className="text-sm font-semibold text-white">{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimingHeatmap({ data }: { data: Record<string, unknown> }) {
  const grid = data.grid as number[][] | undefined;
  if (!grid) return null;

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const times = ['Morning', 'Midday', 'Afternoon', 'Evening'];

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-5 gap-1 text-xs">
        <div />
        {times.map(t => (
          <div key={t} className="text-center text-zinc-400 font-medium">{t}</div>
        ))}
      </div>
      {days.map((day, di) => (
        <div key={day} className="grid grid-cols-5 gap-1">
          <div className="text-xs text-zinc-400 font-medium flex items-center">{day}</div>
          {(grid[di] ?? [0, 0, 0, 0]).map((level, ci) => (
            <div
              key={ci}
              className="h-8 rounded-md transition-colors"
              style={{
                backgroundColor: level > 0
                  ? `rgba(20, 184, 166, ${Math.min(1, 0.15 + level * 0.22)})`
                  : 'rgba(39, 39, 42, 0.5)',
              }}
              title={`${day} ${times[ci]}: ${level > 0 ? `${level}x engagement` : 'No data'}`}
            />
          ))}
        </div>
      ))}
      <div className="flex items-center justify-end gap-2 mt-2">
        <span className="text-[10px] text-zinc-500">Low</span>
        {[0.15, 0.35, 0.55, 0.75, 0.95].map((opacity, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: `rgba(20, 184, 166, ${opacity})` }}
          />
        ))}
        <span className="text-[10px] text-zinc-500">High</span>
      </div>
    </div>
  );
}

function HashtagVisual({ data }: { data: Record<string, unknown> }) {
  const drop = data.drop as string[] | undefined;
  const tryTags = data.try as string[] | undefined;
  if (!drop && !tryTags) return null;

  return (
    <div className="grid grid-cols-2 gap-6">
      {tryTags && tryTags.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-xs font-bold text-green-400 uppercase tracking-wider">Top Performing</span>
          </div>
          <div className="space-y-1.5">
            {tryTags.map((tag) => (
              <div key={tag} className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
                <span className="text-sm text-green-400 font-medium">{tag.startsWith('#') ? tag : `#${tag}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {drop && drop.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Worst Performing</span>
          </div>
          <div className="space-y-1.5">
            {drop.map((tag) => (
              <div key={tag} className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <span className="text-sm text-red-400 font-medium">{tag.startsWith('#') ? tag : `#${tag}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CaptionGauge({ data }: { data: Record<string, unknown> }) {
  const sweetSpot = data.sweetSpot as [number, number] | undefined;
  const current = data.current as number | undefined;
  const max = data.max as number | undefined;
  if (!sweetSpot || current == null || !max) return null;

  const chartData = [
    { name: 'Short', range: sweetSpot[0], fill: '#3f3f46' },
    { name: 'Sweet Spot', range: sweetSpot[1] - sweetSpot[0], fill: COLORS.teal },
    { name: 'Long', range: max - sweetSpot[1], fill: '#3f3f46' },
  ];

  return (
    <div className="space-y-3">
      <div className="h-6">
        <ResponsiveContainer>
          <BarChart data={[{ short: sweetSpot[0], sweet: sweetSpot[1] - sweetSpot[0], long: max - sweetSpot[1] }]} layout="vertical">
            <XAxis type="number" hide domain={[0, max]} />
            <YAxis type="category" hide dataKey="name" />
            <Bar dataKey="short" stackId="a" fill="#3f3f46" radius={[4, 0, 0, 4]} />
            <Bar dataKey="sweet" stackId="a" fill={COLORS.teal} />
            <Bar dataKey="long" stackId="a" fill="#3f3f46" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">0 words</span>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-teal-500" />
          <span className="text-xs text-white">Sweet spot: {sweetSpot[0]}–{sweetSpot[1]} words</span>
        </div>
        <span className="text-xs text-white">You: <span className="font-bold text-teal-400">{current}</span></span>
      </div>
    </div>
  );
}

function MomentumChart({ data }: { data: Record<string, unknown> }) {
  const direction = data.direction as 'up' | 'down' | 'flat' | undefined;
  const pct = data.pct as number | undefined;
  if (!direction || pct == null) return null;

  const iconMap = { up: TrendingUp, down: TrendingDown, flat: Minus };
  const colorMap = { up: COLORS.green, down: COLORS.red, flat: COLORS.amber };
  const Icon = iconMap[direction];
  const color = colorMap[direction];

  // Generate a simple sparkline
  const sparkData = direction === 'up'
    ? [{ v: 30 }, { v: 35 }, { v: 32 }, { v: 40 }, { v: 38 }, { v: 45 }, { v: 50 }, { v: 55 }]
    : direction === 'down'
      ? [{ v: 55 }, { v: 50 }, { v: 48 }, { v: 42 }, { v: 45 }, { v: 38 }, { v: 35 }, { v: 30 }]
      : [{ v: 40 }, { v: 42 }, { v: 39 }, { v: 41 }, { v: 40 }, { v: 42 }, { v: 41 }, { v: 40 }];

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-3">
        <Icon className="w-10 h-10" style={{ color }} />
        <div>
          <p className="text-3xl font-bold" style={{ color }}>
            {direction === 'up' ? '+' : direction === 'down' ? '-' : ''}{pct}%
          </p>
          <p className="text-xs text-zinc-400">vs last 2 weeks</p>
        </div>
      </div>
      <div className="flex-1 h-16">
        <ResponsiveContainer>
          <AreaChart data={sparkData}>
            <defs>
              <linearGradient id={`momentum-${direction}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#momentum-${direction})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PostHighlight({ insight, isTop }: { insight: InsightCardType; isTop: boolean }) {
  const reasons = insight.data.reasons as string[] | undefined;
  const post = insight.data.post as { likes?: number; comments?: number; caption?: string; contentType?: string; brand?: string } | undefined;
  const color = isTop ? COLORS.green : COLORS.red;
  const likes = post?.likes ?? 0;
  const comments = post?.comments ?? 0;
  const total = likes + comments;

  return (
    <div className="space-y-4">
      {/* Engagement stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-zinc-800/50 p-3">
          <p className="text-xl font-bold text-white">{total.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mt-1">Total</p>
        </div>
        <div className="rounded-lg bg-zinc-800/50 p-3">
          <p className="text-xl font-bold text-white">{likes.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mt-1">Likes</p>
        </div>
        <div className="rounded-lg bg-zinc-800/50 p-3">
          <p className="text-xl font-bold text-white">{comments.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider mt-1">Comments</p>
        </div>
      </div>

      {/* Caption preview */}
      {post?.caption && (
        <p className="text-xs text-zinc-300 italic line-clamp-3 leading-relaxed bg-zinc-800/30 rounded-lg px-3 py-2">
          &ldquo;{post.caption.slice(0, 200)}{post.caption.length > 200 ? '...' : ''}&rdquo;
        </p>
      )}

      {/* Reason pills */}
      {reasons && reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <span
              key={r}
              className="text-[11px] px-2.5 py-1 rounded-full border"
              style={{
                backgroundColor: `${color}10`,
                borderColor: `${color}30`,
                color: color,
              }}
            >
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card wrapper
// ---------------------------------------------------------------------------

function VisualCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-pulse">
      <div className="lg:col-span-1 rounded-xl bg-zinc-800/60 h-64" />
      <div className="lg:col-span-2 rounded-xl bg-zinc-800/60 h-64" />
      <div className="rounded-xl bg-zinc-800/60 h-48" />
      <div className="rounded-xl bg-zinc-800/60 h-48" />
      <div className="rounded-xl bg-zinc-800/60 h-48" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface Brand {
  id: string;
  name: string;
  slug: string;
  instagramHandle: string | null;
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [profileStats, setProfileStats] = useState<Array<{handle: string; followers: number; following: number; postCount: number}>>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('ss_profileStats') ?? '[]'); } catch { return []; }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiInsights, setAiInsights] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('ss_aiInsights') ?? '[]'); } catch { return []; }
  });
  const [aiLoading, setAiLoading] = useState(false);

  // Persist profile stats and AI insights to localStorage
  useEffect(() => {
    if (profileStats.length > 0) localStorage.setItem('ss_profileStats', JSON.stringify(profileStats));
  }, [profileStats]);

  useEffect(() => {
    if (aiInsights.length > 0) localStorage.setItem('ss_aiInsights', JSON.stringify(aiInsights));
  }, [aiInsights]);

  // Load brands
  useEffect(() => {
    fetch('/api/brands')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(data => {
        if (data.brands) {
          setBrands(data.brands);
          // Auto-select first brand
          if (data.brands.length > 0) setSelectedBrand(data.brands[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'all' }),
      });
      const json = await res.json();
      const ig = json.results?.instagram;
      const buf = json.results?.buffer;
      const parts: string[] = [];
      if (ig?.accountsSynced) parts.push(`${ig.accountsSynced} Instagram profiles synced (your accounts + competitors)`);
      if (ig?.postsSynced) parts.push(`${ig.postsSynced} posts found`);
      if (buf?.postsSynced) parts.push(`${buf.postsSynced} Buffer posts synced`);
      // Store profile stats from sync
      if (ig?.profiles && Array.isArray(ig.profiles)) {
        setProfileStats(ig.profiles);
      }
      if (parts.length === 0) parts.push('Sync complete — no new data found');
      setSyncMessage(parts.join(', '));
      // Refresh insights + AI insights after sync
      await fetchInsights(true);
      fetchAiInsights();
    } catch {
      setSyncMessage('Sync failed — check your connections in Settings');
    } finally {
      setSyncing(false);
    }
  }, []);

  const [aiError, setAiError] = useState<string | null>(null);
  const fetchAiInsights = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const brandId = selectedBrand && selectedBrand !== 'all' ? selectedBrand : null;
      const res = await fetch('/api/insights/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, type: 'analytics' }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiInsights(data.insights ?? []);
      } else {
        setAiError(data.error || `AI generation failed (${res.status})`);
      }
    } catch {
      setAiError('Failed to connect to AI service. Check your Cerebras API key in Vercel env vars.');
    }
    finally { setAiLoading(false); }
  }, [selectedBrand]);

  const fetchInsights = useCallback(async (forceRefresh: boolean) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setStatus('loading');
      }

      const method = forceRefresh ? 'POST' : 'GET';
      const res = await fetch('/api/insights?type=analytics', { method });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json: InsightsResponse = await res.json();

      if (json.insights.length === 0) {
        setData(null);
        setStatus('empty');
      } else {
        setData(json);
        setStatus('ready');
      }
    } catch {
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights(false);
    // Load last-known profile stats from DB
    fetch('/api/sync')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.accounts) {
          const stats = data.accounts
            .filter((a: Record<string, unknown>) => !a.isCompetitor)
            .map((a: Record<string, unknown>) => ({
              handle: String(a.handle),
              followers: Number(a.followerCount ?? 0),
              following: Number(a.followingCount ?? 0),
              postCount: Number(a.postCount ?? 0),
            }));
          if (stats.length > 0) setProfileStats(stats);
        }
      })
      .catch(() => {});
  }, [fetchInsights]);

  if (status === 'loading') {
    return <LoadingSkeleton />;
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl bg-zinc-900/80 p-10 text-center space-y-3">
        <p className="text-white">Something went wrong loading analytics.</p>
        <button
          onClick={() => fetchInsights(false)}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-500"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === 'empty' || !data) {
    return (
      <div className="rounded-xl bg-zinc-900/80 p-10 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">No analytics data yet</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">Follow these steps to start seeing your analytics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/60 p-5 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center mx-auto">
              <span className="text-lg font-bold text-teal-400">1</span>
            </div>
            <h3 className="text-sm font-semibold text-white">Connect Buffer</h3>
            <p className="text-xs text-zinc-400">Link your Buffer account in Settings to enable scheduling</p>
          </div>
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/60 p-5 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
              <span className="text-lg font-bold text-blue-400">2</span>
            </div>
            <h3 className="text-sm font-semibold text-white">Create a post</h3>
            <p className="text-xs text-zinc-400">Use the Create page to generate and schedule your first post</p>
          </div>
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/60 p-5 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
              <span className="text-lg font-bold text-purple-400">3</span>
            </div>
            <h3 className="text-sm font-semibold text-white">Sync Instagram data</h3>
            <p className="text-xs text-zinc-400">Pull in your Instagram metrics to power analytics</p>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition inline-flex items-center gap-2"
          >
            {syncing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Syncing...
              </>
            ) : (
              'Sync My Instagram Data Now'
            )}
          </button>
          {syncMessage && (
            <p className="text-sm text-blue-300 mt-3">{syncMessage}</p>
          )}
        </div>
      </div>
    );
  }

  // Extract insight cards by type for targeted rendering
  const findInsight = (type: string) => data.insights.find(i => i.type === type);
  const contentType = findInsight('best-content-type');
  const timing = findInsight('optimal-timing');
  const hashtags = findInsight('hashtag-health');
  const caption = findInsight('caption-length');
  const momentum = findInsight('momentum');
  const topPost = findInsight('top-post');
  const worstPost = findInsight('worst-post');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Analytics</h2>
        <div className="flex items-center gap-2">
          <button
            disabled={syncing}
            onClick={handleSync}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            {syncing ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Syncing...
              </>
            ) : (
              'Sync Instagram Data'
            )}
          </button>
          <button
            disabled={refreshing}
            onClick={() => fetchInsights(true)}
            className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-500 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Account selector */}
      {brands.length > 1 && (
        <div className="flex gap-2">
          {brands.filter(b => b.instagramHandle).map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBrand(b.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedBrand === b.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center text-[10px] font-bold">
                {b.name.charAt(0)}
              </div>
              {b.name}
              <span className="text-xs opacity-70">@{b.instagramHandle}</span>
            </button>
          ))}
        </div>
      )}

      {/* Sync status message */}
      {syncMessage && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-sm text-blue-300 flex items-center justify-between">
          <span>{syncMessage}</span>
          <button onClick={() => setSyncMessage(null)} className="text-blue-400 hover:text-white ml-2">&times;</button>
        </div>
      )}

      {/* AI-Powered Insights */}
      <div className="rounded-xl border border-purple-500/20 bg-zinc-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            AI Insights
          </h3>
          <button
            onClick={() => void fetchAiInsights()}
            disabled={aiLoading}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {aiLoading ? (
              <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analyzing...</>
            ) : 'Generate AI Insights'}
          </button>
        </div>

        {aiError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {aiError}
          </div>
        )}

        {aiInsights.length === 0 && !aiLoading && !aiError && (
          <p className="text-sm text-zinc-400">Click &ldquo;Generate AI Insights&rdquo; to get personalized recommendations powered by AI.</p>
        )}

        {aiInsights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiInsights.map((insight: { title: string; insight: string; action: string; type: string }, i: number) => {
              const borderColor = insight.type === 'positive' ? 'border-green-500/30' : insight.type === 'warning' ? 'border-red-500/30' : 'border-amber-500/30';
              const dotColor = insight.type === 'positive' ? 'bg-green-500' : insight.type === 'warning' ? 'bg-red-500' : 'bg-amber-500';
              return (
                <div key={i} className={`rounded-lg border ${borderColor} bg-zinc-800/30 p-4 space-y-2`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <h4 className="text-sm font-semibold text-white">{insight.title}</h4>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">{insight.insight}</p>
                  <div className="rounded bg-teal-500/10 border border-teal-500/20 px-2.5 py-1.5">
                    <p className="text-[11px] text-teal-300">{insight.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Account Overview — profile stats from Instagram scraping */}
      {profileStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profileStats
            .filter(p => selectedBrand === 'all' || brands.find(b => b.id === selectedBrand)?.instagramHandle === p.handle)
            .map(profile => {
              const brand = brands.find(b => b.instagramHandle === profile.handle);
              return (
                <div key={profile.handle} className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center text-white font-bold">
                      {brand?.name?.charAt(0) ?? '@'}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{brand?.name ?? profile.handle}</h3>
                      <p className="text-xs text-zinc-400">@{profile.handle}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{profile.followers.toLocaleString()}</p>
                      <p className="text-xs text-zinc-400 mt-1">Followers</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{profile.following.toLocaleString()}</p>
                      <p className="text-xs text-zinc-400 mt-1">Following</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{profile.postCount.toLocaleString()}</p>
                      <p className="text-xs text-zinc-400 mt-1">Posts</p>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Row 1: Health Score + Momentum + Content Type */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Health Score */}
        <VisualCard title="Health Score">
          {data.healthScore != null && (
            <div className="space-y-3">
              <HealthGauge score={data.healthScore} />
              {data.summary && (
                <p className="text-xs text-zinc-300 text-center mt-6 leading-relaxed">{data.summary}</p>
              )}
            </div>
          )}
        </VisualCard>

        {/* Momentum */}
        <VisualCard title="Momentum">
          {momentum ? (
            <div className="space-y-2">
              <MomentumChart data={momentum.data} />
              <p className="text-xs text-zinc-300 mt-2">{momentum.title}</p>
              <div className="rounded-md bg-teal-500/10 border border-teal-500/20 px-3 py-2">
                <p className="text-xs text-teal-300">{momentum.action}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Not enough data yet</p>
          )}
        </VisualCard>

        {/* Content Type Breakdown */}
        <VisualCard title="Content Mix">
          {contentType ? (
            <div className="space-y-3">
              <ContentTypeChart data={contentType.data} />
              <div className="rounded-md bg-teal-500/10 border border-teal-500/20 px-3 py-2">
                <p className="text-xs text-teal-300">{contentType.action}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Not enough data yet</p>
          )}
        </VisualCard>
      </div>

      {/* Row 2: Timing Heatmap + Caption Length */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Optimal Timing */}
        <VisualCard title="Best Times to Post">
          {timing ? (
            <div className="space-y-2">
              <TimingHeatmap data={timing.data} />
              <div className="rounded-md bg-teal-500/10 border border-teal-500/20 px-3 py-2 mt-3">
                <p className="text-xs text-teal-300">{timing.action}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Not enough data yet</p>
          )}
        </VisualCard>

        {/* Caption Length */}
        <VisualCard title="Caption Length">
          {caption ? (
            <div className="space-y-3">
              <CaptionGauge data={caption.data} />
              <p className="text-sm text-zinc-300 mt-2">{caption.title}</p>
              <div className="rounded-md bg-teal-500/10 border border-teal-500/20 px-3 py-2">
                <p className="text-xs text-teal-300">{caption.action}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Not enough data yet</p>
          )}
        </VisualCard>
      </div>

      {/* Row 3: Hashtag Health */}
      {hashtags && (
        <VisualCard title="Hashtag Health">
          <HashtagVisual data={hashtags.data} />
          <div className="rounded-md bg-teal-500/10 border border-teal-500/20 px-3 py-2 mt-4">
            <p className="text-xs text-teal-300">{hashtags.action}</p>
          </div>
        </VisualCard>
      )}

      {/* Row 4: Top & Worst Posts side by side */}
      {(topPost || worstPost) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {topPost && (
            <VisualCard title="Top Post This Month">
              <PostHighlight insight={topPost} isTop />
            </VisualCard>
          )}
          {worstPost && (
            <VisualCard title="Worst Post This Month">
              <PostHighlight insight={worstPost} isTop={false} />
            </VisualCard>
          )}
        </div>
      )}

    </div>
  );
}
