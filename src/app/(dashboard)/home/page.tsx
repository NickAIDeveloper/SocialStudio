import { CommandCenter } from '@/components/command-center';

export default function Home() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Home</h1>
        <p className="text-sm text-white mt-1">
          Your content command center. See what&apos;s happening and take action.
        </p>
      </div>
      <CommandCenter />
    </>
  );
}
