// src/app/(dashboard)/ads/_components/StepCreative.tsx
'use client';

import { useRef, useState } from 'react';
import { HEADLINE_MAX, type AdDraft } from '@/lib/meta/ads-types';

type SuggestField = 'primaryText' | 'hook' | 'headline' | 'hashtags';

export function StepCreative(props: {
  draft: AdDraft;
  setDraft: (d: AdDraft) => void;
  brandId: string;
  onBack: () => void;
  onNext: () => void;
  candidates: string[];
  imageMissing: boolean;
}) {
  const { draft, setDraft } = props;
  const set = <K extends keyof AdDraft>(k: K, v: AdDraft[K]) => setDraft({ ...draft, [k]: v });

  const mediaType = draft.mediaType ?? 'image';
  const isVideo = mediaType === 'video';

  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  async function handleRegenerateAll() {
    setRegenError(null);
    setRegenerating(true);
    try {
      const res = await fetch('/api/ads/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: props.brandId,
          objective: draft.objective,
          destinationUrl: draft.destinationUrl,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        primaryText?: string;
        hook?: string;
        headline?: string;
        hashtags?: string[];
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Failed to regenerate copy');
      if (!json.primaryText) throw new Error('No copy returned');
      // Preserve the user's media — update only copy fields.
      setDraft({
        ...draft,
        primaryText: json.primaryText,
        hook: json.hook ?? draft.hook,
        headline: json.headline ?? draft.headline,
        hashtags: json.hashtags ?? draft.hashtags,
      });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Failed to regenerate copy');
    } finally {
      setRegenerating(false);
    }
  }

  function applySuggestion(field: SuggestField, option: string) {
    if (field === 'hashtags') {
      set('hashtags', (option.match(/#\w+/g) ?? []).slice(0, 5));
    } else {
      set(field, option);
    }
  }

  async function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);
    setVideoUploading(true);
    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await fetch('/api/ads/upload-video', { method: 'POST', body: formData });
      const json = await res.json() as { url?: string; videoId?: string; error?: string; message?: string };
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Upload failed');
      const url = json.url;
      if (!url || !json.videoId) throw new Error('Video upload did not complete processing');
      setDraft({ ...draft, videoUrl: url, videoId: json.videoId });
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setVideoUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }

  const canNext = isVideo
    ? Boolean(draft.videoUrl) && Boolean(draft.videoId) && /^https?:\/\//.test(draft.thumbnailUrl ?? '') && Boolean(draft.primaryText)
    : /^https?:\/\//.test(draft.imageUrl) && Boolean(draft.primaryText);

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Media type</label>
        <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
          <button
            type="button"
            onClick={() => set('mediaType', 'image')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${!isVideo ? 'bg-teal-500 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
          >
            Photo
          </button>
          <button
            type="button"
            onClick={() => set('mediaType', 'video')}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${isVideo ? 'bg-teal-500 text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
          >
            Video
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleRegenerateAll}
          disabled={regenerating}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-teal-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {regenerating ? 'Regenerating…' : '✨ Regenerate all copy'}
        </button>
        {regenError && <span className="text-sm text-red-400">{regenError}</span>}
      </div>

      <Field
        label="Primary text"
        action={
          <SuggestButton
            field="primaryText"
            brandId={props.brandId}
            draft={draft}
            current={draft.primaryText}
            onApply={(opt) => applySuggestion('primaryText', opt)}
          />
        }
      >
        <textarea value={draft.primaryText} onChange={(e) => set('primaryText', e.target.value)} rows={6}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field
        label={`Headline (${draft.headline.length}/${HEADLINE_MAX})`}
        action={
          <SuggestButton
            field="headline"
            brandId={props.brandId}
            draft={draft}
            current={draft.headline}
            onApply={(opt) => applySuggestion('headline', opt)}
          />
        }
      >
        <input value={draft.headline} maxLength={HEADLINE_MAX}
          onChange={(e) => set('headline', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field
        label="Hook"
        action={
          <SuggestButton
            field="hook"
            brandId={props.brandId}
            draft={draft}
            current={draft.hook}
            onApply={(opt) => applySuggestion('hook', opt)}
          />
        }
      >
        <input value={draft.hook} onChange={(e) => set('hook', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field
        label="Hashtags (space-separated)"
        action={
          <SuggestButton
            field="hashtags"
            brandId={props.brandId}
            draft={draft}
            current={draft.hashtags.join(' ')}
            onApply={(opt) => applySuggestion('hashtags', opt)}
          />
        }
      >
        <input value={draft.hashtags.join(' ')}
          onChange={(e) => set('hashtags', e.target.value.split(/\s+/).map((t) => t.replace(/^#+/, '')).filter(Boolean).map((t) => `#${t}`).slice(0, 5))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      {isVideo ? (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">Video</label>
            <div className="mb-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={videoUploading}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {videoUploading ? 'Uploading & processing…' : 'Upload video'}
              </button>
              {videoError && <span className="text-sm text-red-400">{videoError}</span>}
            </div>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime"
              className="hidden"
              onChange={handleVideoChange}
            />
            {draft.videoUrl && (
              <video src={draft.videoUrl} controls className="w-full rounded-lg" />
            )}
          </div>

          <ImageChooser
            label="Poster image (thumbnail)"
            value={draft.thumbnailUrl ?? ''}
            onChange={(url) => set('thumbnailUrl', url)}
            candidates={props.candidates}
            imageMissing={props.imageMissing}
          />
        </>
      ) : (
        <ImageChooser
          label="Image"
          value={draft.imageUrl}
          onChange={(url) => set('imageUrl', url)}
          candidates={props.candidates}
          imageMissing={props.imageMissing}
        />
      )}

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Back</button>
        <button type="button" onClick={props.onNext} disabled={!canNext}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

function ImageChooser(props: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  candidates: string[];
  imageMissing: boolean;
}) {
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
      props.onChange(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      // reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-300">{props.label}</label>

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
              onClick={() => props.onChange(url)}
              className={`overflow-hidden rounded aspect-square ${props.value === url ? 'ring-2 ring-teal-400' : ''}`}
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
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <input value={props.value} onChange={(e) => props.onChange(e.target.value)}
        placeholder="https://example.com/image.jpg"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
    </div>
  );
}

function Field(props: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-zinc-300">{props.label}</label>
        {props.action}
      </div>
      {props.children}
    </div>
  );
}

function SuggestButton(props: {
  field: SuggestField;
  brandId: string;
  draft: AdDraft;
  current: string;
  onApply: (option: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<string[] | null>(null);

  async function handleSuggest() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ads/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: props.brandId,
          objective: props.draft.objective,
          field: props.field,
          destinationUrl: props.draft.destinationUrl,
          current: props.current,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        options?: string[];
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.options) {
        throw new Error(json.message ?? json.error ?? 'Failed to get suggestions');
      }
      setOptions(json.options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleSuggest}
        disabled={loading}
        className="text-xs font-medium text-teal-300 hover:text-teal-200 disabled:opacity-50"
      >
        {loading ? '…' : '✨ Suggest'}
      </button>

      {error && <span className="ml-2 text-xs text-red-400">{error}</span>}

      {options && (
        <div className="absolute right-0 z-10 mt-1 w-80 max-w-[80vw] rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Viral suggestions</span>
            <button
              type="button"
              onClick={() => setOptions(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
              aria-label="Dismiss suggestions"
            >
              ✕
            </button>
          </div>
          <ul className="space-y-1">
            {options.map((opt, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    props.onApply(opt);
                    setOptions(null);
                  }}
                  className="w-full rounded border border-zinc-700 px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-teal-500 hover:bg-zinc-800"
                >
                  {props.field === 'primaryText' && opt.length > 140
                    ? `${opt.slice(0, 140)}…`
                    : opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
