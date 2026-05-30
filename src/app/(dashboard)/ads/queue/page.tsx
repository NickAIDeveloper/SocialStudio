// src/app/(dashboard)/ads/queue/page.tsx
'use client';

import { useEffect, useState } from 'react';

// Shape returned by GET /api/ads/list. Kept local + explicit so the fetch JSON
// is typed (the project errors on `any`).
interface QueuedAd {
  id: string;
  objective: string;
  status: string;
  liveStatus: string | null;
  createdAt: string;
  adsManagerUrl: string | null;
  headline: string | null;
  primaryText: string;
  mediaType: string;
  lastError: string | null;
}

interface AdsListResponse {
  success: boolean;
  ads: QueuedAd[];
}

// metaAds.objective stores Meta's ODAX objective string (cfg.metaObjective),
// not our short AdObjective key — so map the OUTCOME_* values.
const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_TRAFFIC: 'Traffic',
  OUTCOME_ENGAGEMENT: 'Engagement',
  OUTCOME_LEADS: 'Leads',
  OUTCOME_APP_PROMOTION: 'App installs',
};

function objectiveLabel(objective: string): string {
  return OBJECTIVE_LABELS[objective] ?? objective;
}

type BadgeTone = 'zinc' | 'amber' | 'teal' | 'red';

interface StatusBadge {
  label: string;
  tone: BadgeTone;
}

const BADGE_TONES: Record<BadgeTone, string> = {
  zinc: 'border-(--line-strong) bg-(--surface-2)/60 text-(--muted)',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  teal: 'border-(--violet-24) bg-(--violet-08) text-(--violet-bright)',
  red: 'border-red-500/40 bg-red-500/10 text-red-300',
};

// Map Meta's effective_status (liveStatus) to a friendly label + colour,
// falling back to the stored status when liveStatus is null.
function statusBadge(ad: QueuedAd): StatusBadge {
  const effective = ad.liveStatus;

  switch (effective) {
    case 'PAUSED':
    case 'ADSET_PAUSED':
    case 'CAMPAIGN_PAUSED':
      return { label: 'Paused — ready for review', tone: 'zinc' };
    case 'PENDING_REVIEW':
    case 'IN_PROCESS':
    case 'PREAPPROVED':
      return { label: 'In Meta review', tone: 'amber' };
    case 'ACTIVE':
      return { label: 'Active', tone: 'teal' };
    case 'DISAPPROVED':
    case 'WITH_ISSUES':
      return { label: 'Rejected — needs attention', tone: 'red' };
    case 'ARCHIVED':
    case 'DELETED':
      return { label: 'Archived', tone: 'zinc' };
    default:
      break;
  }

  // No live status — fall back to the stored status.
  switch (ad.status) {
    case 'PAUSED':
      return { label: 'Paused — ready for review', tone: 'zinc' };
    case 'FAILED':
      return { label: 'Creation failed', tone: 'red' };
    default:
      return { label: ad.status, tone: 'zinc' };
  }
}

function mediaChip(mediaType: string): string {
  return mediaType === 'video' ? '🎬 Video' : '📷 Photo';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AdCard({ ad }: { ad: QueuedAd }) {
  const badge = statusBadge(ad);
  const isFailed = ad.liveStatus == null && ad.status === 'FAILED';

  return (
    <div className="rounded-2xl border border-(--line) bg-(--bg) p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-(--muted-2)">
              {objectiveLabel(ad.objective)}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_TONES[badge.tone]}`}
            >
              {badge.label}
            </span>
            <span className="rounded-md border border-(--line) bg-(--surface) px-2 py-0.5 text-[11px] text-(--muted)">
              {mediaChip(ad.mediaType)}
            </span>
          </div>

          <h3 className="mt-2 truncate text-sm font-semibold text-(--txt)">
            {ad.headline ?? 'Untitled ad'}
          </h3>
          {ad.primaryText && (
            <p className="mt-1 line-clamp-2 text-sm text-(--muted)">{ad.primaryText}</p>
          )}

          {isFailed && ad.lastError && (
            <p className="mt-2 text-xs text-red-400">{ad.lastError}</p>
          )}

          <p className="mt-2 text-[11px] text-(--muted-2)">{formatDate(ad.createdAt)}</p>
        </div>

        {ad.adsManagerUrl && (
          <a
            href={ad.adsManagerUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 self-center rounded-2xl bg-(--violet) px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-(--violet-bright)"
          >
            Review in Ads Manager →
          </a>
        )}
      </div>
    </div>
  );
}

export default function QueuedAdsPage() {
  const [ads, setAds] = useState<QueuedAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/ads/list')
      .then(async (r) => {
        if (!r.ok) throw new Error('Failed to load your queued ads.');
        return (await r.json()) as AdsListResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setAds(data.ads ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Queued ads</h1>
          <p className="mt-1 max-w-xl text-sm text-(--muted)">
            Ads you&apos;ve created in Meta. Each is PAUSED and waiting for your review —
            open it in Ads Manager to approve and turn it live.
          </p>
        </div>
        <a
          href="/ads"
          className="shrink-0 text-sm font-medium text-(--violet-bright) transition-colors hover:text-(--violet)"
        >
          ← Back to ad builder
        </a>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && ads === null && (
        <div className="py-16 text-center text-sm text-(--muted)">Loading…</div>
      )}

      {!error && ads !== null && ads.length === 0 && (
        <div className="mx-auto max-w-md rounded-2xl border border-(--line) bg-(--bg) p-8 text-center">
          <p className="text-sm text-(--muted)">No ads queued yet.</p>
          <a
            href="/ads"
            className="mt-4 inline-block rounded-2xl bg-(--violet) px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-(--violet-bright)"
          >
            Create an ad
          </a>
        </div>
      )}

      {!error && ads !== null && ads.length > 0 && (
        <div className="space-y-3">
          {ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </div>
  );
}
