// src/app/(dashboard)/ads/_components/StepCreative.tsx
'use client';

import { HEADLINE_MAX, type AdDraft } from '@/lib/meta/ads-types';

export function StepCreative(props: {
  draft: AdDraft; setDraft: (d: AdDraft) => void; onBack: () => void; onNext: () => void;
}) {
  const { draft, setDraft } = props;
  const set = <K extends keyof AdDraft>(k: K, v: AdDraft[K]) => setDraft({ ...draft, [k]: v });

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
          onChange={(e) => set('hashtags', (e.target.value.match(/#\w+/g) ?? []).slice(0, 5))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label="Image URL">
        <input value={draft.imageUrl} onChange={(e) => set('imageUrl', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

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
