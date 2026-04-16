import { Suspense } from 'react';
import { MetaHub } from '@/components/meta-hub';

// MetaHub calls useSearchParams() to pick up ?connected=1 / ?error=... from
// the OAuth callback redirect, which opts the page into client-side
// rendering. Suspense boundary is required so Next.js can still statically
// shell the rest of the page.
export default function MetaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Meta</h1>
        <p className="text-sm text-white mt-1">
          Connect your Facebook account to access ad account insights and (coming soon)
          campaign management.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-white/70">Loading…</div>}>
        <MetaHub />
      </Suspense>
    </div>
  );
}
