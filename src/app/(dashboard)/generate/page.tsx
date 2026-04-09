import { PostGenerator } from '@/components/post-generator';
import { ContentRepurposer } from '@/components/content-repurposer';
import { BrandRequiredGate } from '@/components/brand-required-gate';

export default function GeneratePage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Create Post</h1>
        <p className="text-sm text-white mt-1">
          Generate captions, find images, add overlays, and schedule to Buffer.
        </p>
      </div>
      <BrandRequiredGate feature="create posts">
        <ContentRepurposer />
        <div className="mt-6" />
        <PostGenerator />
      </BrandRequiredGate>
    </>
  );
}
