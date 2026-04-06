'use client';

import { useCallback, useEffect, useState } from 'react';
import HealthScore from '@/components/health-score';
import InsightCard from '@/components/insight-card';
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

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="glass-card border border-zinc-800/50 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-zinc-700" />
        <div className="h-4 w-48 rounded bg-zinc-700" />
      </div>
      <div className="h-3 w-full rounded bg-zinc-800" />
      <div className="h-3 w-3/4 rounded bg-zinc-800" />
      <div className="h-8 w-full rounded bg-zinc-800/60" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Health score skeleton */}
      <div className="glass-card border border-zinc-800/50 p-5 flex items-center gap-5 animate-pulse">
        <div className="w-[136px] h-[136px] rounded-full bg-zinc-800 shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-24 rounded bg-zinc-700" />
          <div className="h-3 w-full rounded bg-zinc-800" />
          <div className="h-3 w-2/3 rounded bg-zinc-800" />
        </div>
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalyticsDashboard() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = useCallback(async (forceRefresh: boolean) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setStatus('loading');
      }

      const method = forceRefresh ? 'POST' : 'GET';
      const res = await fetch('/api/insights?type=analytics', { method });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

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
  }, [fetchInsights]);

  // -- Loading state --------------------------------------------------------
  if (status === 'loading') {
    return (
      <div className="rounded-xl bg-zinc-900/80 p-4">
        <LoadingSkeleton />
      </div>
    );
  }

  // -- Error state ----------------------------------------------------------
  if (status === 'error') {
    return (
      <div className="rounded-xl bg-zinc-900/80 p-6 text-center space-y-3">
        <p className="text-sm text-zinc-400">Something went wrong loading your insights.</p>
        <button
          type="button"
          onClick={() => fetchInsights(false)}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-500 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // -- Empty state ----------------------------------------------------------
  if (status === 'empty' || !data) {
    return (
      <div className="rounded-xl bg-zinc-900/80 p-10 text-center">
        <p className="text-sm text-zinc-400">
          Start posting to see your insights here
        </p>
      </div>
    );
  }

  // -- Ready state ----------------------------------------------------------
  return (
    <div className="rounded-xl bg-zinc-900/80 p-4 space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Analytics</h2>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => fetchInsights(true)}
          className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Health Score banner */}
      {data.healthScore != null && (
        <HealthScore
          score={data.healthScore}
          summary={data.summary ?? ''}
        />
      )}

      {/* Insight cards */}
      {data.insights.map((insight) => (
        <InsightCard key={insight.id} {...insight} />
      ))}
    </div>
  );
}
