import { IntelSection } from '@/components/intel/intel-section';

export default function IntelPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-(--txt)">
          Creative intelligence <span aria-hidden>🧪</span>
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          What the app has learned from your posts, and what it will do differently
          next. Findings it does not trust yet are still shown, marked as such, so
          you can see what is being left out. Two posts is not enough to prove
          anything, and acting on that little would send you the wrong way.
        </p>
      </div>
      <IntelSection />
    </div>
  );
}
