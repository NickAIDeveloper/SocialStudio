'use client';

import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';
import { RunAnalysisButton } from './run-analysis-button';

export function AnalyzePage() {
  const searchParams = useSearchParams();
  const tab = readTab(searchParams);
  const brandId = searchParams.get('brand');
  const igUserId = searchParams.get('ig');

  return (
    <div className="space-y-6">
      <RunAnalysisButton brandId={brandId} igUserId={igUserId} />
      <AnalyzeTabs />
      {tab === 'you' && <PerformancePage />}
      {tab === 'competitors' && <CompetitorDashboard />}
      {tab === 'compare' && <CompareSection />}
    </div>
  );
}
