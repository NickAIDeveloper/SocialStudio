import { Suspense } from 'react';
import { CreatePage } from '@/components/create/create-page';

export default function CreateRoute() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Create</h1>
        <p className="text-sm text-white mt-1">
          Generate one post or a batch of 20. Captions, images, overlays, and one-click scheduling.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-white/70">Loading…</div>}>
        <CreatePage />
      </Suspense>
    </>
  );
}
