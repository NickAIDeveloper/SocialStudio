// src/app/(dashboard)/ads/queue/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { AdDashboardCard, type DashboardAd } from '../_components/AdDashboardCard';

interface DashboardResponse {
  success: boolean;
  ads: DashboardAd[];
}

export default function QueuedAdsPage() {
  const [ads, setAds] = useState<DashboardAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadAds(refresh = false) {
    const url = refresh ? '/api/ads/dashboard?refresh=1' : '/api/ads/dashboard';
    setError(null);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('Failed to load your ads dashboard.');
      const data = (await r.json()) as DashboardResponse;
      setAds(data.ads ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  useEffect(() => {
    void loadAds();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAds(true);
    setRefreshing(false);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Ads dashboard</h1>
          <p className="mt-1 max-w-xl text-sm text-(--muted)">
            Performance metrics for your Meta ads — live stats, signals, and AI-powered tips.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-2xl border border-(--line) bg-(--surface-2) px-3 py-2 text-sm font-medium text-(--muted) transition-colors hover:text-(--txt) disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
          <a
            href="/ads"
            className="text-sm font-medium text-(--violet-bright) transition-colors hover:text-(--violet)"
          >
            ← Back to ad builder
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && ads === null && (
        <div className="py-16 text-center text-sm text-(--muted)">Loading…</div>
      )}

      {!error && ads !== null && ads.length === 0 && (
        <div className="mx-auto max-w-md rounded-2xl border border-(--line) bg-(--bg) p-8 text-center">
          <p className="text-sm text-(--muted)">No ads yet — create one in the builder.</p>
          <a
            href="/ads"
            className="mt-4 inline-block rounded-2xl bg-(--violet) px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-(--violet-bright)"
          >
            Create an ad
          </a>
        </div>
      )}

      {!error && ads !== null && ads.length > 0 && (
        <div className="space-y-3">
          {ads.map((ad) => (
            <AdDashboardCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
}
