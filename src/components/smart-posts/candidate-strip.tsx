'use client';

import { useState } from 'react';
import { Loader2, ImagePlus } from 'lucide-react';
import type { ImageCandidate, RenderParams } from '@/lib/smart-posts/generate';

interface CandidateStripProps {
  candidates: ImageCandidate[];
  activeUrl: string;
  renderParams: RenderParams;
  onImageChange: (newImageDataUrl: string, newSourceUrl: string) => void;
  onOpenMoreOptions: () => void;
}

export function CandidateStrip({
  candidates,
  activeUrl,
  renderParams,
  onImageChange,
  onOpenMoreOptions,
}: CandidateStripProps) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(c: ImageCandidate) {
    if (c.url === activeUrl) return;
    setError(null);
    setPendingUrl(c.url);
    try {
      const res = await fetch('/api/smart-posts/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageUrl: c.url,
          ...renderParams,
        }),
      });
      if (!res.ok) {
        setError("Couldn't swap image — try again.");
        return;
      }
      const body = (await res.json()) as { imageDataUrl?: string };
      if (!body.imageDataUrl) {
        setError("Couldn't swap image — try again.");
        return;
      }
      onImageChange(body.imageDataUrl, c.url);
    } catch {
      setError("Couldn't swap image — try again.");
    } finally {
      setPendingUrl(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {candidates.map((c) => {
          const isActive = c.url === activeUrl;
          const isPending = pendingUrl === c.url;
          return (
            <button
              key={c.url}
              type="button"
              aria-label={`Image candidate from ${c.source}`}
              data-active={isActive}
              onClick={() => void handlePick(c)}
              disabled={isPending || pendingUrl !== null}
              className={`relative h-14 w-14 overflow-hidden rounded-lg border transition disabled:opacity-60 ${
                isActive
                  ? 'border-teal-400 ring-2 ring-teal-400/40'
                  : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.url} alt="" className="h-full w-full object-cover" />
              {isPending && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </span>
              )}
              {c.source === 'past' && !isPending && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wide text-teal-200">
                  Past
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMoreOptions}
          disabled={pendingUrl !== null}
          className="inline-flex h-14 items-center gap-1 rounded-lg border border-dashed border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-60"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          More options
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
