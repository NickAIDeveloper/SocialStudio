'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { BrandSelector, type BrandRow } from '@/components/performance/brand-selector';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';
import { RunAnalysisButton } from './run-analysis-button';
import { InsightFeed } from './insights/insight-feed';
import { BrainPanel } from '@/components/brain/brain-panel';
import { useHubState } from '@/lib/url-state';
import { useIgAccounts } from '@/lib/ig-accounts';
import { resolveIgForBrand } from '@/lib/brand-ig';
import type { AnalysisResult } from '@/lib/analyze/types';

export function AnalyzePage() {
  const searchParams = useSearchParams();
  const tab = readTab(searchParams);

  // Brand is URL state (`?brand=`) so it survives a refresh and can be shared;
  // useHubState also remembers the last choice in localStorage. Before this
  // page had a picker, nothing ON THIS PAGE ever set the param, so the Brand
  // Brain panel below only appeared for users who happened to have `hub.brand`
  // already in localStorage from /smart-posts, and never on a first visit.
  const { brand: brandId, ig: igUserId, setBrand, setIg } = useHubState();
  const [brandList, setBrandList] = useState<BrandRow[]>([]);
  const { accounts, loading: accountsLoading } = useIgAccounts();
  const [latest, setLatest] = useState<AnalysisResult | null>(null);

  // Follow the brand with its Instagram account, but only when the brand
  // actually changes — the legacy accordion below has its own IG picker and a
  // manual choice there must not be snapped back on every render.
  const lastSyncedBrand = useRef<string | null>(null);
  useEffect(() => {
    if (accountsLoading || brandList.length === 0) return;
    if (lastSyncedBrand.current === brandId) return;
    lastSyncedBrand.current = brandId;
    const resolved = resolveIgForBrand(brandId, brandList, accounts);
    // Assign even when null. Leaving a stale `ig` in place would run the
    // Meta-backed steps against the PREVIOUS brand's Instagram account and
    // report its reach under the newly-selected brand's name. Manual picks in
    // the accordion still survive, because this only runs on a brand change.
    if (resolved !== igUserId) setIg(resolved);
  }, [brandId, brandList, accounts, accountsLoading, igUserId, setIg]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-(--line) bg-(--surface) p-4">
        <BrandSelector
          value={brandId}
          onChange={setBrand}
          autoSelectFirst
          onLoaded={setBrandList}
        />
      </div>
      <RunAnalysisButton
        brandId={brandId}
        igUserId={igUserId}
        onComplete={(r) => setLatest(r)}
      />
      {brandId && <BrainPanel brandId={brandId} />}
      {latest && <InsightFeed result={latest} />}
      <details className="group rounded-2xl border border-(--line) bg-(--surface)">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-(--muted-2) hover:text-(--muted)">
          Detailed views (legacy)
        </summary>
        <div className="space-y-6 p-4">
          <AnalyzeTabs />
          {tab === 'you' && <PerformancePage />}
          {tab === 'competitors' && <CompetitorDashboard />}
          {tab === 'compare' && <CompareSection />}
        </div>
      </details>
    </div>
  );
}
