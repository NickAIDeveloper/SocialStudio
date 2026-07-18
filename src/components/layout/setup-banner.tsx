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
      // Both Buffer and the image source are read from linked-accounts — the
      // source of truth for "connected". We deliberately do NOT probe
      // /api/buffer?action=channels for this: channel listing can fail
      // (org/channel not selected, token re-auth, the nested-resolver FORBIDDEN
      // bug) while Buffer is genuinely connected, which wrongly showed
      // "Connect Buffer" on a connected account.
      fetch('/api/linked-accounts').then((r) => r.ok ? r.json() : null),
    ]).then((results) => {
      const brandsRes = results[0].status === 'fulfilled' ? results[0].value as { brands?: Array<{ instagramHandle?: string | null }> } | null : null;
      const linkedRes = results[1].status === 'fulfilled' ? results[1].value as { success?: boolean; data?: Array<{ provider: string }> } | null : null;
      const providers = new Set(
        linkedRes?.success && linkedRes.data ? linkedRes.data.map((a) => a.provider) : [],
      );
      const imageProviders = ['pixabay', 'unsplash', 'pexels', 'gemini_images'];
      setState({
        hasBrandWithIg: Boolean(brandsRes?.brands?.some((b) => b.instagramHandle)),
        hasBuffer: providers.has('buffer'),
        hasImageSource: imageProviders.some((p) => providers.has(p)),
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
    <div className="mb-6 rounded-2xl border border-(--violet-24) bg-(--violet-08) p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-(--violet-bright)" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-(--txt)">Finish setup to unlock everything</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.filter((c) => !c.done).map((c) => (
              <Link key={c.label} href={c.href} className="chip hover:brightness-110">
                {c.label}
              </Link>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded-lg p-1 text-(--muted-2) hover:bg-white/[0.04] hover:text-(--txt)">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
