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
    'px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--violet)';
  const activeBtn = 'bg-(--violet) text-white';
  const inactiveBtn = 'text-(--muted) hover:text-(--txt)';

  return (
    <div className="inline-flex items-center rounded-full border border-(--line-strong) bg-(--surface) overflow-hidden">
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
        Public data
      </button>
    </div>
  );
}
