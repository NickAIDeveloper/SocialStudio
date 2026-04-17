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
  type HeatCell,
  type MetricKey,
} from '@/lib/meta/ig-analytics';

// ── Types ────────────────────────────────────────────────────────────────────

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency?: string;
  account_status?: number;
}

interface MetaAssets {
  adAccounts: AdAccount[];
  pages: Array<{
    id: string;
    name: string;
    category?: string;
    instagramBusinessAccountId: string | null;
  }>;
}

interface MetaAccount {
  fbUserId: string;
  fbUserName: string | null;
  scopes: string | null;
  assets: MetaAssets | null;
  selectedAdAccountId: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
}

interface InsightsRow {
  [k: string]: unknown;
  impressions?: string;
  reach?: string;
  spend?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  date_start?: string;
  date_stop?: string;
}

interface InsightsResponse {
  data: InsightsRow[];
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_14d', label: 'Last 14 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'maximum', label: 'Maximum' },
];

type InsightsLevel = 'account' | 'campaign' | 'adset' | 'ad';

const LEVELS: Array<{ value: InsightsLevel; label: string }> = [
  { value: 'account', label: 'Whole account' },
  { value: 'campaign', label: 'Per campaign' },
  { value: 'adset', label: 'Per ad set' },
  { value: 'ad', label: 'Per ad' },
];

// Breakdown options come from the Marketing API /insights reference. Only a
// safe subset is exposed — some combinations are invalid and Meta will reject
// them (e.g. mixing delivery + action breakdowns). Keep to well-supported ones.
const BREAKDOWNS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'No breakdown' },
  { value: 'age', label: 'Age' },
  { value: 'gender', label: 'Gender' },
  { value: 'age,gender', label: 'Age + gender' },
  { value: 'country', label: 'Country' },
  { value: 'region', label: 'Region' },
  { value: 'publisher_platform', label: 'Platform' },
  { value: 'device_platform', label: 'Device' },
  { value: 'impression_device', label: 'Impression device' },
];

// ── Component ────────────────────────────────────────────────────────────────

export function MetaHub() {
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<MetaAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Insights state
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [datePreset, setDatePreset] = useState('last_30d');
  const [level, setLevel] = useState<InsightsLevel>('account');
  const [breakdown, setBreakdown] = useState<string>('none');

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/meta/account', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAccount(json.data);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load account',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(
    async (adAccountId: string, preset: string) => {
      setInsightsLoading(true);
      try {
        const breakdownParam = breakdown !== 'none' ? `&breakdowns=${encodeURIComponent(breakdown)}` : '';
        const url = `/api/meta/insights?adAccountId=${encodeURIComponent(adAccountId)}&datePreset=${preset}&level=${level}${breakdownParam}`;
        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setInsights(json.data);
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to load insights',
        });
        setInsights(null);
      } finally {
        setInsightsLoading(false);
      }
    },
    [level, breakdown]
  );

  // Initial load + pick up redirect query params from OAuth callback
  useEffect(() => {
    const err = searchParams.get('error');
    const connected = searchParams.get('connected');
    if (err) setMessage({ type: 'error', text: err });
    else if (connected === '1') setMessage({ type: 'success', text: 'Facebook connected.' });
    fetchAccount();
  }, [fetchAccount, searchParams]);

  // Auto-fetch insights when account + selected ad account are available
  useEffect(() => {
    if (account?.selectedAdAccountId) {
      fetchInsights(account.selectedAdAccountId, datePreset);
    }
  }, [account?.selectedAdAccountId, datePreset, level, breakdown, fetchInsights]);

  async function handleDisconnect() {
    if (!confirm('Disconnect Facebook? You will need to re-authorize to pull insights again.')) {
      return;
    }
    try {
      const res = await fetch('/api/meta/account', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccount(null);
      setInsights(null);
      setMessage({ type: 'success', text: 'Disconnected.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Disconnect failed',
      });
    }
  }

  async function handleSelectAdAccount(adAccountId: string) {
    try {
      const res = await fetch('/api/meta/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAdAccountId: adAccountId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccount((prev) => (prev ? { ...prev, selectedAdAccountId: adAccountId } : prev));
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update selection',
      });
    }
  }

  if (loading) {
    return <div className="text-sm text-white/70">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={
            message.type === 'success'
              ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300'
              : 'rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400'
          }
        >
          {message.text}
        </div>
      )}

      <ConnectionCard account={account} onDisconnect={handleDisconnect} />

      {account && account.assets && (
        <AdAccountSelector
          adAccounts={account.assets.adAccounts}
          selectedId={account.selectedAdAccountId}
          onSelect={handleSelectAdAccount}
        />
      )}

      {account?.selectedAdAccountId && (
        <InsightsPanel
          insights={insights}
          loading={insightsLoading}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          level={level}
          onLevelChange={setLevel}
          breakdown={breakdown}
          onBreakdownChange={setBreakdown}
        />
      )}

      {account && account.assets && account.assets.pages.length > 0 && (
        <PagesPanel pages={account.assets.pages} />
      )}

      <InstagramSection />

      <FutureFeaturesPanel connected={!!account} />
    </div>
  );
}

