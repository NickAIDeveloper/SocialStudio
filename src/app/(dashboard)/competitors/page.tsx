import { CompetitorDashboard } from '@/components/competitor-dashboard';

export default function CompetitorsPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Competitor Intelligence</h1>
        <p className="text-sm text-white mt-1 max-w-xl">
          Study what top accounts in your space are doing, then use those insights to create better content.
        </p>
      </div>
      <CompetitorDashboard />
    </>
  );
}
