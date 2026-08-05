// src/app/(dashboard)/ads/_components/AdDashboardCard.tsx
'use client';

import { useState } from 'react';

interface Insight {
  spend: number; impressions: number; reach: number; clicks: number;
  ctr: number; cpc: number; frequency: number; results: number; resultType: string; currency: string | null;
}
export interface DashboardAd {
  id: string; adId: string | null; objective: string; status: string;
  adsManagerUrl: string | null; lastError: string | null;
  preview: { headline: string | null; primaryText: string | null; imageUrl: string | null; thumbnailUrl: string | null; mediaType: string; cta: string; destinationUrl: string | null };
  insight: Insight | null;
  ctrTrend: { direction: 'up' | 'down' | 'flat'; delta: number | null } | null;
  signals: { verdict: 'gathering' | 'working' | 'watch' | 'not'; reasons: string[]; tips: string[] };
}

const VERDICT_STYLES: Record<string, string> = {
  working: 'bg-green-500/15 text-green-300',
  watch: 'bg-amber-500/15 text-amber-300',
  not: 'bg-red-500/15 text-red-300',
  gathering: 'bg-white/5 text-(--muted)',
};

function Metric(props: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  const tone = props.tone === 'up' ? 'text-green-400' : props.tone === 'down' ? 'text-red-400' : 'text-(--txt)';
  return (
    <div>
      <div className="text-xs text-(--muted)">{props.label}</div>
      <div className={`text-lg font-bold ${tone}`}>{props.value}</div>
      {props.hint && <div className="text-xs text-(--muted)">{props.hint}</div>}
    </div>
  );
}

export function AdDashboardCard({ ad }: { ad: DashboardAd }) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState<string | null>(null);

  async function activate() {
    if (activating || !ad.adId) return;
    // Explicit confirmation: everything else in this app is reversible, this
    // one starts real spend against the ad set budget.
    if (!window.confirm(`Activate this ad? It will begin spending against its ad set budget immediately.`)) return;
    setActivating(true);
    setActivateMsg(null);
    try {
      const res = await fetch(`/api/ads/activate?adId=${encodeURIComponent(ad.adId)}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      setActivateMsg(res.ok ? (body.message ?? 'Ad is now active.') : (body.message ?? `Failed: ${res.status}`));
    } catch (e) {
      setActivateMsg(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setActivating(false);
    }
  }
  const i = ad.insight;
  const cur = i?.currency ?? '';
  const trendTone = ad.ctrTrend?.direction === 'up' ? 'up' : ad.ctrTrend?.direction === 'down' ? 'down' : undefined;

  async function askAi() {
    setLoading(true);
    try {
      const res = await fetch('/api/ads/advice', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adId: ad.id }),
      });
      // Status is checked BEFORE parsing: an edge 502/504 returns an HTML
      // body, and awaiting .json() on it would throw into the generic catch,
      // losing the very status this check exists to report.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        setAdvice(`Could not get advice right now: ${body.error ?? `error ${res.status}`}`);
        return;
      }
      const json = await res.json();
      // Previously `json.advice ?? json.error`, so a 500's error string was
      // rendered in the advice box as if the AI had written it.
      setAdvice(json.advice ?? 'No advice available.');
    } catch {
      setAdvice('Could not load advice right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-(--line) bg-(--bg) p-4 md:flex-row">
      <div className="w-full shrink-0 overflow-hidden rounded-xl border border-(--line) md:w-56">
        {ad.preview.imageUrl || ad.preview.thumbnailUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={(ad.preview.thumbnailUrl || ad.preview.imageUrl) as string} alt="Ad" className="aspect-[1.91/1] w-full object-cover" />
          : <div className="flex aspect-[1.91/1] items-center justify-center bg-(--surface-2) text-xs text-(--muted-2)">No image</div>}
        <div className="p-3">
          <div className="text-xs text-(--muted-2)">{ad.preview.destinationUrl ?? 'yoursite.com'} · Sponsored</div>
          <div className="text-sm font-semibold text-(--txt)">{ad.preview.headline ?? 'Your headline'}</div>
          {ad.preview.primaryText && <div className="mt-1 line-clamp-3 text-xs text-(--muted)">{ad.preview.primaryText}</div>}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-(--surface-2) px-2 py-1">{ad.status}</span>
          <span className="text-(--muted-2)">{ad.objective.replace('OUTCOME_', '')}</span>
          {ad.adsManagerUrl && ad.status !== 'FAILED' && ad.status !== 'ARCHIVED' && <a className="ml-auto text-(--accent)" href={ad.adsManagerUrl} target="_blank" rel="noreferrer">Open in Ads Manager ↗</a>}
        </div>

        {i ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <Metric label="Spent" value={`${cur} ${i.spend.toFixed(2)}`} />
            <Metric label="Times shown" value={i.impressions.toLocaleString()} hint="Including repeats" />
            <Metric label="Clicks" value={i.clicks.toLocaleString()} />
            <Metric label="Click rate" value={`${i.ctr.toFixed(2)}%`} hint="Of everyone who saw it" tone={trendTone} />
            <Metric label="Cost per click" value={`${cur} ${i.cpc.toFixed(2)}`} />
            <Metric label="People reached" value={i.reach.toLocaleString()} hint="Different people" />
            <Metric label="Times seen each" value={i.frequency.toFixed(1)} hint="Average per person" />
            <Metric
              label={`Results (${(i.resultType || 'result').replace(/_/g, ' ')})`}
              value={i.results.toLocaleString()}
            />
          </div>
        ) : (
          <p className="text-sm text-(--muted)">Nothing to show yet. Numbers appear here once Meta starts reporting on this ad.</p>
        )}

        <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${VERDICT_STYLES[ad.signals.verdict]}`}>
          {ad.signals.reasons.join(' ')}
        </div>
        {ad.signals.tips.length > 0 && (
          <div className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-(--txt)">
            💡 {ad.signals.tips.join(' ')}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={askAi} disabled={loading} className="rounded bg-(--accent) px-2 py-1 text-xs text-white disabled:opacity-50">
            {loading ? 'Thinking…' : '✨ Ask AI for advice'}
          </button>
          {/* Only PAUSED ads can be started. This is the one control in the app
              that causes Meta to spend money, so it confirms first and says so. */}
          {ad.status === 'PAUSED' && ad.adId && (
            <button
              onClick={activate}
              disabled={activating}
              className="rounded border border-(--success)/50 bg-(--success)/10 px-2 py-1 text-xs text-(--success) disabled:opacity-50"
            >
              {activating ? 'Starting…' : '▶ Activate (starts spending)'}
            </button>
          )}
        </div>
        {activateMsg && (
          <div className="mt-2 rounded-lg border border-(--line) px-3 py-2 text-xs text-(--txt)">{activateMsg}</div>
        )}
        {advice && <div className="mt-2 whitespace-pre-wrap rounded-lg border border-(--line) px-3 py-2 text-sm text-(--txt)">{advice}</div>}
      </div>
    </div>
  );
}