// ── Instagram section (direct IG Login for Business) ────────────────────────
// Separate flow from the Facebook OAuth above. Doesn't require FB Pages;
// a Business or Creator IG account can connect directly.

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

interface IgInsightValue {
  value: number | Record<string, number>;
  end_time?: string;
}
interface IgInsightRow {
  name: string;
  period: string;
  values: IgInsightValue[];
  total_value?: { value: number };
  title?: string;
}
interface IgMediaItem {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  insights: IgInsightRow[];
}
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

function InstagramSection() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIg, setSelectedIg] = useState<string | null>(null);
  const [bundle, setBundle] = useState<IgInsightsBundle | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [igMessage, setIgMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/meta/instagram/accounts', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAccounts(json.data ?? []);
      if (json.data?.length && !selectedIg) setSelectedIg(json.data[0].igUserId);
    } catch (err) {
      setIgMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load IG accounts',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedIg]);

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

interface PostSummary {
  id: string;
  caption?: string;
  mediaType: string;
  format: 'REEL' | 'CAROUSEL' | 'IMAGE';
  timestamp?: string;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
}

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

      <FormatPerformanceStrip stats={formatStats} />
      <TimeHeatmap heatmap={heatmap} />

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

// ── New analytics UI ─────────────────────────────────────────────────────────

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

function FormatBadge({ format }: { format: 'REEL' | 'CAROUSEL' | 'IMAGE' }) {
  const style =
    format === 'REEL'
      ? 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30'
      : format === 'CAROUSEL'
        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
        : 'bg-white/10 text-white/70 border-white/15';
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${style}`}>
      {format}
    </span>
  );
}

function FormatPerformanceStrip({ stats }: { stats: FormatStats[] }) {
  const hasData = stats.some((s) => s.sampleSize > 0);
  if (!hasData) return null;
  const top = stats.find((s) => s.sampleSize > 0);
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-white">Format performance</h4>
        <span className="text-[11px] text-white/40">median reach per post</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div
            key={s.format}
            className={`rounded-lg border p-3 ${
              s.sampleSize === 0
                ? 'border-white/5 bg-black/10 opacity-60'
                : s === top
                  ? 'border-emerald-400/30 bg-emerald-500/5'
                  : 'border-white/10 bg-black/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <FormatBadge format={s.format} />
              <span className="text-[10px] text-white/40">n = {s.sampleSize}</span>
            </div>
            <div className="mt-2 text-xl font-semibold text-white tabular-nums">
              {formatNumber(s.medianReach ?? undefined)}
            </div>
            {s.relativeToBest > 0 && s.relativeToBest < 1 && (
              <div className="text-[11px] text-white/50 mt-0.5">
                {(s.relativeToBest * 100).toFixed(0)}% of top
              </div>
            )}
            {s === top && s.sampleSize > 0 && (
              <div className="text-[11px] text-emerald-300/80 mt-0.5">Your top format</div>
            )}
          </div>
        ))}
      </div>
      {top && top.sampleSize >= 2 && (
        <p className="text-xs text-white/60">
          {top.format === 'REEL'
            ? 'Reels are getting the most reach — post 1–2 more per week.'
            : top.format === 'CAROUSEL'
              ? 'Carousels outperform your other formats — lead with carousels.'
              : 'Static images are leading — keep the strong visuals coming.'}
        </p>
      )}
    </div>
  );
}

