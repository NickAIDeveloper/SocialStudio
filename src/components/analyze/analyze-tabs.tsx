'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Users, GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AnalyzeTab = 'you' | 'competitors' | 'compare';

const TABS: Array<{ id: AnalyzeTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'you', label: 'You', icon: BarChart3 },
  { id: 'competitors', label: 'Competitors', icon: Users },
  { id: 'compare', label: 'Compare', icon: GitCompare },
];

const VALID: AnalyzeTab[] = ['you', 'competitors', 'compare'];

export function readTab(sp: URLSearchParams): AnalyzeTab {
  const raw = sp.get('tab');
  return VALID.includes(raw as AnalyzeTab) ? (raw as AnalyzeTab) : 'you';
}

export function AnalyzeTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = readTab(searchParams);

  const onSelect = useCallback(
    (tab: AnalyzeTab) => {
      const next = new URLSearchParams(searchParams.toString());
      if (tab === 'you') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="overflow-x-auto">
      <div
        role="tablist"
        aria-label="Analyze sections"
        className="inline-flex w-max items-center gap-1 rounded-xl border border-(--line) bg-(--surface) p-1"
      >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-(--surface-2) text-(--txt) shadow-sm'
                : 'text-(--muted) hover:bg-white/[0.04] hover:text-(--txt)',
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
      </div>
    </div>
  );
}
