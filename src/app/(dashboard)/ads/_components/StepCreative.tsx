// src/app/(dashboard)/ads/_components/StepCreative.tsx
'use client';

import { useRef, useState } from 'react';
import { HEADLINE_MAX, type AdDraft } from '@/lib/meta/ads-types';

export function StepCreative(props: {
  draft: AdDraft;
  setDraft: (d: AdDraft) => void;
  onBack: () => void;
  onNext: () => void;
  candidates: string[];
  imageMissing: boolean;
}) {
  const { draft, setDraft } = props;
  const set = <K extends keyof AdDraft>(k: K, v: AdDraft[K]) => setDraft({ ...draft, [k]: v });

  const [extraUploads, setExtraUploads] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allCandidates = [...extraUploads, ...props.candidates];

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/ads/upload-image', { method: 'POST', body: formData });
      const json = await res.json() as { url?: string; error?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Upload failed');
      const url = json.url;
      if (!url) throw new Error('No URL returned from upload');
      setExtraUploads((prev) => [url, ...prev]);
      setDraft({ ...draft, imageUrl: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      // reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Primary text">
        <textarea value={draft.primaryText} onChange={(e) => set('primaryText', e.target.value)} rows={6}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label={`Headline (${draft.headline.length}/${HEADLINE_MAX})`}>
        <input value={draft.headline} maxLength={HEADLINE_MAX}
          onChange={(e) => set('headline', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label="Hook">
        <input value={draft.hook} onChange={(e) => set('hook', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label="Hashtags (space-separated)">
        <input value={draft.hashtags.join(' ')}
          onChange={(e) => set('hashtags', e.target.value.split(/\s+/).map((t) => t.replace(/^#+/, '')).filter(Boolean).map((t) => `#${t}`).slice(0, 5))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Image</label>

        {props.imageMissing && props.candidates.length === 0 && extraUploads.length === 0 && (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            We couldn&apos;t auto-pick an image. Upload one or paste an image URL below.
          </p>
        )}

        {allCandidates.length > 0 && (
          <div className="mb-3 grid grid-cols-4 gap-2">
            {allCandidates.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => set('imageUrl', url)}
                className={`overflow-hidden rounded aspect-square ${draft.imageUrl === url ? 'ring-2 ring-teal-400' : ''}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload your own'}
          </button>
          {uploadError && <span className="text-sm text-red-400">{uploadError}</span>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <input value={draft.imageUrl} onChange={(e) => set('imageUrl', e.target.value)}
          placeholder="https://example.com/image.jpg"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Back</button>
        <button type="button" onClick={props.onNext} disabled={!draft.imageUrl || !draft.primaryText}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-300">{props.label}</label>
      {props.children}
    </div>
  );
}
