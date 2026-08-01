import { AskPanel } from '@/components/analytics/ask-panel';

export default function AskPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-(--txt)">
          Ask your data <span aria-hidden>💬</span>
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          Plain-English questions about reach, creative, failures, ads and cadence. Questions pick
          from a fixed set of hand-written queries — nothing generates SQL against your database, so
          this can only ever read.
        </p>
      </div>
      <AskPanel />
    </div>
  );
}
