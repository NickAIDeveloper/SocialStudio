import { PerformancePage } from '@/components/performance/performance-page';

export default function AnalyticsPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
        <p className="text-sm text-white mt-1">
          Track post performance across your Instagram accounts.
        </p>
      </div>
      <PerformancePage />
    </>
  );
}
