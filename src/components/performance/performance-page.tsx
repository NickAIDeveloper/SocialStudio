'use client';

import dynamic from 'next/dynamic';
import { useHubState } from '@/lib/url-state';
import type { HubState } from '@/lib/url-state';
import { useIgAccounts } from '@/lib/ig-accounts';
import { SourceToggle } from './source-toggle';
import { BrandSelector } from './brand-selector';
import { IgAccountPicker } from './ig-account-picker';
import { InstagramSection } from '@/components/performance/meta-sections/instagram-section';

// AnalyticsDashboard is a large client component (999 lines, many recharts imports).
// Dynamic import avoids pulling it into the initial bundle when source === 'meta'.
const AnalyticsDashboard = dynamic(
  () => import('@/components/analytics-dashboard'),
  {
    loading: () => (
      <div className="rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-500">
        Loading analytics...
      </div>
    ),
    ssr: false,
  }
);

interface PerformancePageProps {
  defaults?: Partial<HubState>;
}

export function PerformancePage({ defaults }: PerformancePageProps) {
  const { accounts, loading: accountsLoading } = useIgAccounts();
  const hasIgAccounts = accounts.length > 0;

  // Default source: meta when IG accounts are connected, otherwise scrape.
  // After accounts load we pass the resolved default; before that we fall back
  // to 'scrape' so the page renders immediately without blocking.
  const resolvedSourceDefault: HubState['source'] =
    !accountsLoading && hasIgAccounts ? 'meta' : 'scrape';

  const { source, brand, ig, setSource, setBrand, setIg } = useHubState({
    defaults: { source: resolvedSourceDefault, ...defaults },
  });

  return (
    <div className="space-y-8">
      {/* Top controls bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-4">
        {/* BrandSelector is only meaningful in meta mode; scrape has its own
            internal brand picker inside AnalyticsDashboard. */}
        {source === 'meta' && (
          <BrandSelector value={brand} onChange={setBrand} />
        )}
        {source === 'meta' && (
          <IgAccountPicker value={ig} onChange={setIg} />
        )}
        <div className="ml-auto">
          <SourceToggle
            value={source}
            onChange={setSource}
            disabled={!accountsLoading && !hasIgAccounts}
            disabledReason="Connect Meta in Settings"
          />
        </div>
      </div>

      {/* ── Scrape branch ─────────────────────────────────────────────────── */}
      {source === 'scrape' && (
        <AnalyticsDashboard />
      )}

      {/* ── Meta branch ───────────────────────────────────────────────────── */}
      {source === 'meta' && (
        <div className="space-y-6">
          {/* InstagramSection self-fetches accounts and insights end-to-end.
              It contains HeroCard, FormatStrip, Heatmap, CaptionPatterns, and
              PostAutopsy internally — no props needed. The ig picker in the top
              bar above is informational context for the brand; the picker inside
              InstagramSection is the operative one. See DONE_WITH_CONCERNS. */}
          <InstagramSection />
        </div>
      )}
    </div>
  );
}
