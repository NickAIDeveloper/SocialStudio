'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

interface SetupState {
  hasBrandWithIg: boolean;
  hasBuffer: boolean;
  hasImageSource: boolean;
  loaded: boolean;
}

// Non-blocking banner. Shows chips for each missing setup item until all
// three are done, at which point it hides. Replaces BrandRequiredGate.
export function SetupBanner() {
  const [state, setState] = useState<SetupState>({
    hasBrandWithIg: false, hasBuffer: false, hasImageSource: false, loaded: false,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void Promise.allSettled([
      fetch('/api/brands').then((r) => r.ok ? r.json() : null),
      fetch('/api/buffer?action=channels').then((r) => ({ ok: r.ok })),
      fetch('/api/image-source').then((r) => r.ok ? r.json() : null),
    ]).then((results) => {
      const brandsRes = results[0].status === 'fulfilled' ? results[0].value as { brands?: Array<{ instagramHandle?: string | null }> } | null : null;
      const bufferRes = results[1].status === 'fulfilled' ? results[1].value as { ok: boolean } : { ok: false };
      const imageRes = results[2].status === 'fulfilled' ? results[2].value as { source?: string | null } | null : null;
      setState({
        hasBrandWithIg: Boolean(brandsRes?.brands?.some((b) => b.instagramHandle)),
        hasBuffer: bufferRes.ok,
        hasImageSource: Boolean(imageRes?.source),
        loaded: true,
      });
    });
  }, []);

  if (!state.loaded || dismissed) return null;
  const allDone = state.hasBrandWithIg && state.hasBuffer && state.hasImageSource;
  if (allDone) return null;

  const chips: Array<{ label: string; href: string; done: boolean }> = [
    { label: 'Add brand with Instagram handle', href: '/settings#brand', done: state.hasBrandWithIg },
    { label: 'Connect Buffer', href: '/settings#integrations', done: state.hasBuffer },
    { label: 'Pick an image source', href: '/settings#integrations', done: state.hasImageSource },
  ];

  return (
    <div className="mb-6 rounded-xl border border-teal-500/30 bg-teal-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Finish setup to unlock everything</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.filter((c) => !c.done).map((c) => (
              <Link key={c.label} href={c.href} className="rounded-lg border border-teal-500/30 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-zinc-800">
                {c.label}
              </Link>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
