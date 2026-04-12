import { SmartPostsDashboard } from '@/components/smart-posts-dashboard';
import { BrandRequiredGate } from '@/components/brand-required-gate';

export default function SmartPostsPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Smart Posts</h1>
        <p className="text-sm text-white mt-1">
          Recommendations from your real data. One click to generate a tailored post.
        </p>
      </div>
      <BrandRequiredGate feature="get smart recommendations">
        <SmartPostsDashboard />
      </BrandRequiredGate>
    </>
  );
}
