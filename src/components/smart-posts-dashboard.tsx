'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Sparkles,
  RefreshCw,
  Calendar,
  Download,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
} from 'lucide-react';
import type { InsightCard } from '@/lib/health-score';
import { isActionable } from '@/lib/smart-posts';
import { decodeLearnings } from '@/lib/analyze/learnings';
import { useHubState } from '@/lib/url-state';
import { useIgAccounts } from '@/lib/ig-accounts';
import { SourceToggle } from '@/components/performance/source-toggle';
import { WhyThisWorks } from '@/components/smart-posts/why-this-works';
import { TopPerformersStrip } from '@/components/smart-posts/top-performers-strip';
import { CandidateStrip } from '@/components/smart-posts/candidate-strip';
import { MoreOptionsDialog } from '@/components/smart-posts/more-options-dialog';
import type { ImageCandidate, RenderParams } from '@/lib/smart-posts/generate';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  instagramHandle?: string | null;
}

interface IgAccountLite {
  igUserId: string;
  igUsername: string | null;
}

// Resolve the IG account that belongs to a given brand. Brands carry a
// free-text `instagramHandle` field; we case-insensitively match it against
// connected Meta accounts. Returns null when the brand has no handle, or when
// the handle isn't among the user's connected accounts.
function resolveIgForBrand(
  brandId: string | null,
  brands: BrandRow[],
  accounts: IgAccountLite[],
): string | null {
  if (!brandId) return null;
  const brand = brands.find((b) => b.id === brandId);
  if (!brand?.instagramHandle) return null;
  const handle = brand.instagramHandle.replace(/^@/, '').toLowerCase();
  const account = accounts.find((a) => a.igUsername?.toLowerCase() === handle);
  return account?.igUserId ?? null;
}

interface PerfectPost {
  imageDataUrl: string;
  sourceImageUrl: string;
  caption: string;
  hashtags: string;
  hookText: string;
  suggestedPostTime?: { day: string; hour: number };
  scheduledAt?: string | null;
  // Maps insight type → human-readable string describing exactly what that
  // insight contributed. Insights NOT in this map were not used this run.
  contributions: Record<string, string>;
  // Present only on the god-mode response path. Task 11 uses these to drive
  // the full <WhyThisWorks /> panel; for now they render as bulleted text.
  godModeRationale?: string;
  deepProfile?: DeepProfile;
  candidates?: ImageCandidate[];
  renderParams?: RenderParams;
}

interface HistoryPayload {
  current: { score: number; dateKey: string } | null;
  previous: { score: number; dateKey: string } | null;
  delta: number | null;
}

