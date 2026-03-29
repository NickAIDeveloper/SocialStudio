import AnalyticsDashboard from '@/components/analytics-dashboard';

export default function AnalyticsPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Analytics</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Track post performance across your Instagram accounts.
        </p>
      </div>
      <AnalyticsDashboard />
    </>
  );
}
