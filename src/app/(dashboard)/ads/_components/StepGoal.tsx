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
  const [appsTokenExpired, setAppsTokenExpired] = useState(false);
  const [applicationId, setApplicationId] = useState<string>('');

  const isApp = props.objective === 'APP';

  // Fetch promotable apps once when APP objective is selected
  useEffect(() => {
    if (!isApp) return;
    let cancelled = false;
    setAppsLoading(true);
    fetch('/api/meta/apps')
      .then((r) => r.json())
      .then((json: { success?: boolean; apps?: AdvertisableApp[]; tokenExpired?: boolean }) => {
        if (!cancelled) {
          setAppsTokenExpired(Boolean(json.tokenExpired));
          setApps(json.apps ?? []);
        }
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
        <label className="mb-1 block text-sm font-medium text-(--muted)">Brand</label>
        <select value={props.brandId} onChange={(e) => props.setBrandId(e.target.value)}
          className="w-full select-field">
          {props.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-(--muted)">Goal</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(OBJECTIVE_CONFIG) as AdObjective[]).filter((key) => key !== 'APP').map((key) => {
            const c = OBJECTIVE_CONFIG[key];
            const active = props.objective === key;
            return (
              <button key={key} type="button" onClick={() => props.setObjective(key)}
                className={`rounded-2xl border p-3 text-left ${active ? 'border-(--violet-24) bg-(--violet-08)' : 'border-(--line-strong) bg-(--surface)'}`}>
                <div className="text-sm font-semibold text-(--txt)">{c.label}</div>
                <div className="mt-1 text-xs text-(--muted)">{c.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {isApp && (
        <div>
          <label className="mb-1 block text-sm font-medium text-(--muted)">App</label>
          {appsLoading ? (
            <p className="text-sm text-(--muted)">Loading apps…</p>
          ) : appsTokenExpired ? (
            <p className="text-sm text-(--muted)">
              Your Meta connection has expired. Reconnect to load your apps.{' '}
              <a href="/api/meta/oauth/start" className="text-(--violet-bright) hover:text-(--violet) underline">
                Reconnect Meta
              </a>
            </p>
          ) : apps.length === 0 ? (
            <p className="text-sm text-(--muted)">
              No promotable apps found on your ad account. Add your iOS app in Meta
              (Business Settings → Apps) and associate it with your App Store listing,
              then come back.
            </p>
          ) : (
            <select
              value={applicationId}
              onChange={(e) => handleAppSelect(e.target.value)}
              className="w-full select-field"
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
        <label className="mb-1 block text-sm font-medium text-(--muted)">
          {isApp ? 'App Store URL' : 'Destination URL'}
        </label>
        <input
          value={props.destinationUrl}
          onChange={(e) => props.setDestinationUrl(e.target.value)}
          placeholder={isApp ? 'https://apps.apple.com/...' : 'https://yoursite.com/offer'}
          className="w-full rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt)"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="button" onClick={generate} disabled={loading}
        className="rounded-2xl bg-(--violet) px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? 'Generating…' : 'Generate ad'}
      </button>
    </div>
  );
}
