'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type CreateMode = 'single' | 'batch';
const VALID: CreateMode[] = ['single', 'batch'];

export function readMode(sp: URLSearchParams): CreateMode {
  const raw = sp.get('mode');
  return VALID.includes(raw as CreateMode) ? (raw as CreateMode) : 'single';
}

export function ModeToggle() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = readMode(searchParams);

  const onSelect = useCallback(
    (mode: CreateMode) => {
      const next = new URLSearchParams(searchParams.toString());
      if (mode === 'single') next.delete('mode');
      else next.set('mode', mode);
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div role="tablist" aria-label="Create mode" className="inline-flex items-center rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-1">
      {(['single', 'batch'] as CreateMode[]).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={active === m}
          onClick={() => onSelect(m)}
          className={cn(
            'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
            active === m ? 'bg-zinc-800 text-white shadow-sm' : 'text-white hover:bg-zinc-800/40',
          )}
        >
          {m === 'single' ? '1 post' : '20 posts'}
        </button>
      ))}
    </div>
  );
}
