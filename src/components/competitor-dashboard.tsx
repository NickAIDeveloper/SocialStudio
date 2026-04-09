'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { PostAnalyzer } from '@/components/post-analyzer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Brand {
  id: string;
  name: string;
  slug: string;
  instagramHandle: string | null;
}

interface Competitor {
  id: string;
  handle: string;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  lastScrapedAt: string | null;
}

interface Suggestion {
  handle: string;
  reason: string;
}

const HANDLE_REGEX = /^[a-zA-Z0-9._]{1,100}$/;
const COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#ef4444', '#10b981', '#f97316', '#06b6d4', '#84cc16'];

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Competitor card
// ---------------------------------------------------------------------------

function CompetitorRow({ comp, rank, color, onRemove }: {
  comp: Competitor;
  rank: number;
  color: string;
  onRemove: (id: string) => void;
}) {
  const followers = comp.followerCount ?? 0;
  const following = comp.followingCount ?? 0;
  const posts = comp.postCount ?? 0;
  const ratio = following > 0 ? (followers / following).toFixed(1) : '—';

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/50 transition group">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: color }}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">@{comp.handle}</p>
        {comp.lastScrapedAt && (
          <p className="text-[10px] text-zinc-500">Scraped {new Date(comp.lastScrapedAt).toLocaleDateString()}</p>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-white">{followers > 0 ? formatNum(followers) : '—'}</p>
        <p className="text-[10px] text-zinc-400">followers</p>
      </div>
      <div className="text-right hidden sm:block">
        <p className="text-sm font-bold text-white">{posts > 0 ? formatNum(posts) : '—'}</p>
        <p className="text-[10px] text-zinc-400">posts</p>
      </div>
      <div className="text-right hidden md:block">
        <p className="text-sm font-bold text-white">{ratio}</p>
        <p className="text-[10px] text-zinc-400">F/F ratio</p>
      </div>
      <button
        onClick={() => onRemove(comp.id)}
        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg"
      >
        &times;
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function CompetitorDashboard() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [trackingSelected, setTrackingSelected] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analyses, setAnalyses] = useState<Record<string, any>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('ss_compAnalyses') ?? '{}'); } catch { return {}; }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiInsights, setAiInsights] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('ss_compAiInsights') ?? '[]'); } catch { return []; }
  });
  const [aiLoading, setAiLoading] = useState(false);

  const selectedBrand = brands.find(b => b.id === selectedBrandId);
  const ownHandles = brands.map(b => b.instagramHandle).filter(Boolean);

  // Persist analyses and AI insights
  useEffect(() => {
    if (Object.keys(analyses).length > 0) localStorage.setItem('ss_compAnalyses', JSON.stringify(analyses));
  }, [analyses]);

  useEffect(() => {
    if (aiInsights.length > 0) localStorage.setItem('ss_compAiInsights', JSON.stringify(aiInsights));
  }, [aiInsights]);

  // Load brands
  useEffect(() => {
    fetch('/api/brands')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.brands) {
          const withHandle = data.brands.filter((b: Brand) => b.instagramHandle);
          setBrands(withHandle);
          if (withHandle.length > 0) setSelectedBrandId(withHandle[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Load competitors filtered by selected brand
  const fetchCompetitors = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedBrandId ? `/api/competitors?brandId=${selectedBrandId}` : '/api/competitors';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCompetitors(
        (data.competitors ?? []).map((c: Record<string, unknown>) => ({
          id: String(c.id ?? ''),
          handle: String(c.handle ?? ''),
          followerCount: typeof c.followerCount === 'number' ? c.followerCount : null,
          followingCount: typeof c.followingCount === 'number' ? c.followingCount : null,
          postCount: typeof c.postCount === 'number' ? c.postCount : null,
          lastScrapedAt: typeof c.lastScrapedAt === 'string' ? c.lastScrapedAt : null,
        })),
      );
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [selectedBrandId]);

  useEffect(() => {
    if (selectedBrandId) {
      fetchCompetitors();
      setAnalyses({}); // Clear analyses when switching brands
      setScanMessage(null);
    }
  }, [fetchCompetitors, selectedBrandId]);

  // Auto-find: suggest + add + scan (one click)
  const handleAutoFind = async () => {
    if (!selectedBrand) return;
    setScanning(true);
    setScanMessage('Finding competitors for ' + selectedBrand.name + '...');

    try {
      // Only find new ones if we have fewer than 5
      if (competitors.length < 5) {
        const desc = `${selectedBrand.name} @${selectedBrand.instagramHandle}. Do NOT suggest: ${ownHandles.join(', ')}. Already tracking: ${competitors.map(c => c.handle).join(', ')}`;
        const suggestRes = await fetch('/api/competitors/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandDescription: desc, niche: selectedBrand.name }),
        });

        if (suggestRes.ok) {
          const suggestData = await suggestRes.json();
          const suggested: Suggestion[] = suggestData.suggestions ?? [];
          const existing = new Set(competitors.map(c => c.handle));
          const newHandles = suggested
            .filter(s => !ownHandles.includes(s.handle) && !existing.has(s.handle))
            .slice(0, 10)
            .map(s => s.handle);

          if (newHandles.length > 0) {
            setScanMessage(`Found ${newHandles.length} competitors. Adding...`);
            for (const handle of newHandles) {
              try {
                await fetch('/api/competitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, brandId: selectedBrandId }) });
              } catch { /* continue */ }
            }
          }
        }
      }

      // Scan all tracked competitors
      setScanMessage('Scanning Instagram profiles...');
      const syncRes = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'instagram' }),
      });
      const syncData = await syncRes.json();
      const ig = syncData.results?.instagram;
      const scraped = ig?.accountsSynced ?? 0;

      await fetchCompetitors();
      setScanMessage(`Done! Scanned ${scraped} accounts. Generating AI analysis...`);
      void fetchAiInsights();
    } catch (err) {
      setScanMessage(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setScanning(false);
    }
  };

  // Deep scan: scrape each competitor one at a time using Playwright
  const handleDeepScan = async () => {
    setScanning(true);
    const handles = competitors.map(c => c.handle);
    setAnalyses({});

    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i];
      setScanMessage(`Scanning @${handle} (${i + 1}/${handles.length})...`);
      try {
        const res = await fetch('/api/competitors/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle }),
        });
        if (res.ok) {
          const data = await res.json();
          setAnalyses(prev => ({ ...prev, [handle]: data }));
        }
      } catch {
        // Skip failed accounts
      }
    }

    await fetchCompetitors();
    setScanMessage(`Done! Scraped ${handles.length} competitors. Generating AI analysis...`);
    setScanning(false);
    // Auto-generate AI insights after scan
    void fetchAiInsights();
  };

  // Add
  const handleAdd = async () => {
    const handle = newHandle.trim().replace(/^@/, '');
    if (!HANDLE_REGEX.test(handle)) return;
    setAdding(true);
    try {
      await fetch('/api/competitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, brandId: selectedBrandId || undefined }) });
      setNewHandle('');
      setShowAdd(false);
      await fetchCompetitors();
    } catch { /* silent */ }
    finally { setAdding(false); }
  };

  // Remove
  const handleRemove = async (id: string) => {
    await fetch(`/api/competitors?id=${id}`, { method: 'DELETE' });
    setCompetitors(prev => prev.filter(c => c.id !== id));
  };

  // Suggest
  const handleSuggest = async () => {
    if (!selectedBrand) return;
    setSuggestLoading(true);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    try {
      const desc = `${selectedBrand.name} @${selectedBrand.instagramHandle}. Do NOT suggest: ${ownHandles.join(', ')}. Already tracking: ${competitors.map(c => c.handle).join(', ')}`;
      const res = await fetch('/api/competitors/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandDescription: desc, niche: selectedBrand.name }) });
      if (res.ok) {
        const data = await res.json();
        setSuggestions((data.suggestions ?? []).filter((s: Suggestion) => !ownHandles.includes(s.handle)));
      }
    } catch { /* silent */ }
    finally { setSuggestLoading(false); }
  };

  // AI competitive insights
  const [aiError, setAiError] = useState<string | null>(null);
  const fetchAiInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/insights/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: selectedBrandId || null, type: 'competitors' }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiInsights(data.insights ?? []);
      } else {
        setAiError(data.error || `AI analysis failed (${res.status})`);
      }
    } catch {
      setAiError('Failed to connect to AI service. Check your Cerebras API key in Vercel env vars.');
    }
    finally { setAiLoading(false); }
  };

  const toggleSuggestion = (h: string) => {
    setSelectedSuggestions(prev => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n; });
  };

  const handleTrackSelected = async () => {
    setTrackingSelected(true);
    for (const handle of selectedSuggestions) {
      try { await fetch('/api/competitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, brandId: selectedBrandId }) }); } catch { /* skip */ }
    }
    setTrackingSelected(false);
    setSuggestions([]);
    await fetchCompetitors();
  };

  // --- Derived data for charts ---
  const sortedByFollowers = [...competitors]
    .filter(c => c.followerCount && c.followerCount > 0)
    .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0));

  // Own account data for comparison
  const ownProfile = brands.find(b => b.id === selectedBrandId);
  const ownFromSync = competitors.length > 0 ? null : null; // Will come from sync status

  const chartData = sortedByFollowers.map((c, i) => ({
    name: '@' + c.handle,
    followers: c.followerCount ?? 0,
    fill: COLORS[i % COLORS.length],
  }));

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Account picker */}
      {brands.length > 1 && (
        <div className="flex gap-3">
          {brands.filter(b => b.instagramHandle).map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBrandId(b.id)}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                selectedBrandId === b.id
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-500/20'
                  : 'bg-zinc-800/80 text-white border border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center text-xs font-bold">
                {b.name.charAt(0)}
              </div>
              <div className="text-left">
                <div>{b.name}</div>
                <div className="text-xs opacity-70">@{b.instagramHandle}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Post Analyzer */}
      <PostAnalyzer />

      {/* AI Competitive Insights */}
      <div className="rounded-xl border border-purple-500/20 bg-zinc-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            AI Competitive Intelligence
          </h3>
          <button
            onClick={() => void fetchAiInsights()}
            disabled={aiLoading}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {aiLoading ? (
              <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analyzing...</>
            ) : 'Generate AI Analysis'}
          </button>
        </div>

        {aiError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {aiError}
          </div>
        )}

        {aiInsights.length === 0 && !aiLoading && !aiError && (
          <p className="text-sm text-zinc-400">Click &ldquo;Generate AI Analysis&rdquo; for AI-powered competitive insights.</p>
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

      {/* Action bar */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void handleAutoFind()}
          disabled={scanning}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-purple-500/20"
        >
          {scanning ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Scanning...</>
          ) : competitors.length === 0 ? 'Find & Scan 10 Competitors' : 'Refresh All Data'}
        </button>
        <button
          onClick={() => { setShowAdd(prev => !prev); setSuggestions([]); }}
          className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium flex items-center gap-1.5"
        >
          <span className="text-lg leading-none">+</span> Add Handle
        </button>
        <button
          onClick={() => { setShowAdd(false); void handleSuggest(); }}
          disabled={suggestLoading}
          className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium border border-zinc-700 disabled:opacity-50"
        >
          {suggestLoading ? 'Finding...' : 'Suggest More'}
        </button>
      </div>

      {/* Status message */}
      {scanMessage && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-sm text-blue-300 flex items-center justify-between">
          <span>{scanMessage}</span>
          <button onClick={() => setScanMessage(null)} className="text-blue-400 hover:text-white ml-2">&times;</button>
        </div>
      )}

      {/* Add input */}
      {showAdd && (
        <div className="flex gap-2 max-w-md">
          <div className="flex flex-1 items-center">
            <span className="flex h-[38px] items-center rounded-l-lg border border-r-0 border-zinc-300 bg-zinc-100 px-2 text-sm text-zinc-500">@</span>
            <input
              type="text" value={newHandle} onChange={(e) => setNewHandle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
              placeholder="instagram_handle"
              className="flex-1 h-[38px] rounded-r-lg border border-l-0 border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button onClick={() => void handleAdd()} disabled={adding} className="h-[38px] px-5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium disabled:opacity-50">
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/40 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Suggested for {selectedBrand?.name}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {suggestions.map(s => (
              <label key={s.handle} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                selectedSuggestions.has(s.handle) ? 'border-teal-500/30 bg-teal-500/5' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
              }`}>
                <input type="checkbox" checked={selectedSuggestions.has(s.handle)} onChange={() => toggleSuggestion(s.handle)} className="mt-0.5 accent-teal-500" />
                <div>
                  <p className="text-sm text-white font-medium">@{s.handle}</p>
                  <p className="text-xs text-zinc-400">{s.reason}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => void handleTrackSelected()} disabled={selectedSuggestions.size === 0 || trackingSelected} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium disabled:opacity-50">
              {trackingSelected ? 'Tracking...' : `Track Selected (${selectedSuggestions.size})`}
            </button>
            <button onClick={() => setSuggestions([])} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium border border-zinc-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Follower comparison chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Follower Comparison</h3>
          <div style={{ height: Math.max(200, chartData.length * 45) }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" tickFormatter={formatNum} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#fff', fontSize: 12 }} width={160} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [formatNum(Number(value ?? 0)), 'Followers']}
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#fff' }}
                />
                <Bar dataKey="followers" radius={[0, 6, 6, 0]} barSize={24}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Competitor list */}
      <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Tracked Competitors ({competitors.length})
        </h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-zinc-800/60 animate-pulse" />)}
          </div>
        ) : competitors.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white mb-2">No competitors tracked yet</p>
            <p className="text-sm text-zinc-400">Click "Find & Scan 10 Competitors" to auto-discover competitors for {selectedBrand?.name ?? 'your brand'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {competitors
              .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0))
              .map((c, i) => (
                <CompetitorRow key={c.id} comp={c} rank={i + 1} color={COLORS[i % COLORS.length]} onRemove={handleRemove} />
              ))}
          </div>
        )}
      </div>

      {/* Quick insights based on available data */}
      {sortedByFollowers.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Market Position</h3>
            <div className="text-center space-y-2">
              <p className="text-4xl font-bold text-amber-400">
                #{sortedByFollowers.length + 1}
              </p>
              <p className="text-sm text-zinc-400">
                Your position by followers among {sortedByFollowers.length} competitors
              </p>
              <p className="text-xs text-zinc-500">
                Leader: @{sortedByFollowers[0].handle} ({formatNum(sortedByFollowers[0].followerCount ?? 0)})
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Average Competitor Size</h3>
            <div className="text-center space-y-2">
              <p className="text-4xl font-bold text-blue-400">
                {formatNum(Math.round(sortedByFollowers.reduce((s, c) => s + (c.followerCount ?? 0), 0) / sortedByFollowers.length))}
              </p>
              <p className="text-sm text-zinc-400">avg followers across competitors</p>
              <p className="text-xs text-zinc-500">
                Range: {formatNum(sortedByFollowers[sortedByFollowers.length - 1].followerCount ?? 0)} — {formatNum(sortedByFollowers[0].followerCount ?? 0)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Avg Posts</h3>
            <div className="text-center space-y-2">
              {(() => {
                const withPosts = competitors.filter(c => c.postCount && c.postCount > 0);
                const avg = withPosts.length > 0 ? Math.round(withPosts.reduce((s, c) => s + (c.postCount ?? 0), 0) / withPosts.length) : 0;
                return (
                  <>
                    <p className="text-4xl font-bold text-teal-400">{avg > 0 ? avg : '—'}</p>
                    <p className="text-sm text-zinc-400">avg posts per competitor</p>
                    <p className="text-xs text-zinc-500">
                      {withPosts.length} of {competitors.length} accounts have post data
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Deep scan analysis cards */}
      {Object.keys(analyses).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Competitor Intelligence</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(analyses).map(([handle, data]) => {
              const a = data.analysis;
              if (!a) return null;
              return (
                <div key={handle} className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold text-sm">
                        {handle.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">@{handle}</h4>
                        <p className="text-xs text-zinc-400">{formatNum(data.profile?.followers ?? 0)} followers</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-teal-400">{a.engagementRate}%</p>
                      <p className="text-[10px] text-zinc-400">Eng. Rate</p>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-zinc-800/40 py-2">
                      <p className="text-base font-bold text-white">{a.avgLikes}</p>
                      <p className="text-[9px] text-zinc-400">Avg Likes</p>
                    </div>
                    <div className="rounded-lg bg-zinc-800/40 py-2">
                      <p className="text-base font-bold text-white">{a.avgComments}</p>
                      <p className="text-[9px] text-zinc-400">Avg Comments</p>
                    </div>
                    <div className="rounded-lg bg-zinc-800/40 py-2">
                      <p className="text-base font-bold text-white">{a.postsPerWeek}</p>
                      <p className="text-[9px] text-zinc-400">Posts/Week</p>
                    </div>
                    <div className="rounded-lg bg-zinc-800/40 py-2">
                      <p className="text-base font-bold text-white">{data.postsScraped ?? 0}</p>
                      <p className="text-[9px] text-zinc-400">Scraped</p>
                    </div>
                  </div>

                  {/* Best day/time + content mix */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-zinc-800/30 px-3 py-2">
                      <p className="text-[9px] text-zinc-400 uppercase">Best Day</p>
                      <p className="text-xs font-semibold text-white">{a.bestDay}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-800/30 px-3 py-2">
                      <p className="text-[9px] text-zinc-400 uppercase">Best Time</p>
                      <p className="text-xs font-semibold text-white">{a.bestTime}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-800/30 px-3 py-2">
                      <p className="text-[9px] text-zinc-400 uppercase">Content</p>
                      <p className="text-xs font-semibold text-white">{a.contentMix?.imagePct}% img / {a.contentMix?.reelPct}% reel</p>
                    </div>
                  </div>

                  {/* Top hashtags */}
                  {a.topHashtags?.length > 0 && (
                    <div>
                      <p className="text-[9px] text-zinc-400 uppercase tracking-wider mb-1.5">Top Hashtags</p>
                      <div className="flex flex-wrap gap-1">
                        {a.topHashtags.slice(0, 8).map((tag: string) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top & worst post */}
                  <div className="grid grid-cols-2 gap-2">
                    {a.topPost && (
                      <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2.5">
                        <p className="text-[9px] text-green-400 uppercase font-bold">Best Post</p>
                        <p className="text-base font-bold text-white">{(a.topPost.likes + a.topPost.comments).toLocaleString()}</p>
                        <p className="text-[9px] text-zinc-400">{a.topPost.likes} likes, {a.topPost.comments} comments</p>
                        {a.topPost.caption && (
                          <p className="text-[10px] text-zinc-300 line-clamp-2 mt-1 italic">&ldquo;{a.topPost.caption.slice(0, 100)}&rdquo;</p>
                        )}
                      </div>
                    )}
                    {a.worstPost && (
                      <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5">
                        <p className="text-[9px] text-red-400 uppercase font-bold">Worst Post</p>
                        <p className="text-base font-bold text-white">{(a.worstPost.likes + a.worstPost.comments).toLocaleString()}</p>
                        <p className="text-[9px] text-zinc-400">{a.worstPost.likes} likes, {a.worstPost.comments} comments</p>
                        {a.worstPost.caption && (
                          <p className="text-[10px] text-zinc-300 line-clamp-2 mt-1 italic">&ldquo;{a.worstPost.caption.slice(0, 100)}&rdquo;</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
