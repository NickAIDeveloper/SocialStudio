'use client';

import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';

export function AnalyzePage() {
  const searchParams = useSearchParams();
  const tab = readTab(searchParams);

  return (
    <div className="space-y-6">
      <AnalyzeTabs />
      {tab === 'you' && <PerformancePage />}
      {tab === 'competitors' && <CompetitorDashboard />}
      {tab === 'compare' && <CompareSection />}
    </div>
  );
}
