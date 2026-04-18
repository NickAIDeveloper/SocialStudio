import { Suspense } from 'react';
import { AnalyzePage } from '@/components/analyze/analyze-page';
import { BrandRequiredGate } from '@/components/brand-required-gate';

export default function AnalyzeRoute() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Analyze</h1>
        <p className="text-sm text-white mt-1">
          Your performance, your competitors, and side-by-side comparison — all in one place.
        </p>
      </div>
      <BrandRequiredGate feature="view analytics">
        <Suspense fallback={<div className="text-sm text-white/70">Loading…</div>}>
          <AnalyzePage />
        </Suspense>
      </BrandRequiredGate>
    </>
  );
}
