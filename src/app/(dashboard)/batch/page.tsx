import { BatchGallery } from '@/components/batch-gallery';

export default function BatchPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Batch Gallery</h1>
        <p className="text-sm text-white mt-1 max-w-xl">
          Pre-generated posts for your brands. Preview, tweak, and schedule in bulk.
        </p>
      </div>
      <BatchGallery />
    </>
  );
}
