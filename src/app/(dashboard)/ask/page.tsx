import { AskPanel } from '@/components/analytics/ask-panel';

export default function AskPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-(--txt)">
          Ask your data <span aria-hidden>💬</span>
        </h1>
        <p className="mt-1 text-sm text-(--muted)">
          Ask about your reach, your posts, what failed, your ads and how often you
          post. This tool only reads your data, it never changes anything.
        </p>
      </div>
      <AskPanel />
    </div>
  );
}
