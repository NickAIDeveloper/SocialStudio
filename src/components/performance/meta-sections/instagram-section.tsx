'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  computeBenchmarks,
  computeFormatPerformance,
  computeHeatmap,
  deltaBand,
  getMetric,
  ratio,
  weeklyReachSeries,
  normalizeFormat,
  DAY_LABELS,
  shortHour,
  type DeltaBand,
  type FormatStats,
  type IgInsightRow,
  type IgMediaItem,
} from '@/lib/meta/ig-analytics';
import { type PostSummary, formatNumber, FormatBadge } from './shared';
import { HeroCard } from './hero-card';
import { CaptionPatterns } from './caption-patterns';
import { PostAutopsy } from './post-autopsy';
import { FormatStrip } from './format-strip';
import { Heatmap } from './heatmap';

// ── IG-specific types ─────────────────────────────────────────────────────────

interface IgAccount {
  id: string;
  igUserId: string;
  igUsername: string | null;
  igAccountType: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
}

// IgInsightRow and IgMediaItem are imported from @/lib/meta/ig-analytics.

interface IgInsightsBundle {
  profile: {
    username: string;
    account_type: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  };
  accountInsights: IgInsightRow[];
  media: IgMediaItem[];
}

// ── Helpers exclusive to this section ────────────────────────────────────────

function buildPostSummary(m: IgMediaItem): PostSummary {
  return {
    id: m.id,
    caption: m.caption,
    mediaType: m.media_type,
    format: normalizeFormat(m),
    timestamp: m.timestamp,
    reach: getMetric(m, 'reach'),
    views: getMetric(m, 'views'),
    likes: getMetric(m, 'likes'),
    comments: getMetric(m, 'comments'),
    saves: getMetric(m, 'saves'),
    shares: getMetric(m, 'shares'),
  };
}

const BAND_CLASS: Record<DeltaBand, string> = {
  'strong-positive': 'text-emerald-300 bg-emerald-500/10',
  'positive': 'text-emerald-300/90',
  'neutral': 'text-white/80',
  'negative': 'text-rose-300/90',
  'strong-negative': 'text-rose-300 bg-rose-500/10',
};

function BenchmarkCell({ value, base }: { value: number | null; base: number | null }) {
  const r = ratio(value, base);
  const band = deltaBand(r);
  return (
    <td className={`px-2 py-2 text-right tabular-nums ${BAND_CLASS[band]}`} title={r ? `${r.toFixed(2)}× median` : ''}>
      {formatNumber(value ?? undefined)}
      {r != null && r !== 1 && (band === 'strong-positive' || band === 'strong-negative') && (
        <span className="ml-1 text-[10px] opacity-70">
          {band === 'strong-positive' ? '▲' : '▼'}
        </span>
      )}
    </td>
  );
}

function Sparkline({ data, label }: { data: number[]; label?: string }) {
  if (!data.length || data.every((v) => v === 0)) return null;
  const max = Math.max(...data, 1);
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * 60;
      const y = 16 - (v / max) * 14;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <div className="hidden sm:flex flex-col items-end">
      <svg width={60} height={16} className="text-emerald-400">
        <polyline fill="none" stroke="currentColor" strokeWidth={1.5} points={points} />
      </svg>
      {label && <span className="text-[10px] text-white/40 mt-0.5">{label}</span>}
    </div>
  );
}

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function LearningChip({
  label,
  value,
  empty,
}: {
  label: string;
  value: string | null;
  empty: string;
}) {
  return (
    <li className="rounded-lg border border-white/10 bg-black/20 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div
        className={`mt-0.5 font-medium ${value ? 'text-white' : 'text-white/40'}`}
      >
        {value ?? empty}
      </div>
    </li>
  );
}

function ApplyAllLearningsCta({
  posts,
  formatStats,
  topSlots,
}: {
  posts: PostSummary[];
  formatStats: FormatStats[];
  topSlots: Array<{ day: number; hour: number; medianEngagement: number }>;
}) {
  const bestFormat = formatStats
    .filter((s) => s.sampleSize > 0)
    .sort((a, b) => (b.medianReach ?? 0) - (a.medianReach ?? 0))[0];
  const bestSlot = topSlots[0];
  const topPost = [...posts]
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))[0];
  const topCaption = topPost?.caption?.split('\n').find((l) => l.trim())?.slice(0, 120);

  // Nothing usable — either no formats with samples or no posts at all.
  if (!bestFormat && !bestSlot && !topCaption) return null;

  const params = new URLSearchParams();
  if (bestFormat) params.set('metaFormat', bestFormat.format);
  if (bestSlot) {
    params.set('metaDay', DAY_NAMES[bestSlot.day]);
    params.set('metaHour', String(bestSlot.hour));
  }
  if (topCaption) params.set('preset', topCaption);
  const href = `/smart-posts?${params.toString()}`;

  return (
    <div className="rounded-xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-sky-500/10 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">
            One-click apply
          </div>
          <h4 className="text-base font-semibold text-white mt-0.5">
            Apply all learnings to Smart Posts
          </h4>
          <p className="text-xs text-white/70 mt-1">
            Bundle every Meta signal into one generation seed. Merges with your
            brand insights on the Smart Posts page.
          </p>
        </div>
        <a
          href={href}
          className="shrink-0 rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Apply →
        </a>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3 text-xs">
        <LearningChip
          label="Best format"
          value={bestFormat?.format ?? null}
          empty="—"
        />
        <LearningChip
          label="Best slot"
          value={
            bestSlot
              ? `${DAY_LABELS[bestSlot.day]} ${shortHour(bestSlot.hour)}`
              : null
          }
          empty="Need more posts"
        />
        <LearningChip
          label="Top-post seed"
          value={topCaption ? `"${topCaption.slice(0, 40)}${topCaption.length > 40 ? '…' : ''}"` : null}
          empty="—"
        />
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-lg font-semibold text-white mt-0.5">{value}</div>
    </div>
  );
}

