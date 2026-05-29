// src/app/(dashboard)/ads/_components/StepReview.tsx
'use client';

import { useState } from 'react';
import type { AdDraft, AdTargeting } from '@/lib/meta/ads-types';

interface MetaAsset { id: string; name?: string; currency?: string }

export function StepReview(props: {
  draft: AdDraft; targeting: AdTargeting; brandId: string;
  adAccounts: MetaAsset[]; pages: MetaAsset[]; onBack: () => void;
}) {
  const [adAccountId, setAdAccountId] = useState(props.adAccounts[0]?.id ?? '');
  const [pageId, setPageId] = useState(props.pages[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ adsManagerUrl: string } | null>(null);

  async function publish() {
    setError(null); setSubmitting(true);
    try {
      const res = await fetch('/api/ads/publish', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: props.brandId, adAccountId, pageId,
          draft: props.draft, targeting: props.targeting,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Publish failed');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4 rounded-xl border border-teal-700 bg-teal-500/10 p-6">
        <h2 className="text-lg font-semibold text-teal-200">Paused ad created</h2>
        <p className="text-sm text-zinc-300">Your ad is in Meta as a PAUSED campaign. It will not spend until you turn it on.</p>
        <a href={result.adsManagerUrl} target="_blank" rel="noreferrer"
          className="inline-block rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white">Open in Ads Manager</a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Ad account</label>
          <select value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            {props.adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id}{a.currency ? ` (${a.currency})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Facebook Page</label>
          <select value={pageId} onChange={(e) => setPageId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            {props.pages.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
          </select>
        </div>
      </div>

      <dl className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <Row k="Goal" v={props.draft.objective} />
        <Row k="Headline" v={props.draft.headline} />
        <Row k="Destination" v={props.draft.destinationUrl} />
        <Row k="Countries" v={props.targeting.countries.join(', ')} />
        <Row k="Age" v={`${props.targeting.ageMin}–${props.targeting.ageMax}`} />
        <Row k="Daily budget (minor)" v={String(props.targeting.dailyBudgetMinor)} />
      </dl>

      <div className="rounded-lg border border-amber-700 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        This will create a <strong>PAUSED</strong> ad. It won&apos;t spend until you turn it on in Ads Manager.
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Back</button>
        <button type="button" onClick={publish} disabled={submitting || !adAccountId || !pageId}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Creating…' : 'Create Paused Ad'}
        </button>
      </div>
    </div>
  );
}

function Row(props: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-zinc-800 py-1.5 last:border-0">
      <dt className="text-zinc-500">{props.k}</dt>
      <dd className="max-w-[60%] truncate text-zinc-200">{props.v}</dd>
    </div>
  );
}
