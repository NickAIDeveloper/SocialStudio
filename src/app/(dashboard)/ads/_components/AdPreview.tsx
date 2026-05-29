// src/app/(dashboard)/ads/_components/AdPreview.tsx
'use client';

import type { AdDraft } from '@/lib/meta/ads-types';

export function AdPreview(props: { draft: AdDraft | null }) {
  const d = props.draft;
  return (
    <div className="h-fit rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Preview</p>
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="px-3 py-2 text-xs text-zinc-300">Your Page · Sponsored</div>
        {d?.primaryText && <div className="px-3 pb-2 text-sm text-zinc-200 whitespace-pre-wrap">{d.primaryText}</div>}
        {d?.imageUrl
          ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.imageUrl} alt="Ad" className="aspect-[1.91/1] w-full object-cover" />
          )
          : <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-zinc-800 text-xs text-zinc-500">No image</div>}
        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs text-zinc-500">{d?.destinationUrl || 'yoursite.com'}</div>
            <div className="truncate text-sm font-semibold text-zinc-100">{d?.headline || 'Your headline'}</div>
          </div>
          <span className="shrink-0 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200">{(d?.cta ?? 'LEARN_MORE').replace('_', ' ')}</span>
        </div>
      </div>
    </div>
  );
}
