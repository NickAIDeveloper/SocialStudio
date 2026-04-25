'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';
import { RunAnalysisButton } from './run-analysis-button';
import { InsightFeed } from './insights/insight-feed';
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
      {latest && <InsightFeed result={latest} />}
      <details className="group rounded-xl border border-zinc-800/60 bg-zinc-900/30">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
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
