'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';
import { RunAnalysisButton } from './run-analysis-button';
import { InsightFeed } from './insights/insight-feed';
import { BrainPanel } from '@/components/brain/brain-panel';
import type { AnalysisResult } from '@/lib/analyze/types';

export function AnalyzePage() {
  const searchParams = useSearchParams();
  const tab = readTab(searchParams);
  const brandId = searchParams.get('brand');
  const igUserId = searchParams.get('ig');
  const [latest, setLatest] = useState<AnalysisResult | null>(null);

  return (
    <div className="space-y-6">
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
