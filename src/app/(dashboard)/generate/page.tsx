import { PostGenerator } from '@/components/post-generator';

export default function GeneratePage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Create Post</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Generate captions, find images, add overlays, and schedule to Buffer.
        </p>
      </div>
      <PostGenerator />
    </>
  );
}