const VERDICT_STYLES: Record<InsightCard['verdict'], string> = {
  positive: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  opportunity: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  negative: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

interface MetaOverrides {
  preset?: string;
  format?: 'REEL' | 'CAROUSEL' | 'IMAGE';
  day?: string;
  hour?: number;
  pattern?: string;
}

// Pull structured overrides off the URL. /meta page's "Make more like this"
// and "Apply all learnings" CTAs link here with query params. Returns
// `undefined` (not an empty object) when nothing is present so we can skip
// sending the field to the API.
function readMetaOverrides(sp: URLSearchParams): MetaOverrides | undefined {
  const preset = sp.get('preset') ?? undefined;
  const rawFormat = sp.get('metaFormat')?.toUpperCase();
  const format =
    rawFormat === 'REEL' || rawFormat === 'CAROUSEL' || rawFormat === 'IMAGE'
      ? rawFormat
      : undefined;
  const day = sp.get('metaDay') ?? undefined;
  const hourRaw = sp.get('metaHour');
  const hour = hourRaw != null && /^\d+$/.test(hourRaw) ? parseInt(hourRaw, 10) : undefined;
  const pattern = sp.get('metaPattern') ?? undefined;
  if (!preset && !format && !day && hour === undefined && !pattern) return undefined;
  return { preset, format, day, hour, pattern };
}

export function SmartPostsDashboard() {
  // Legacy /meta deep-link overrides still read directly off the URL. The
  // new `useHubState` owns source/brand/ig, but metaOverrides is a one-off
  // seed mechanism that predates hub state.
  const searchParams = useSearchParams();
  const metaOverrides = useMemo(
    () => readMetaOverrides(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const { accounts, loading: accountsLoading } = useIgAccounts();
  const hasIgAccounts = accounts.length > 0;

  // Default source: meta when at least one IG account is connected, otherwise
  // scrape. While accounts are still loading we fall back to scrape so the UI
  // renders immediately; once loaded, useHubState will honor URL/localStorage
  // if the user had previously chosen a different source.
  const resolvedSourceDefault = !accountsLoading && hasIgAccounts ? 'meta' : 'scrape';
  const { source, brand, ig, setSource, setBrand, setIg } = useHubState({
    defaults: { source: resolvedSourceDefault },
  });

  // If Meta is not connected, never let source stick as 'meta' — force scrape
  // on the client. This handles the edge where URL/localStorage holds 'meta'
  // but the user has since disconnected every IG account.
  useEffect(() => {
    if (!accountsLoading && !hasIgAccounts && source === 'meta') {
      setSource('scrape');
    }
  }, [accountsLoading, hasIgAccounts, source, setSource]);

  const [brandList, setBrandList] = useState<BrandRow[]>([]);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStage, setRefreshStage] = useState<'idle' | 'syncing' | 'analyzing'>('idle');
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [post, setPost] = useState<PerfectPost | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleOk, setScheduleOk] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  // Brand list fetch — still owned here so the dashboard can render a select
  // and so handleSchedule can look up the brand slug. The selected value is
  // authoritatively the `brand` from useHubState. When nothing is selected yet
  // we pick the first row so the existing insight + generate flow works.
  useEffect(() => {
    fetch('/api/brands')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { brands?: BrandRow[] } | null) => {
        const rows = data?.brands ?? [];
        setBrandList(rows);
        if (!brand && rows[0]) setBrand(rows[0].id);
      })
      .catch(() => {});
    // Run exactly once on mount. We intentionally don't react to `brand`
    // changes here — that would re-fetch on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep `ig` in sync with the selected brand. Brands map 1:1 to IG accounts
  // via `brand.instagramHandle`, so the user only ever picks a brand — IG is
  // resolved from it. Re-runs when accounts finish loading so the resolution
  // succeeds even when accounts arrive after the brand list.
  useEffect(() => {
    if (accountsLoading || brandList.length === 0) return;
    const resolved = resolveIgForBrand(brand, brandList, accounts);
    if (resolved !== ig) setIg(resolved);
  }, [brand, brandList, accounts, accountsLoading, ig, setIg]);

  const brandId = brand ?? '';

  const loadHistory = useCallback(async (bid: string) => {
    if (!bid) return setHistory(null);
    try {
      const res = await fetch(`/api/smart-posts/history?brandId=${encodeURIComponent(bid)}`);
      if (!res.ok) return setHistory(null);
      setHistory((await res.json()) as HistoryPayload);
    } catch {
      setHistory(null);
    }
  }, []);

  const loadInsights = useCallback(async (force: boolean) => {
    if (!brandId) {
      setInsights([]);
      setHealthScore(null);
      setLoadingInsights(false);
      return;
    }
    if (force) setRefreshing(true);
    else setLoadingInsights(true);
    setLoadError(null);
    try {
      // On forced refresh: first rescrape fresh Instagram + Buffer engagement,
      // THEN recompute insights off the updated rows. Otherwise insights would
      // just re-derive the same numbers from stale data.
      if (force) {
        setRefreshStage('syncing');
        setRefreshMessage('Pulling fresh Instagram + Buffer engagement…');
        try {
          const syncRes = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: 'all' }),
          });
          if (syncRes.ok) {
            const j = (await syncRes.json()) as {
              results?: { instagram?: { postsSynced?: number }; buffer?: { postsSynced?: number } };
            };
            const igN = j.results?.instagram?.postsSynced ?? 0;
            const bufN = j.results?.buffer?.postsSynced ?? 0;
            setRefreshMessage(
              igN + bufN > 0
                ? `Synced ${igN} Instagram posts, ${bufN} Buffer posts — analyzing…`
                : 'No new posts found — re-analyzing…',
            );
          } else {
            // Non-fatal — still recompute off whatever data we have.
            setRefreshMessage('Sync had issues — analyzing existing data…');
          }
        } catch {
          setRefreshMessage('Sync had issues — analyzing existing data…');
        }
      }

      setRefreshStage(force ? 'analyzing' : 'idle');
      const res = await fetch(
        `/api/insights?type=analytics&brandId=${encodeURIComponent(brandId)}`,
        { method: force ? 'POST' : 'GET' },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(body.error ?? 'Failed to load insights');
        setInsights([]);
        return;
      }
      const data = (await res.json()) as {
        insights?: InsightCard[];
        healthScore?: number;
      };
      setInsights(data.insights ?? []);
      setHealthScore(typeof data.healthScore === 'number' ? data.healthScore : null);
      if (force) {
        // Re-check delta now that a fresh snapshot was written.
        void loadHistory(brandId);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
      setInsights([]);
    } finally {
      setLoadingInsights(false);
      setRefreshing(false);
      setRefreshStage('idle');
      if (force) setTimeout(() => setRefreshMessage(null), 4000);
    }
  }, [brandId, loadHistory]);

  useEffect(() => {
    void loadInsights(false);
  }, [loadInsights]);

  useEffect(() => {
    void loadHistory(brandId);
    // New brand → drop the existing preview; it was brand-specific.
    setPost(null);
    setGenError(null);
    setScheduleOk(false);
  }, [brandId, loadHistory]);

  const actionable = useMemo(
    () => insights.filter(isActionable).sort((a, b) => a.priority - b.priority),
    [insights],
  );

  // Resolve the handle for the currently-selected IG account. Used in the
  // god-mode button label. Falls back to the igUserId when the account has
  // no stored username (rare, but possible for freshly-connected accounts).
  const selectedIgHandle = useMemo(() => {
    if (!ig) return null;
    const match = accounts.find((a) => a.igUserId === ig);
    return match?.igUsername ?? ig;
  }, [ig, accounts]);

  const canGenerate = Boolean(brandId) && actionable.length > 0 && !generating;
  const godModeReady = source === 'meta' && Boolean(ig);

  const handleGenerate = async () => {
    if (!brandId) return;
    setGenerating(true);
    setGenError(null);
    setScheduleOk(false);
    try {
      const useGodMode = godModeReady;
      const url = useGodMode ? '/api/smart-posts/god-mode' : '/api/smart-posts/generate';
      const likeOf = searchParams.get('likeOf') ?? undefined;
      const learningIds = decodeLearnings(searchParams.get('learnings'));
      const learningIdsField = learningIds.length > 0 ? { learningIds } : {};
      const body = useGodMode
        ? { brandId, igUserId: ig, likeOfMediaId: likeOf, ...learningIdsField }
        : { brandId, metaOverrides, igUserId: ig, ...learningIdsField };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const respBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(
          (respBody as { message?: string; error?: string }).message
            ?? (respBody as { error?: string }).error
            ?? 'Generation failed',
        );
        return;
      }
      // Minimum shape guard — the API contract requires these fields; if any are
      // missing we show an error rather than silently rendering a broken post.
      const maybe = respBody as Partial<PerfectPost>;
      if (
        typeof maybe.imageDataUrl !== 'string'
        || typeof maybe.sourceImageUrl !== 'string'
        || typeof maybe.caption !== 'string'
      ) {
        setGenError('Unexpected response from server — please try again.');
        return;
      }
      setPost(respBody as PerfectPost);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setGenerating(false);
    }
  };

  const handleImageSwap = (newImageDataUrl: string, newSourceUrl: string) => {
    setPost((prev) =>
      prev
        ? { ...prev, imageDataUrl: newImageDataUrl, sourceImageUrl: newSourceUrl }
        : prev,
    );
  };

  const handleSchedule = async () => {
    if (!post) return;
    setScheduling(true);
    setGenError(null);
    try {
      const chRes = await fetch('/api/buffer?action=channels');
      if (!chRes.ok) {
        setGenError('Connect Buffer in Settings to schedule posts.');
        return;
      }
      const chData = (await chRes.json()) as {
        organizations?: Array<{ channels: Array<{ id: string; name: string }> }>;
      };
      const channels = (chData.organizations ?? []).flatMap((o) => o.channels ?? []);
      const brandRow = brandList.find((b) => b.id === brandId);
      const brandSlug = brandRow?.slug ?? 'affectly';
      const match = channels.find((c) => c.name.toLowerCase().includes(brandSlug));
      const channelId = match?.id ?? channels[0]?.id;
      if (!channelId) {
        setGenError('No Buffer channels found. Connect one in Settings.');
        return;
      }
      const renderBrand = brandSlug === 'pacebrain' ? 'pacebrain' : 'affectly';
      // Honor the optimal-timing learning: if the server resolved a concrete
      // ISO timestamp from the insight's best day+hour, schedule for that
      // moment. Otherwise fall back to the user's Buffer queue.
      const useCustomTime = Boolean(post.scheduledAt);
      const scheduleRes = await fetch('/api/buffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          text: `${post.caption}\n\n${post.hashtags}`.trim(),
          mode: useCustomTime ? 'customScheduled' : 'addToQueue',
          scheduledAt: useCustomTime ? post.scheduledAt : undefined,
          imageUrl: post.sourceImageUrl,
          brand: renderBrand,
          overlayText: post.hookText,
          textPosition: 'center',
          fontSize: 64,
          overlayStyle: 'editorial',
        }),
      });
      if (!scheduleRes.ok) {
        const err = (await scheduleRes.json().catch(() => ({}))) as { error?: string };
        setGenError(err.error ?? 'Failed to schedule');
        return;
      }
      setScheduleOk(true);
      setTimeout(() => setScheduleOk(false), 3000);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Scheduling error');
    } finally {
      setScheduling(false);
    }
  };

  const handleDownload = () => {
    if (!post) return;
    const link = document.createElement('a');
    link.href = post.imageDataUrl;
    link.download = `perfect-post.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Primary Generate button label. We want user-facing copy to be friendly
  // and specific: god-mode names the handle we're optimizing for; scrape
  // keeps the long-standing "Generate Perfect Post" label so returning
  // users recognize the flow.
  const generateLabel = (() => {
    if (generating) return 'Composing your perfect post';
    if (godModeReady) {
      const handleLabel = selectedIgHandle ?? ig ?? '';
      return `Generate god-mode post for @${handleLabel}`;
    }
    if (metaOverrides) return 'Generate with Analytics seed';
    return 'Generate Perfect Post';
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-4">
        {/* Single brand picker — IG account is resolved from the brand's
            instagramHandle, so we never show a separate IG dropdown. The
            label on each option includes the @handle when we can match it
            to a connected Meta account. */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-white">Brand</label>
          <select
            value={brandId}
            onChange={(e) => setBrand(e.target.value || null)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            {brandList.length === 0 && <option value="">No brands</option>}
            {brandList.map((b) => {
              const matchedHandle = b.instagramHandle
                ? accounts.find(
                    (a) =>
                      a.igUsername?.toLowerCase() ===
                      b.instagramHandle?.replace(/^@/, '').toLowerCase(),
                  )?.igUsername
                : null;
              return (
                <option key={b.id} value={b.id}>
                  {matchedHandle ? `${b.name} (@${matchedHandle})` : b.name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {healthScore !== null && (
            <div className="flex items-center gap-2">
              <span className="text-white">Health</span>
              <span className="text-lg font-semibold text-teal-300">{healthScore}/100</span>
              {history?.delta != null && <DeltaBadge delta={history.delta} />}
            </div>
          )}
          <span className="text-white">·</span>
          <span className="text-white">{actionable.length} learnings</span>
        </div>

        {/* Source toggle: only render when the user has at least one IG
            account connected. Without Meta there's nothing to toggle to. */}
        {hasIgAccounts && (
          <div className="ml-auto">
            <SourceToggle value={source} onChange={setSource} />
          </div>
        )}

        {/* Refresh only makes sense once there's data to re-derive from.
            For a brand with zero insights (e.g. a brand-new account that
            hasn't scraped its IG yet), steer the user to Analytics instead
            of offering a button that would sync nothing and analyze
            nothing. The ml-auto falls to whichever control renders last. */}
        {(actionable.length > 0 || refreshing || loadingInsights) ? (
          <button
            onClick={() => void loadInsights(true)}
            disabled={refreshing || loadingInsights}
            title="Rescrape Instagram + Buffer engagement, then recompute learnings"
            className={`${hasIgAccounts ? '' : 'ml-auto '}inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60`}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshStage === 'syncing'
              ? 'Syncing…'
              : refreshStage === 'analyzing'
                ? 'Analyzing…'
                : 'Refresh Learnings'}
          </button>
        ) : (
          <Link
            href="/analytics"
            className={`${hasIgAccounts ? '' : 'ml-auto '}inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-500`}
          >
            Scrape in Analytics →
          </Link>
        )}
      </div>

      {refreshMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-teal-500/20 bg-teal-500/5 px-3 py-2 text-xs text-teal-200">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshMessage}
        </div>
      )}

      {source === 'meta' && ig && <TopPerformersStrip igUserId={ig} />}

      {loadingInsights ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" /> Couldn&apos;t load insights
          </div>
          <p className="mt-1">{loadError}</p>
        </div>
      ) : actionable.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Generate area */}
          <section className="space-y-4">
            <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-900/20 to-zinc-900/50 p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15">
                  <Sparkles className="h-5 w-5 text-teal-300" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-white">Your Perfect Post</h2>
                  <p className="mt-1 text-sm text-white">
                    One post that embeds every learning from your data — best content type, winning
                    hook, optimal timing, and the topics and hashtags to avoid.
                  </p>
                </div>
              </div>

              {genError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  <AlertCircle className="h-4 w-4" />
                  {genError}
                </div>
              )}

              {metaOverrides && <MetaSeedBanner overrides={metaOverrides} />}

              {!post && (
                <button
                  onClick={() => void handleGenerate()}
                  disabled={!canGenerate}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generateLabel}
                </button>
              )}

              {post && (
                <div className="mt-5 grid gap-5 md:grid-cols-[320px_1fr]">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.imageDataUrl}
                      alt="Your perfect post"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-3 text-sm">
                    <p className="whitespace-pre-wrap text-white">{post.caption}</p>
                    {post.hashtags && <p className="text-xs text-teal-300">{post.hashtags}</p>}
                    {post.suggestedPostTime && (
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/80 px-2.5 py-1 text-xs text-white">
                        <Calendar className="h-3 w-3" />
                        Best time: {post.suggestedPostTime.day} around{' '}
                        {post.suggestedPostTime.hour}:00
                      </p>
                    )}

                    {/* Why This Works — Task 11 replaces this stub with a
                        styled panel. Renders between the caption and the
                        action buttons. */}
                    <WhyThisWorks
                      rationale={post.godModeRationale}
                      contributions={post.contributions}
                      deepProfile={post.deepProfile}
                    />

                    {post.candidates && post.candidates.length > 1 && post.renderParams && (
                      <div className="pt-2">
                        <p className="mb-1.5 text-xs uppercase tracking-wide text-zinc-400">
                          Swap image
                        </p>
                        <CandidateStrip
                          candidates={post.candidates}
                          activeUrl={post.sourceImageUrl}
                          renderParams={post.renderParams}
                          onImageChange={handleImageSwap}
                          onOpenMoreOptions={() => setMoreOptionsOpen(true)}
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => void handleGenerate()}
                        disabled={generating}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                      >
                        {generating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Regenerate
                      </button>
                      <button
                        onClick={() => void handleSchedule()}
                        disabled={scheduling}
                        className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                      >
                        {scheduling ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : scheduleOk ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Calendar className="h-3.5 w-3.5" />
                        )}
                        {scheduleOk ? 'Scheduled!' : 'Schedule to Buffer'}
                      </button>
                      <button
                        onClick={handleDownload}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Ingredients — only truthful AFTER a post is generated. Before
              generation we list actionable learnings; after, each card shows
              EXACTLY what it contributed (or is greyed out as "not used"). */}
          <aside className="space-y-3">
            <h3 className="px-1 text-sm font-semibold text-white">
              {post ? 'What we used' : 'What we can use'}
            </h3>
            <p className="px-1 text-xs text-white">
              {post
                ? 'Each learning shows exactly how it shaped this post.'
                : 'Generate to see which learnings made it into your post.'}
            </p>
            <div className="space-y-2">
              {actionable.map((card) => {
                const contribution = post?.contributions?.[card.type];
                const active = Boolean(contribution);
                const dim = post && !active;
                return (
                  <div
                    key={card.id}
                    className={`rounded-lg border p-3 transition ${
                      active
                        ? 'border-teal-500/50 bg-teal-500/5'
                        : dim
                          ? 'border-zinc-800/40 bg-zinc-900/30 opacity-50'
                          : 'border-zinc-800/60 bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${VERDICT_STYLES[card.verdict]}`}
                      >
                        {card.verdict}
                      </span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-white">{card.title}</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-white">
                          {card.summary}
                        </p>
                        {active && (
                          <p className="mt-1.5 rounded border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-[11px] font-medium text-teal-200">
                            {contribution}
                          </p>
                        )}
                        {dim && (
                          <p className="mt-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
                            Not used this run
                          </p>
                        )}
                      </div>
                      {active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-300" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {post?.renderParams && (
        <MoreOptionsDialog
          open={moreOptionsOpen}
          onOpenChange={setMoreOptionsOpen}
          renderParams={post.renderParams}
          onImageChange={handleImageSwap}
        />
      )}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-white">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        up ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {delta} vs last week
    </span>
  );
}

