// src/app/(dashboard)/ads/_components/StepGoal.tsx
'use client';

import { useState } from 'react';
import { OBJECTIVE_CONFIG, type AdDraft, type AdObjective } from '@/lib/meta/ads-types';

interface BrandLite { id: string; name: string; slug: string }

export function StepGoal(props: {
  brands: BrandLite[];
  brandId: string; setBrandId: (v: string) => void;
  objective: AdObjective; setObjective: (v: AdObjective) => void;
  destinationUrl: string; setDestinationUrl: (v: string) => void;
  onDraft: (draft: AdDraft) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    if (!props.brandId) return setError('Pick a brand.');
    if (!/^https?:\/\//.test(props.destinationUrl)) return setError('Enter a valid URL (https://...).');
    setLoading(true);
    try {
      const res = await fetch('/api/ads/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: props.brandId, objective: props.objective, destinationUrl: props.destinationUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Generation failed');
      props.onDraft(json.draft as AdDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Brand</label>
        <select value={props.brandId} onChange={(e) => props.setBrandId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          {props.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Goal</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(OBJECTIVE_CONFIG) as AdObjective[]).map((key) => {
            const c = OBJECTIVE_CONFIG[key];
            const active = props.objective === key;
            return (
              <button key={key} type="button" onClick={() => props.setObjective(key)}
                className={`rounded-lg border p-3 text-left ${active ? 'border-teal-500 bg-teal-500/10' : 'border-zinc-700 bg-zinc-900'}`}>
                <div className="text-sm font-semibold text-zinc-100">{c.label}</div>
                <div className="mt-1 text-xs text-zinc-400">{c.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Destination URL</label>
        <input value={props.destinationUrl} onChange={(e) => props.setDestinationUrl(e.target.value)}
          placeholder="https://yoursite.com/offer"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="button" onClick={generate} disabled={loading}
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? 'Generating…' : 'Generate ad'}
      </button>
    </div>
  );
}
