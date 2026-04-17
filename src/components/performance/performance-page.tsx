'use client';

import { useHubState } from '@/lib/url-state';
import type { HubState } from '@/lib/url-state';
import { SourceToggle } from './source-toggle';
import { BrandSelector } from './brand-selector';
import { IgAccountPicker } from './ig-account-picker';
import { SectionHeader } from './section-header';

interface PerformancePageProps {
  defaults?: Partial<HubState>;
}

const emptyStateClass =
  'rounded-lg border border-zinc-800/40 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-500';

export function PerformancePage({ defaults }: PerformancePageProps) {
  const { source, brand, ig, setSource, setBrand, setIg } = useHubState({
    defaults: { source: 'scrape', ...defaults },
  });

  return (
    <div className="space-y-8">
      {/* Top controls bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-4">
        <BrandSelector value={brand} onChange={setBrand} />
        {source === 'meta' && (
          <IgAccountPicker value={ig} onChange={setIg} />
        )}
        <div className="ml-auto">
          <SourceToggle value={source} onChange={setSource} />
        </div>
      </div>

      {/* Top post */}
      <SectionHeader title="Top post">
        <div className={emptyStateClass}>No post data yet.</div>
      </SectionHeader>

      {/* Caption patterns */}
      <SectionHeader title="Caption patterns">
        <div className={emptyStateClass}>No caption data yet.</div>
      </SectionHeader>

      {/* Timing */}
      <SectionHeader title="Timing">
        <div className={emptyStateClass}>No timing data yet.</div>
      </SectionHeader>

      {/* Format mix */}
      <SectionHeader title="Format mix">
        <div className={emptyStateClass}>No format data yet.</div>
      </SectionHeader>

      {/* Post autopsy */}
      <SectionHeader title="Post autopsy">
        <div className={emptyStateClass}>No autopsy data yet.</div>
      </SectionHeader>

      {/* Audience demographics (meta only) */}
      <SectionHeader
        title="Audience demographics"
        unavailable={source !== 'meta'}
        unavailableCta={
          <span>
            Connect Meta to unlock.{' '}
            <a
              href="/settings"
              className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
            >
              Go to Settings
            </a>
          </span>
        }
      >
        <div className={emptyStateClass}>No audience data yet.</div>
      </SectionHeader>

      {/* Deep profile (meta only, hidden when scrape) */}
      {source === 'meta' && (
        <SectionHeader title="Deep profile">
          <div className={emptyStateClass}>Deep profile loading...</div>
        </SectionHeader>
      )}
    </div>
  );
}
