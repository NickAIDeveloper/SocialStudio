'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

// ── Module-level client cache ─────────────────────────────────────────────────

const CLIENT_CACHE_TTL_MS = 15 * 60 * 1000;

interface ClientCacheEntry {
  profile: DeepProfile;
  fetchedAt: number;
}

const clientCache = new Map<string, ClientCacheEntry>();

// ── Relative time helper ──────────────────────────────────────────────────────

function relativeTime(fetchedAt: number): string {
  const diffMs = Date.now() - fetchedAt;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FormatTable({ rows }: { rows: DeepProfile['formatPerformance'] }) {
  const maxLift = Math.max(...rows.map((r) => r.liftVsOverall));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--line-strong) text-left text-(--muted)">
            <th className="pb-2 pr-4 font-medium">Format</th>
            <th className="pb-2 pr-4 font-medium">Posts</th>
            <th className="pb-2 pr-4 font-medium">Median reach</th>
            <th className="pb-2 pr-4 font-medium">Median saves</th>
            <th className="pb-2 pr-4 font-medium">Median shares</th>
            <th className="pb-2 font-medium">Lift vs overall</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isTop = r.liftVsOverall === maxLift && r.count > 0;
            return (
              <tr
                key={r.format}
                className={`border-b border-(--line) ${isTop ? 'bg-(--success)/10' : ''}`}
              >
                <td className="py-2 pr-4 font-medium text-(--txt)">{r.format}</td>
                <td className="py-2 pr-4 text-(--muted)">{r.count}</td>
                <td className="py-2 pr-4 text-(--muted)">{r.medianReach.toLocaleString()}</td>
                <td className="py-2 pr-4 text-(--muted)">{r.medianSaves.toLocaleString()}</td>
                <td className="py-2 pr-4 text-(--muted)">{r.medianShares.toLocaleString()}</td>
                <td className="py-2 text-(--muted)">
                  {r.liftVsOverall.toFixed(2)}x
                  {isTop && (
                    <span className="ml-2 rounded bg-(--success)/20 px-1.5 py-0.5 text-xs text-(--success)">
                      Best
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CaptionBars({ data }: { data: DeepProfile['captionLengthSweetSpot'] }) {
  const values = [data.shortMedian, data.mediumMedian, data.longMedian];
  const maxVal = Math.max(...values, 1);
  const labels: Array<{ key: 'short' | 'medium' | 'long'; label: string; value: number }> = [
    { key: 'short', label: 'Short (up to 80 chars)', value: data.shortMedian },
    { key: 'medium', label: 'Medium (81 to 250 chars)', value: data.mediumMedian },
    { key: 'long', label: 'Long (over 250 chars)', value: data.longMedian },
  ];
  return (
    <div className="space-y-3">
      {labels.map(({ key, label, value }) => {
        const isWinner = data.winner === key;
        const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
        return (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-(--muted)">{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-(--muted)">{value.toLocaleString()} reach</span>
                {isWinner && (
                  <span className="rounded bg-(--success)/20 px-1.5 py-0.5 text-xs text-(--success)">
                    Winner
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-(--surface-2)">
              <div
                className={`h-2 rounded-full transition-all ${isWinner ? 'bg-(--violet)' : 'bg-(--muted-2)'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HookCards({ patterns }: { patterns: DeepProfile['hookPatterns'] }) {
  if (patterns.length === 0) {
    return <p className="text-sm text-(--muted-2)">Not enough data to detect hook patterns.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {patterns.map((p) => {
        const example = p.exampleCaptions[0] ?? '';
        const excerpt = example.length > 80 ? `${example.slice(0, 80)}...` : example;
        return (
          <div key={p.pattern} className="rounded-lg border border-(--line) bg-(--surface-2) p-3">
            <p className="mb-1 font-medium text-(--txt)">{p.pattern}</p>
            <p className="mb-2 text-xs text-(--muted-2) italic">{excerpt}</p>
            <div className="flex gap-4 text-xs text-(--muted)">
              <span>Avg reach: {p.avgReach.toFixed(0)}</span>
              <span>Used {p.occurrences} times</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopicChips({ tags, label }: { tags: string[]; label: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-(--muted-2)">{label}</p>
      {tags.length === 0 ? (
        <p className="text-sm text-(--muted-2)">None detected</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-(--surface-2) px-2.5 py-1 text-xs text-(--muted)"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AudienceBlock({ audience }: { audience: NonNullable<DeepProfile['audience']> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-(--muted-2)">
          Top countries
        </p>
        <ul className="space-y-1">
          {audience.topCountries.map((c) => (
            <li key={c.code} className="flex justify-between text-sm text-(--muted)">
              <span>{c.code}</span>
              <span className="text-(--muted-2)">{(c.share * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-(--muted-2)">
          Top cities
        </p>
        <ul className="space-y-1">
          {audience.topCities.map((c) => (
            <li key={c.name} className="flex justify-between text-sm text-(--muted)">
              <span>{c.name}</span>
              <span className="text-(--muted-2)">{(c.share * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-(--muted-2)">
          Age and gender
        </p>
        <ul className="space-y-1">
          {audience.ageGenderMix.map((a) => (
            <li key={a.bucket} className="flex justify-between text-sm text-(--muted)">
              <span>{a.bucket}</span>
              <span className="text-(--muted-2)">{(a.share * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DeepProfileSectionProps {
  igUserId: string;
}

export function DeepProfileSection({ igUserId }: DeepProfileSectionProps) {
  const [profile, setProfile] = useState<DeepProfile | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchProfile(bypass = false) {
    if (!bypass) {
      const cached = clientCache.get(igUserId);
      if (cached && Date.now() - cached.fetchedAt < CLIENT_CACHE_TTL_MS) {
        setProfile(cached.profile);
        setFetchedAt(cached.fetchedAt);
        setError(null);
        return;
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/meta/deep-profile?igUserId=${encodeURIComponent(igUserId)}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: DeepProfile = await res.json();
      const now = Date.now();
      clientCache.set(igUserId, { profile: data, fetchedAt: now });
      setProfile(data);
      setFetchedAt(now);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Could not load deep profile. Try refresh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igUserId]);

  const sectionClass =
    'surface-card p-5 space-y-5';

  if (loading) {
    return (
      <div className={sectionClass}>
        <div className="flex items-center gap-3 text-sm text-(--muted)">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-(--line-strong) border-t-(--violet)" />
          Loading deep profile...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => fetchProfile(true)}
            className="rounded-md bg-(--surface-2) px-3 py-1.5 text-xs text-(--muted) hover:bg-white/[0.04]"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className={sectionClass}>
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-(--txt)">@{profile.handle}</span>
          {profile.followerCount != null && (
            <span className="text-sm text-(--muted)">
              {profile.followerCount.toLocaleString()} followers
            </span>
          )}
          <span className="text-sm text-(--muted-2)">{profile.sampleSize} posts analysed</span>
          {fetchedAt != null && (
            <span className="text-xs text-(--muted-2)">Updated {relativeTime(fetchedAt)}</span>
          )}
        </div>
        <button
          onClick={() => fetchProfile(true)}
          className="rounded-md bg-(--surface-2) px-3 py-1.5 text-xs text-(--muted) hover:bg-white/[0.04]"
        >
          Refresh
        </button>
      </div>

      {/* Format performance */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-(--txt)">Format performance</h3>
        <FormatTable rows={profile.formatPerformance} />
      </div>

      {/* Caption length sweet spot */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-(--txt)">Caption length sweet spot</h3>
        <CaptionBars data={profile.captionLengthSweetSpot} />
      </div>

      {/* Top hook patterns */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-(--txt)">Top hook patterns</h3>
        <HookCards patterns={profile.hookPatterns} />
      </div>

      {/* Topic signals */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-(--txt)">Topic signals</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TopicChips tags={profile.topicSignals.winning} label="Winning topics" />
          <TopicChips tags={profile.topicSignals.losing} label="Losing topics" />
        </div>
      </div>

      {/* Audience */}
      {profile.audience && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-(--txt)">Audience</h3>
          <AudienceBlock audience={profile.audience} />
        </div>
      )}
    </div>
  );
}
