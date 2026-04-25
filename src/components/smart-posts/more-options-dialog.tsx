'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImageSourceSelector } from '@/components/image-source-selector';
import type { ImageResult } from '@/lib/image-sources';
import type { RenderParams } from '@/lib/smart-posts/generate';

interface MoreOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderParams: RenderParams;
  onImageChange: (newImageDataUrl: string, newSourceUrl: string) => void;
}

export function MoreOptionsDialog({
  open,
  onOpenChange,
  renderParams,
  onImageChange,
}: MoreOptionsDialogProps) {
  const [results, setResults] = useState<ImageResult[]>([]);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(url: string) {
    setError(null);
    setPendingUrl(url);
    try {
      const res = await fetch('/api/smart-posts/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceImageUrl: url, ...renderParams }),
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
      onImageChange(body.imageDataUrl, url);
      onOpenChange(false);
    } catch {
      setError("Couldn't swap image — try again.");
    } finally {
      setPendingUrl(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Pick a different image</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <ImageSourceSelector
            brand={renderParams.brand}
            onImagesLoaded={(imgs) => setResults(imgs)}
          />
          {results.length > 0 && (
            <div className="-mr-2 grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto pr-2">
              {results.map((img) => {
                const url = img.largeImageURL ?? img.previewURL;
                const isPending = pendingUrl === url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => void pick(url)}
                    disabled={pendingUrl !== null}
                    className="relative aspect-square overflow-hidden rounded-lg border border-zinc-700 hover:border-teal-400 disabled:opacity-60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewURL} alt="" className="h-full w-full object-cover" />
                    {isPending && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
