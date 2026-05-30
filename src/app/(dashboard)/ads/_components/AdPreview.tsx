// src/app/(dashboard)/ads/_components/AdPreview.tsx
'use client';

import { useState } from 'react';
import type { AdDraft } from '@/lib/meta/ads-types';

// Map known Meta CTAs to friendly button text. Anything not listed falls back to
// replacing underscores and title-casing.
const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: 'Learn more',
  SIGN_UP: 'Sign up',
  INSTALL_MOBILE_APP: 'Install',
  LIKE_PAGE: 'Like page',
};

function friendlyCta(cta: string): string {
  if (CTA_LABELS[cta]) return CTA_LABELS[cta];
  return cta
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function NoImage() {
  return (
    <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-(--surface-2) text-xs text-(--muted-2)">
      No image
    </div>
  );
}

// Renders the preview image; on load error it falls back to the "No image"
// placeholder instead of a broken-image icon.
function PreviewImage(props: { src: string; overlay?: React.ReactNode }) {
  const [errored, setErrored] = useState(false);
  // Reset the error state during render when the source changes, so a new URL
  // gets a fresh try (React's recommended "adjust state on prop change" pattern).
  const [lastSrc, setLastSrc] = useState(props.src);
  if (props.src !== lastSrc) {
    setLastSrc(props.src);
    setErrored(false);
  }

  if (errored) return <NoImage />;

  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={props.src}
        alt="Ad"
        onError={() => setErrored(true)}
        className="aspect-[1.91/1] w-full object-cover"
      />
      {props.overlay}
    </div>
  );
}

export function AdPreview(props: { draft: AdDraft | null }) {
  const d = props.draft;
  return (
    <div className="h-fit rounded-2xl border border-(--line) bg-(--bg) p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-(--muted-2)">Preview</p>
      <div className="overflow-hidden rounded-2xl border border-(--line) bg-(--surface)">
        <div className="px-3 py-2 text-xs text-(--muted)">Your Page · Sponsored</div>
        {d?.primaryText && <div className="px-3 pb-2 text-sm text-(--txt) whitespace-pre-wrap">{d.primaryText}</div>}
        {d?.mediaType === 'video'
          ? (d?.thumbnailUrl
            ? (
              <PreviewImage
                src={d.thumbnailUrl}
                overlay={(
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-sm text-white">▶</span>
                  </div>
                )}
              />
            )
            : <NoImage />)
          : (d?.imageUrl
            ? <PreviewImage src={d.imageUrl} />
            : <NoImage />)}
        <div className="flex items-center justify-between gap-2 border-t border-(--line) px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs text-(--muted-2)">{d?.destinationUrl || 'yoursite.com'}</div>
            <div className="truncate text-sm font-semibold text-(--txt)">{d?.headline || 'Your headline'}</div>
          </div>
          <span className="shrink-0 rounded bg-(--surface-2) px-2 py-1 text-xs text-(--txt)">{friendlyCta(d?.cta ?? 'LEARN_MORE')}</span>
        </div>
      </div>
    </div>
  );
}
