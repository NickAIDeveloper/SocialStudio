'use client';

import { useSearchParams } from 'next/navigation';
import { PostGenerator } from '@/components/post-generator';
import { ContentRepurposer } from '@/components/content-repurposer';
import { BatchGallery } from '@/components/batch-gallery';
import { ModeToggle, readMode } from './mode-toggle';

export function CreatePage() {
  const sp = useSearchParams();
  const mode = readMode(sp);
  return (
    <div className="space-y-6">
      <ModeToggle />
      {mode === 'single' ? (
        <>
          <ContentRepurposer />
          <div className="mt-6" />
          <PostGenerator />
        </>
      ) : (
        <BatchGallery />
      )}
    </div>
  );
}
