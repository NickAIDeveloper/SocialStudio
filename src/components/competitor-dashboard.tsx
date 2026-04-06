'use client';

import { useState, useEffect, useCallback } from 'react';
import CompetitorCard from '@/components/competitor-card';
import InsightCard from '@/components/insight-card';
import type { InsightCard as InsightCardType } from '@/lib/health-score';

interface Competitor {
  id: string;
  handle: string;
  followerCount: number | null;
  lastScrapedAt: string | null;
}

interface Suggestion {
  handle: string;
  reason: string;
}

const HANDLE_REGEX = /^[a-zA-Z0-9._]{1,100}$/;

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-zinc-800/60 ${className}`}
    />
  );
}

export function CompetitorDashboard() {
  // --- state ---
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [insights, setInsights] = useState<InsightCardType[]>([]);
  const [loadingCompetitors, setLoadingCompetitors] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [competitorsError, setCompetitorsError] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // add competitor
  const [showAddInput, setShowAddInput] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // suggest competitors
  const [showSuggest, setShowSuggest] = useState(false);
  const [brandDescription, setBrandDescription] = useState('');
  const [niche, setNiche] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(
    new Set(),
  );
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [trackingSelected, setTrackingSelected] = useState(false);

  // refresh insights
  const [refreshingInsights, setRefreshingInsights] = useState(false);

  // --- data fetching ---
  const fetchCompetitors = useCallback(async () => {
    setLoadingCompetitors(true);
    setCompetitorsError(null);
    try {
      const res = await fetch('/api/competitors');
      if (!res.ok) throw new Error('Failed to fetch competitors');
      const data = await res.json();
      setCompetitors(
        (data.competitors ?? []).map((c: Record<string, unknown>) => ({
          id: String(c.id ?? ''),
          handle: String(c.handle ?? ''),
          followerCount:
            typeof c.followerCount === 'number' ? c.followerCount : null,
          lastScrapedAt:
            typeof c.lastScrapedAt === 'string' ? c.lastScrapedAt : null,
        })),
      );
    } catch (err) {
      setCompetitorsError(
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setLoadingCompetitors(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const res = await fetch('/api/insights?type=competitors');
      if (!res.ok) throw new Error('Failed to fetch insights');
      const data = await res.json();
      setInsights(data.insights ?? []);
    } catch (err) {
      setInsightsError(
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setLoadingInsights(false);
    }
  }, []);

  useEffect(() => {
    void fetchCompetitors();
    void fetchInsights();
  }, [fetchCompetitors, fetchInsights]);

  // --- handlers ---
  const handleAddCompetitor = async () => {
    const cleaned = newHandle.replace(/^@/, '').trim();
    if (!cleaned) {
      setAddError('Handle is required');
      return;
    }
    if (!HANDLE_REGEX.test(cleaned)) {
      setAddError(
        'Invalid handle. Use letters, numbers, dots, and underscores only.',
      );
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: cleaned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error ?? 'Failed to add competitor',
        );
      }
      setNewHandle('');
      setShowAddInput(false);
      await fetchCompetitors();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveCompetitor = async (id: string) => {
    try {
      const res = await fetch(`/api/competitors?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove competitor');
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silently ignore — could add toast here
    }
  };

  const handleGetSuggestions = async () => {
    if (!brandDescription.trim() || !niche.trim()) {
      setSuggestError('Both fields are required');
      return;
    }
    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    try {
      const res = await fetch('/api/competitors/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandDescription: brandDescription.trim(),
          niche: niche.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to get suggestions');
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSuggestLoading(false);
    }
  };

  const toggleSuggestion = (handle: string) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) {
        next.delete(handle);
      } else {
        next.add(handle);
      }
      return next;
    });
  };

  const handleTrackSelected = async () => {
    if (selectedSuggestions.size === 0) return;
    setTrackingSelected(true);
    try {
      await Promise.all(
        Array.from(selectedSuggestions).map((handle) =>
          fetch('/api/competitors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle }),
          }),
        ),
      );
      setSelectedSuggestions(new Set());
      setSuggestions([]);
      setShowSuggest(false);
      await fetchCompetitors();
    } catch {
      // individual failures are acceptable
    } finally {
      setTrackingSelected(false);
    }
  };

  const handleRefreshInsights = async () => {
    setRefreshingInsights(true);
    try {
      const res = await fetch('/api/insights?type=competitors', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to refresh insights');
      await fetchInsights();
    } catch {
      // ignore
    } finally {
      setRefreshingInsights(false);
    }
  };

  // --- render ---
  return (
    <div className="space-y-8">
      {/* Top section */}
      <section className="glass-card border border-zinc-800/50 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-white">
          Who are you competing with?
        </h2>

        {/* Competitor grid */}
        {loadingCompetitors ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : competitorsError ? (
          <div className="text-sm text-red-400 flex items-center gap-2">
            <span>{competitorsError}</span>
            <button
              type="button"
              onClick={() => void fetchCompetitors()}
              className="underline hover:text-red-300"
            >
              Retry
            </button>
          </div>
        ) : competitors.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Add competitors to see how you stack up
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {competitors.map((c) => (
              <CompetitorCard
                key={c.id}
                id={c.id}
                handle={c.handle}
                followerCount={c.followerCount}
                lastScrapedAt={c.lastScrapedAt}
                onRemove={handleRemoveCompetitor}
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAddInput((prev) => !prev);
              setShowSuggest(false);
              setAddError(null);
            }}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors"
          >
            Add Competitor
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSuggest((prev) => !prev);
              setShowAddInput(false);
              setSuggestError(null);
            }}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium border border-zinc-700 transition-colors"
          >
            Suggest Competitors
          </button>
        </div>

        {/* Inline add input */}
        {showAddInput && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddCompetitor();
                }}
                placeholder="username (without @)"
                className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={() => void handleAddCompetitor()}
                disabled={adding}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
            {addError && (
              <p className="text-xs text-red-400">{addError}</p>
            )}
          </div>
        )}

        {/* Suggest section */}
        {showSuggest && (
          <div className="space-y-4 rounded-xl bg-zinc-900/60 border border-zinc-800/50 p-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Brand description
                </label>
                <textarea
                  value={brandDescription}
                  onChange={(e) => setBrandDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe what your brand does..."
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Niche
                </label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. wellness, fitness, SaaS..."
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleGetSuggestions()}
                disabled={suggestLoading}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {suggestLoading ? 'Finding...' : 'Get Suggestions'}
              </button>
              {suggestError && (
                <p className="text-xs text-red-400">{suggestError}</p>
              )}
            </div>

            {suggestions.length > 0 && (
              <div className="space-y-3">
                <ul className="space-y-2">
                  {suggestions.map((s) => (
                    <li key={s.handle} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(s.handle)}
                        onChange={() => toggleSuggestion(s.handle)}
                        className="mt-1 accent-teal-500"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium">
                          @{s.handle}
                        </p>
                        <p className="text-xs text-zinc-500">{s.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => void handleTrackSelected()}
                  disabled={
                    selectedSuggestions.size === 0 || trackingSelected
                  }
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {trackingSelected
                    ? 'Tracking...'
                    : `Track Selected (${selectedSuggestions.size})`}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Insight cards section */}
      <section className="glass-card border border-zinc-800/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Competitor Insights
          </h2>
          <button
            type="button"
            onClick={() => void handleRefreshInsights()}
            disabled={refreshingInsights}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {refreshingInsights ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loadingInsights ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : insightsError ? (
          <div className="text-sm text-red-400 flex items-center gap-2">
            <span>{insightsError}</span>
            <button
              type="button"
              onClick={() => void fetchInsights()}
              className="underline hover:text-red-300"
            >
              Retry
            </button>
          </div>
        ) : insights.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Once your competitors are scraped, insights will appear here
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight) => (
              <InsightCard key={insight.id} {...insight} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
