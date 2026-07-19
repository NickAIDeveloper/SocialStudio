'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
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
      <details open className="group rounded-2xl border border-(--line) bg-(--surface)">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-(--txt) hover:bg-white/[0.02]">
          <span>Detailed analytics</span>
          <ChevronDown className="h-4 w-4 text-(--muted) transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-6 p-4 pt-0">
          <AnalyzeTabs />
          {tab === 'you' && <PerformancePage />}
          {tab === 'competitors' && <CompetitorDashboard />}
          {tab === 'compare' && <CompareSection />}
        </div>
      </details>
    </div>
  );
}
