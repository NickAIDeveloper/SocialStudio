import { Suspense } from 'react';
import { SmartPostsDashboard } from '@/components/smart-posts-dashboard';

// SmartPostsDashboard reads ?preset / ?metaFormat / ?metaDay / ?metaHour /
// ?metaPattern via useSearchParams() (linked from the /meta page's "Apply
// all learnings" and HeroCard "Make more like this" CTAs). Suspense is
// required so Next can still statically shell the surrounding header.
export default function SmartPostsPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Smart Posts</h1>
        <p className="text-sm text-white mt-1">
          Recommendations from your real data. One click to generate a tailored post.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-white/70">Loading…</div>}>
        <SmartPostsDashboard />
      </Suspense>
    </>
  );
}