// Surfaces the URL-supplied overrides so the user can see WHAT from /meta is
// being used as a seed. Visible only when at least one override is present.
function MetaSeedBanner({ overrides }: { overrides: MetaOverrides }) {
  const chips: Array<{ label: string; value: string }> = [];
  if (overrides.format) chips.push({ label: 'Format', value: overrides.format });
  if (overrides.day && overrides.hour !== undefined) {
    chips.push({
      label: 'Best slot',
      value: `${overrides.day} ${String(overrides.hour).padStart(2, '0')}:00`,
    });
  }
  if (overrides.pattern)
    chips.push({ label: 'Pattern', value: overrides.pattern.slice(0, 50) });
  if (overrides.preset)
    chips.push({ label: 'Seed', value: overrides.preset.slice(0, 60) });

  return (
    <div className="mt-4 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
        <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-200">
          Seeded from Analytics
        </span>
      </div>
      <p className="mt-1 text-xs text-white/80">
        These Meta learnings will be merged into your brand insights when you
        generate.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className="rounded-full border border-fuchsia-400/30 bg-black/30 px-2 py-0.5 text-[11px] text-fuchsia-100"
          >
            <span className="opacity-60">{c.label}:</span> {c.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10">
        <Sparkles className="h-7 w-7 text-teal-400" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">No learnings yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-white">
        We need performance data before we can compose your perfect post. Scrape your Instagram
        from Analytics to build it up.
      </p>
      <Link
        href="/analytics"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
      >
        Go to Analytics
      </Link>
    </div>
  );
}
