import { IntelSection } from '@/components/intel/intel-section';

export default function IntelPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-(--txt)">
          Creative intelligence <span aria-hidden>🧪</span>
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          What the system has learned from your posts, and what it will do differently next. Findings
          below the confidence bar are shown rather than hidden, so you can see what is being ignored
          and why — acting on two data points would chase noise.
        </p>
      </div>
      <IntelSection />
    </div>
  );
}
