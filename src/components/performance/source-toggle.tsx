'use client';

import type { HubSource } from '@/lib/url-state';

interface SourceToggleProps {
  value: HubSource;
  onChange: (next: HubSource) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function SourceToggle({
  value,
  onChange,
  disabled = false,
  disabledReason = 'Connect Meta in Settings',
}: SourceToggleProps) {
  const baseBtn =
    'px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';
  const activeBtn = 'bg-zinc-100 text-zinc-900';
  const inactiveBtn = 'text-zinc-400 hover:text-zinc-200';

  return (
    <div className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900 overflow-hidden">
      {disabled ? (
        <span
          title={disabledReason}
          aria-disabled="true"
          className={`${baseBtn} rounded-l-full opacity-40 cursor-not-allowed ${
            value === 'meta' ? activeBtn : inactiveBtn
          }`}
        >
          Meta insights
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onChange('meta')}
          className={`${baseBtn} rounded-l-full ${
            value === 'meta' ? activeBtn : inactiveBtn
          }`}
        >
          Meta insights
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange('scrape')}
        className={`${baseBtn} rounded-r-full ${
          value === 'scrape' ? activeBtn : inactiveBtn
        }`}
      >
        Scrape
      </button>
    </div>
  );
}