// ── IgInsightsPanel ───────────────────────────────────────────────────────────
// Used only by InstagramSection; moved here per extraction rule #3.

function IgInsightsPanel({
  loading,
  bundle,
}: {
  loading: boolean;
  bundle: IgInsightsBundle | null;
}) {
  const media = bundle?.media ?? [];
  const benchmarks = useMemo(() => computeBenchmarks(media), [media]);
  const formatStats = useMemo(() => computeFormatPerformance(media), [media]);
  const heatmap = useMemo(() => computeHeatmap(media), [media]);
  const reachSeries = useMemo(() => weeklyReachSeries(media), [media]);
  const postSummaries = useMemo(() => media.map(buildPostSummary), [media]);

  if (loading) return <div className="text-sm text-white/60">Loading Instagram insights…</div>;
  if (!bundle) return null;

  const { profile, accountInsights } = bundle;
  const totalFor = (name: string) =>
    accountInsights.find((r) => r.name === name)?.total_value?.value;

  return (
    <div className="space-y-5 pt-2 border-t border-white/10">
      {postSummaries.length > 0 && (
        <HeroCard
          posts={postSummaries}
          medians={benchmarks.median}
          allMedia={media}
        />
      )}

      <div className="flex items-center gap-4">
        {profile.profile_picture_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.profile_picture_url}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <div className="text-base font-semibold text-white">
            @{profile.username}{' '}
            <span className="text-xs text-white/50">({profile.account_type})</span>
          </div>
          <div className="text-xs text-white/60">
            {profile.followers_count?.toLocaleString() ?? '—'} followers ·{' '}
            {profile.media_count?.toLocaleString() ?? '—'} posts
          </div>
        </div>
        <Sparkline data={reachSeries} label="reach / wk" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Reach (28d)" value={formatNumber(totalFor('reach'))} />
        <Metric label="Views (28d)" value={formatNumber(totalFor('views'))} />
        <Metric label="Accounts engaged" value={formatNumber(totalFor('accounts_engaged'))} />
        <Metric label="Interactions" value={formatNumber(totalFor('total_interactions'))} />
        <Metric label="Likes" value={formatNumber(totalFor('likes'))} />
        <Metric label="Comments" value={formatNumber(totalFor('comments'))} />
        <Metric label="Saves" value={formatNumber(totalFor('saves'))} />
        <Metric label="Shares" value={formatNumber(totalFor('shares'))} />
      </div>

      <FormatStrip stats={formatStats} />
      <Heatmap heatmap={heatmap} />

      {postSummaries.length > 0 && (
        <ApplyAllLearningsCta
          posts={postSummaries}
          formatStats={formatStats}
          topSlots={heatmap.topSlots}
        />
      )}

      {postSummaries.length >= 3 && (
        <CaptionPatterns posts={postSummaries} medians={benchmarks.median} />
      )}

      {postSummaries.length > 0 && (
        <PostAutopsy posts={postSummaries} medians={benchmarks.median} />
      )}

      {media.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-sm font-semibold text-white">Recent posts</h4>
            <span className="text-[11px] text-white/40">
              color = vs your median · {benchmarks.sampleSize} posts
            </span>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-white/50 border-b border-white/10">
                  <th className="px-2 py-2 font-medium">Post</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium text-right">Reach</th>
                  <th className="px-2 py-2 font-medium text-right">Views</th>
                  <th className="px-2 py-2 font-medium text-right">Likes</th>
                  <th className="px-2 py-2 font-medium text-right">Comments</th>
                  <th className="px-2 py-2 font-medium text-right">Saves</th>
                  <th className="px-2 py-2 font-medium text-right">Shares</th>
                </tr>
              </thead>
              <tbody>
                {media.map((m) => (
                  <tr key={m.id} className="border-b border-white/5 text-white/90 hover:bg-white/5">
                    <td className="px-2 py-2 max-w-[260px]">
                      <a
                        href={m.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:underline line-clamp-1"
                      >
                        {m.caption?.slice(0, 60) || '(no caption)'}
                      </a>
                      {m.timestamp && (
                        <div className="text-[11px] text-white/40">
                          {new Date(m.timestamp).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <FormatBadge format={normalizeFormat(m)} />
                    </td>
                    <BenchmarkCell value={getMetric(m, 'reach')} base={benchmarks.median.reach} />
                    <BenchmarkCell value={getMetric(m, 'views')} base={benchmarks.median.views} />
                    <BenchmarkCell value={getMetric(m, 'likes')} base={benchmarks.median.likes} />
                    <BenchmarkCell value={getMetric(m, 'comments')} base={benchmarks.median.comments} />
                    <BenchmarkCell value={getMetric(m, 'saves')} base={benchmarks.median.saves} />
                    <BenchmarkCell value={getMetric(m, 'shares')} base={benchmarks.median.shares} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── InstagramSection ──────────────────────────────────────────────────────────

interface InstagramSectionProps {
  /** When provided, the section is controlled: the parent drives selection. */
  igUserId?: string | null;
  onSelectIg?: (igUserId: string | null) => void;
}

export function InstagramSection({ igUserId, onSelectIg }: InstagramSectionProps = {}) {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalSelectedIg, setInternalSelectedIg] = useState<string | null>(null);
  const [bundle, setBundle] = useState<IgInsightsBundle | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [igMessage, setIgMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Controlled (prop-driven) vs uncontrolled (standalone) selection.
  const isControlled = igUserId !== undefined;
  const selectedIg = isControlled ? (igUserId ?? null) : internalSelectedIg;
  const setSelectedIg = useCallback(
    (id: string | null) => {
      if (isControlled) onSelectIg?.(id);
      else setInternalSelectedIg(id);
    },
    [isControlled, onSelectIg],
  );

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/meta/instagram/accounts', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: IgAccount[] = json.data ?? [];
      setAccounts(list);
      // Auto-select the first account when nothing is selected yet, so the
      // stats panel appears immediately on first load (in both modes).
      if (list.length && !selectedIg) {
        setSelectedIg(list[0].igUserId);
      }
    } catch (err) {
      setIgMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load IG accounts',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedIg, setSelectedIg]);

  const fetchInsights = useCallback(async (igUserId: string) => {
    setInsightsLoading(true);
    setBundle(null);
    try {
      const res = await fetch(
        `/api/meta/instagram/insights?igUserId=${encodeURIComponent(igUserId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setBundle(json.data);
    } catch (err) {
      setIgMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load insights',
      });
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    const connected = searchParams.get('igConnected');
    const err = searchParams.get('igError');
    if (connected) setIgMessage({ type: 'success', text: `Connected @${connected}` });
    else if (err) setIgMessage({ type: 'error', text: err });
    fetchAccounts();
  }, [fetchAccounts, searchParams]);

  useEffect(() => {
    if (selectedIg) fetchInsights(selectedIg);
  }, [selectedIg, fetchInsights]);

  async function handleDisconnectIg(igUserId: string) {
    if (!confirm('Disconnect this Instagram account?')) return;
    try {
      const res = await fetch(
        `/api/meta/instagram/accounts?igUserId=${encodeURIComponent(igUserId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccounts((prev) => prev.filter((a) => a.igUserId !== igUserId));
      if (selectedIg === igUserId) {
        setSelectedIg(null);
        setBundle(null);
      }
    } catch (err) {
      setIgMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Disconnect failed',
      });
    }
  }

  if (loading) return null;

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Instagram accounts</h3>
          <p className="text-sm text-white/70 mt-1">
            Direct Instagram Login for Business — no Facebook Page required. Works with
            Business or Creator IG accounts only.
          </p>
        </div>
        <a
          href="/api/meta/instagram/oauth/start"
          className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#E1306C] to-[#F77737] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Connect Instagram
        </a>
      </div>

      {igMessage && (
        <div
          className={
            igMessage.type === 'success'
              ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'
              : 'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400'
          }
        >
          {igMessage.text}
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-white/60">
          No Instagram accounts connected yet. Click <strong>Connect Instagram</strong> above —
          you&apos;ll authenticate with the IG account itself (not Facebook) and we&apos;ll
          pull in insights for this user.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {accounts.map((a) => (
            <li
              key={a.igUserId}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer ${
                selectedIg === a.igUserId
                  ? 'border-fuchsia-400/40 bg-fuchsia-400/10'
                  : 'border-white/5 bg-black/20 hover:border-white/15'
              }`}
              onClick={() => setSelectedIg(a.igUserId)}
            >
              <div className="flex items-center gap-3">
                {a.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.profilePictureUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-white/10" />
                )}
                <div>
                  <div className="text-sm font-medium text-white">@{a.igUsername}</div>
                  <div className="text-xs text-white/50">
                    {a.igAccountType}
                    {a.name ? ` · ${a.name}` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDisconnectIg(a.igUserId);
                }}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white hover:bg-white/5"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedIg && (
        <IgInsightsPanel loading={insightsLoading} bundle={bundle} />
      )}
    </div>
  );
}