function TimeHeatmap({ heatmap }: { heatmap: { cells: HeatCell[]; topSlots: Array<{ day: number; hour: number; medianEngagement: number }> } }) {
  const { cells, topSlots } = heatmap;
  const hasData = cells.some((c) => c.sampleSize > 0);
  if (!hasData) return null;

  const cellAt = (d: number, h: number) => cells.find((c) => c.day === d && c.hour === h);
  const isTop = (d: number, h: number) => topSlots.some((s) => s.day === d && s.hour === h);
  // Compact: show every 2nd hour label to avoid crowding on narrow screens.
  const hourLabels = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-white">Best post times</h4>
        <span className="text-[11px] text-white/40">engagement heatmap · your local time</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[10px] border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="w-8" />
              {hourLabels.map((h) => (
                <th key={h} className="w-[14px] font-normal text-white/40 text-center">
                  {h % 3 === 0 ? shortHour(h) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((label, d) => (
              <tr key={d}>
                <td className="pr-2 text-white/50 text-right">{label}</td>
                {hourLabels.map((h) => {
                  const c = cellAt(d, h);
                  const intensity = c?.intensity ?? 0;
                  const top = isTop(d, h);
                  return (
                    <td
                      key={h}
                      title={
                        c?.sampleSize
                          ? `${label} ${shortHour(h)} — median engagement ${Math.round(c.medianEngagement ?? 0)} (${c.sampleSize} posts)`
                          : `${label} ${shortHour(h)} — no posts`
                      }
                      className={`h-4 w-[14px] rounded-[2px] ${
                        top ? 'ring-1 ring-amber-300' : ''
                      }`}
                      style={{
                        backgroundColor:
                          intensity > 0
                            ? `rgba(16, 185, 129, ${0.15 + intensity * 0.7})`
                            : 'rgba(255,255,255,0.03)',
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {topSlots.length > 0 && (
        <p className="text-xs text-white/60">
          Best performing slots:{' '}
          {topSlots.map((s, i) => (
            <span key={`${s.day}-${s.hour}`}>
              {i > 0 ? ', ' : ''}
              <span className="text-amber-300">
                {DAY_LABELS[s.day]} {shortHour(s.hour)}
              </span>
            </span>
          ))}
          . Aim for these windows.
        </p>
      )}
    </div>
  );
}

// ── Composite CTA: bundle all Meta learnings into /smart-posts ──────────────
// Takes the deterministic, non-LLM signals from this page (best format, best
// time slot, top-post topic) and links to /smart-posts with them as URL
// params. The smart-posts page merges them into the brand seed, so a single
// click carries every Meta-side learning into the generator.

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

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

// ── AI analysis components (Phase 2) ─────────────────────────────────────────

interface HeroAnalysis {
  verdict?: string;
  suggestion?: string;
  makeMorePrompt?: string;
}

function HeroCard({
  posts,
  medians,
  allMedia,
}: {
  posts: PostSummary[];
  medians: Record<MetricKey, number | null>;
  allMedia: IgMediaItem[];
}) {
  const [loading, setLoading] = useState(true);
  const [top, setTop] = useState<PostSummary | null>(null);
  const [analysis, setAnalysis] = useState<HeroAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch on mount. The API is cached upstream (future: add key-by-top-id
  // memoization client-side too) but a single call on page load is cheap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/meta/instagram/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'hero', posts, medians }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setTop(json.data?.top ?? null);
        setAnalysis((json.data?.analysis as HeroAnalysis) ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topMedia = top ? allMedia.find((m) => m.id === top.id) : null;
  const thumb = topMedia?.thumbnail_url ?? topMedia?.media_url;

  return (
    <div className="rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-fuchsia-500/5 to-sky-500/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-amber-300/80">What&apos;s working</span>
          {loading && <span className="text-[11px] text-white/50">· analyzing…</span>}
        </div>
      </div>
      {error && <div className="text-xs text-rose-300/80">{error}</div>}
      {top && (
        <div className="flex gap-4">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-20 w-20 rounded-lg object-cover border border-white/10" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-medium line-clamp-2">
              {top.caption?.slice(0, 120) || '(no caption)'}
            </div>
            <div className="text-[11px] text-white/50 mt-1">
              <FormatBadge format={top.format} /> · reach{' '}
              <span className="text-emerald-300 font-semibold">
                {formatNumber(top.reach ?? undefined)}
              </span>
              {medians.reach && top.reach && (
                <span className="ml-1">({(top.reach / medians.reach).toFixed(1)}× median)</span>
              )}
            </div>
            {analysis?.verdict && (
              <p className="text-sm text-white/90 mt-2 leading-snug">{analysis.verdict}</p>
            )}
            {analysis?.suggestion && (
              <p className="text-xs text-amber-200/80 mt-1">
                <span className="font-semibold">Next: </span>
                {analysis.suggestion}
              </p>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-2">
            {analysis?.makeMorePrompt && (
              <a
                href={`/smart-posts?preset=${encodeURIComponent(analysis.makeMorePrompt)}`}
                className="whitespace-nowrap rounded-lg bg-gradient-to-r from-fuchsia-500 to-amber-500 px-3 py-2 text-xs font-medium text-white hover:opacity-90"
              >
                Make more like this
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface CaptionPattern {
  label: string;
  evidence: string;
  howToUse: string;
}

function CaptionPatterns({
  posts,
  medians,
}: {
  posts: PostSummary[];
  medians: Record<MetricKey, number | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [patterns, setPatterns] = useState<CaptionPattern[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meta/instagram/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'patterns', posts, medians }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const raw = json.data?.patterns as { patterns?: CaptionPattern[] } | null;
      setPatterns(raw?.patterns ?? []);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-white">Caption patterns</h4>
          <p className="text-xs text-white/60 mt-0.5">
            AI analyzes your top 10 posts to extract what&apos;s repeatable.
          </p>
        </div>
        {!loaded && (
          <button
            onClick={analyze}
            disabled={loading}
            className="shrink-0 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200 px-3 py-1.5 text-xs font-medium hover:bg-fuchsia-500/30 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Find my patterns'}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-rose-300/80">{error}</div>}
      {patterns && patterns.length > 0 && (
        <ul className="space-y-2">
          {patterns.map((p, i) => (
            <li key={i} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-semibold text-white">{p.label}</div>
              <div className="text-xs text-white/60 mt-1 italic">{p.evidence}</div>
              <div className="text-xs text-emerald-200/90 mt-1">→ {p.howToUse}</div>
            </li>
          ))}
        </ul>
      )}
      {loaded && patterns && patterns.length === 0 && (
        <div className="text-xs text-white/50">No clear patterns yet — post more and try again.</div>
      )}
    </div>
  );
}

interface AutopsyAnalysis {
  verdict?: 'positive' | 'negative' | 'mixed';
  why?: string;
  fixes?: string[];
}

function PostAutopsy({
  posts,
  medians,
}: {
  posts: PostSummary[];
  medians: Record<MetricKey, number | null>;
}) {
  const [selectedId, setSelectedId] = useState<string>(posts[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AutopsyAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/meta/instagram/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'autopsy', posts, medians, postId: selectedId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult((json.data?.analysis as AutopsyAnalysis) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const verdictColor =
    result?.verdict === 'positive'
      ? 'text-emerald-300'
      : result?.verdict === 'negative'
        ? 'text-rose-300'
        : 'text-amber-300';

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">Post autopsy</h4>
          <p className="text-xs text-white/60 mt-0.5">
            Pick a post → get a plain-English verdict + 3 concrete fixes.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setResult(null);
          }}
          className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white"
        >
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.caption?.slice(0, 60) || '(no caption)') + ` · ${p.format}`}
            </option>
          ))}
        </select>
        <button
          onClick={analyze}
          disabled={loading || !selectedId}
          className="shrink-0 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-200 px-3 py-1.5 text-xs font-medium hover:bg-sky-500/30 disabled:opacity-50"
        >
          {loading ? 'Autopsy…' : 'Analyze'}
        </button>
      </div>
      {error && <div className="text-xs text-rose-300/80">{error}</div>}
      {result && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
          {result.verdict && (
            <div className={`text-[11px] uppercase tracking-wider font-semibold ${verdictColor}`}>
              Verdict: {result.verdict}
            </div>
          )}
          {result.why && <p className="text-sm text-white/85">{result.why}</p>}
          {result.fixes && result.fixes.length > 0 && (
            <ul className="space-y-1 pl-4 list-disc text-xs text-white/75">
              {result.fixes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
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

// ── Sub-components ───────────────────────────────────────────────────────────

function ConnectionCard({
  account,
  onDisconnect,
}: {
  account: MetaAccount | null;
  onDisconnect: () => void;
}) {
  if (!account) {
    return (
      <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Facebook not connected</h3>
          <p className="text-sm text-white mt-1">
            Authorize access to your Facebook ad accounts, Pages, and Instagram Business
            accounts to read performance insights.
          </p>
        </div>
        <a
          href="/api/meta/oauth/start"
          className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166FE5] transition-colors"
        >
          Connect Facebook
        </a>
      </div>
    );
  }

  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Connected</h3>
          <p className="text-sm text-white mt-1">
            Authorized as <span className="font-medium">{account.fbUserName ?? account.fbUserId}</span>
          </p>
          {daysLeft != null && (
            <p className="text-xs text-white/60 mt-1">
              Access token expires in {daysLeft} day{daysLeft === 1 ? '' : 's'} — reconnect before then.
            </p>
          )}
        </div>
        <button
          onClick={onDisconnect}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5 transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function AdAccountSelector({
  adAccounts,
  selectedId,
  onSelect,
}: {
  adAccounts: AdAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (adAccounts.length === 0) {
    return (
      <div className="glass-card rounded-xl border border-white/5 p-6">
        <h3 className="text-lg font-semibold text-white">No ad accounts found</h3>
        <p className="text-sm text-white/70 mt-1">
          The connected Facebook user doesn&apos;t have access to any ad accounts, or the
          <code className="mx-1 px-1 rounded bg-black/30">ads_read</code>
          permission was not granted. Try reconnecting.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-white">Ad account</h3>
        <p className="text-sm text-white/70 mt-1">
          Pick which ad account Insights should read from.
        </p>
      </div>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
      >
        {adAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.account_id}){a.currency ? ` · ${a.currency}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function InsightsPanel({
  insights,
  loading,
  datePreset,
  onDatePresetChange,
  level,
  onLevelChange,
  breakdown,
  onBreakdownChange,
}: {
  insights: InsightsResponse | null;
  loading: boolean;
  datePreset: string;
  onDatePresetChange: (v: string) => void;
  level: InsightsLevel;
  onLevelChange: (v: InsightsLevel) => void;
  breakdown: string;
  onBreakdownChange: (v: string) => void;
}) {
  const rows = insights?.data ?? [];
  // Single-row layout only makes sense for account-level with no breakdown.
  // Everything else returns N rows → render a table.
  const isSingleRow = level === 'account' && breakdown === 'none';
  const singleRow = rows[0];

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-white">Ad account insights</h3>
          <p className="text-sm text-white/70 mt-1">
            Slice by level and demographic breakdown — powered by Marketing API.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LabeledSelect
            label="Level"
            value={level}
            onChange={(v) => onLevelChange(v as InsightsLevel)}
            options={LEVELS}
          />
          <LabeledSelect
            label="Breakdown"
            value={breakdown}
            onChange={onBreakdownChange}
            options={BREAKDOWNS}
          />
          <LabeledSelect
            label="Date"
            value={datePreset}
            onChange={onDatePresetChange}
            options={DATE_PRESETS}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-white/60">Loading insights…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-white/60">
          No data for this range. Run some ads — then come back.
        </div>
      ) : isSingleRow && singleRow ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Impressions" value={formatNumber(singleRow.impressions)} />
          <Metric label="Reach" value={formatNumber(singleRow.reach)} />
          <Metric label="Spend" value={formatCurrency(singleRow.spend)} />
          <Metric label="Clicks" value={formatNumber(singleRow.clicks)} />
          <Metric label="CTR" value={formatPercent(singleRow.ctr)} />
          <Metric label="CPC" value={formatCurrency(singleRow.cpc)} />
          <Metric label="CPM" value={formatCurrency(singleRow.cpm)} />
          <Metric label="Frequency" value={formatDecimal(singleRow.frequency)} />
        </div>
      ) : (
        <InsightsTable rows={rows} level={level} breakdown={breakdown} />
      )}
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-white/50">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white normal-case tracking-normal"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Columns shown for the row label depend on level + breakdown. When the user
// picks `level=campaign`, each row has a `campaign_name`; at `level=ad`, each
// has `ad_name`; etc. Breakdown keys (age, gender, country…) appear as extra
// columns mirroring whichever breakdown was chosen.
function InsightsTable({
  rows,
  level,
  breakdown,
}: {
  rows: InsightsRow[];
  level: InsightsLevel;
  breakdown: string;
}) {
  const labelKey =
    level === 'campaign'
      ? 'campaign_name'
      : level === 'adset'
        ? 'adset_name'
        : level === 'ad'
          ? 'ad_name'
          : null;
  const breakdownKeys = breakdown === 'none' ? [] : breakdown.split(',');

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-white/50 border-b border-white/10">
            {labelKey && <th className="px-2 py-2 font-medium">{labelFor(labelKey)}</th>}
            {breakdownKeys.map((k) => (
              <th key={k} className="px-2 py-2 font-medium">
                {labelFor(k)}
              </th>
            ))}
            <th className="px-2 py-2 font-medium text-right">Impr.</th>
            <th className="px-2 py-2 font-medium text-right">Reach</th>
            <th className="px-2 py-2 font-medium text-right">Spend</th>
            <th className="px-2 py-2 font-medium text-right">Clicks</th>
            <th className="px-2 py-2 font-medium text-right">CTR</th>
            <th className="px-2 py-2 font-medium text-right">CPC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${i}-${labelKey ? String(r[labelKey]) : ''}`}
              className="border-b border-white/5 text-white/90 hover:bg-white/5"
            >
              {labelKey && (
                <td className="px-2 py-2 max-w-[240px] truncate">
                  {String(r[labelKey] ?? '—')}
                </td>
              )}
              {breakdownKeys.map((k) => (
                <td key={k} className="px-2 py-2">
                  {String(r[k] ?? '—')}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(r.impressions)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(r.reach)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(r.spend)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(r.clicks)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatPercent(r.ctr)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(r.cpc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function labelFor(key: string): string {
  const map: Record<string, string> = {
    campaign_name: 'Campaign',
    adset_name: 'Ad set',
    ad_name: 'Ad',
    age: 'Age',
    gender: 'Gender',
    country: 'Country',
    region: 'Region',
    publisher_platform: 'Platform',
    device_platform: 'Device',
    impression_device: 'Impression device',
  };
  return map[key] ?? key;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-lg font-semibold text-white mt-0.5">{value}</div>
    </div>
  );
}

function PagesPanel({
  pages,
}: {
  pages: Array<{
    id: string;
    name: string;
    category?: string;
    instagramBusinessAccountId: string | null;
  }>;
}) {
  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-3">
      <h3 className="text-lg font-semibold text-white">Pages &amp; Instagram accounts</h3>
      <ul className="space-y-1.5">
        {pages.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium text-white">{p.name}</div>
              {p.category && <div className="text-xs text-white/50">{p.category}</div>}
            </div>
            <div className="text-xs text-white/60">
              {p.instagramBusinessAccountId ? 'Instagram linked' : 'No Instagram'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FutureFeaturesPanel({ connected }: { connected: boolean }) {
  const items = [
    {
      title: 'Create & boost ads',
      desc: 'Turn Smart Posts into campaigns with targeting + budget.',
      scope: 'ads_management',
    },
    {
      title: 'Per-post Instagram insights',
      desc: 'Saves, follows-from-post, Reels retention curves.',
      scope: 'instagram_manage_insights',
    },
    {
      title: 'Audience demographics',
      desc: 'City / country / age / gender breakdowns.',
      scope: 'breakdowns on /insights',
    },
  ];
  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-3 opacity-80">
      <div>
        <h3 className="text-lg font-semibold text-white">Coming soon</h3>
        <p className="text-sm text-white/70 mt-1">
          {connected
            ? 'Additional features unlock after App Review approval for the scopes below.'
            : 'Connect Facebook first to see what else is possible.'}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.title}
            className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-white/10 bg-black/10 px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium text-white">{it.title}</div>
              <div className="text-xs text-white/60 mt-0.5">{it.desc}</div>
            </div>
            <code className="shrink-0 rounded bg-black/30 px-2 py-0.5 text-[11px] text-white/60">
              {it.scope}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────
// Meta returns numeric fields as strings. We parse + format defensively.

function formatNumber(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}
function formatDecimal(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}
function formatPercent(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
}
function formatCurrency(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  // Intentionally currency-agnostic — user's ad account currency varies.
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}
