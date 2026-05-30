// src/app/(dashboard)/ads/_components/StepGoal.tsx
'use client';

import { useState, useEffect } from 'react';
import { OBJECTIVE_CONFIG, type AdDraft, type AdObjective } from '@/lib/meta/ads-types';

interface BrandLite { id: string; name: string; slug: string }

interface AdvertisableApp {
  id: string;
  name: string;
  iosUrl: string | null;
}

export function StepGoal(props: {
  brands: BrandLite[];
  brandId: string; setBrandId: (v: string) => void;
  objective: AdObjective; setObjective: (v: AdObjective) => void;
  destinationUrl: string; setDestinationUrl: (v: string) => void;
  onDraft: (draft: AdDraft, candidates: string[], imageMissing: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // APP-objective state
  const [apps, setApps] = useState<AdvertisableApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [applicationId, setApplicationId] = useState<string>('');

  const isApp = props.objective === 'APP';

  // Fetch promotable apps once when APP objective is selected
  useEffect(() => {
    if (!isApp) return;
    let cancelled = false;
    setAppsLoading(true);
    fetch('/api/meta/apps')
      .then((r) => r.json())
      .then((json: { success?: boolean; apps?: AdvertisableApp[] }) => {
        if (!cancelled) setApps(json.apps ?? []);
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      })
      .finally(() => {
        if (!cancelled) setAppsLoading(false);
      });
    return () => { cancelled = true; };
  }, [isApp]);

  // When user picks an app, auto-fill the URL field if the app has an iosUrl
  function handleAppSelect(appId: string) {
    setApplicationId(appId);
    if (!appId) return;
    const app = apps.find((a) => a.id === appId);
    if (app?.iosUrl) props.setDestinationUrl(app.iosUrl);
  }

  async function generate() {
    setError(null);
    if (!props.brandId) return setError('Pick a brand.');

    if (isApp) {
      if (!applicationId) return setError('Select an app from the picker.');
      if (!/^https:\/\/apps\.apple\.com\//.test(props.destinationUrl)) {
        return setError('Enter a valid App Store URL (https://apps.apple.com/...).');
      }
    } else {
      if (!/^https?:\/\//.test(props.destinationUrl)) return setError('Enter a valid URL (https://...).');
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        brandId: props.brandId,
        objective: props.objective,
        destinationUrl: props.destinationUrl,
      };
      if (isApp && applicationId) body.applicationId = applicationId;

      const res = await fetch('/api/ads/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Generation failed');
      props.onDraft(json.draft as AdDraft, json.imageCandidates ?? [], Boolean(json.imageMissing));
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

      {isApp && (
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">App</label>
          {appsLoading ? (
            <p className="text-sm text-zinc-400">Loading apps…</p>
          ) : apps.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No promotable apps found on your ad account. Add your iOS app in Meta
              (Business Settings → Apps) and associate it with your App Store listing,
              then come back.
            </p>
          ) : (
            <select
              value={applicationId}
              onChange={(e) => handleAppSelect(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Select an app…</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          {isApp ? 'App Store URL' : 'Destination URL'}
        </label>
        <input
          value={props.destinationUrl}
          onChange={(e) => props.setDestinationUrl(e.target.value)}
          placeholder={isApp ? 'https://apps.apple.com/...' : 'https://yoursite.com/offer'}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="button" onClick={generate} disabled={loading}
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? 'Generating…' : 'Generate ad'}
      </button>
    </div>
  );
}
