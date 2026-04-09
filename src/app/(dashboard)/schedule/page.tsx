import Link from 'next/link';
import { BufferScheduler } from '@/components/buffer-scheduler';

export default function SchedulePage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Buffer Schedule</h1>
        <p className="text-sm text-white mt-2 max-w-2xl">
          View and manage your scheduled posts across all connected profiles.{' '}
          <span className="text-white">
            You can also schedule posts directly from the{' '}
            <Link href="/generate" className="text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors">
              Create
            </Link>{' '}
            page after generating content.
          </span>
        </p>
      </div>
      <BufferScheduler />
    </>
  );
}
