'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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

interface BrandRow {
  id: string;
  name: string;
  slug: string;
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

export function SmartPostsDashboard() {
  const [brandList, setBrandList] = useState<BrandRow[]>([]);
  const [brandId, setBrandId] = useState<string>('');
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

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { brands?: BrandRow[] } | null) => {
        const rows = data?.brands ?? [];
        setBrandList(rows);
        if (rows[0]) setBrandId(rows[0].id);
      })
      .catch(() => {});
  }, []);

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

  const canGenerate = brandId && actionable.length > 0 && !generating;

  const handleGenerate = async () => {
    if (!brandId) return;
    setGenerating(true);
    setGenError(null);
    setScheduleOk(false);
    try {
      const res = await fetch('/api/smart-posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(
          (body as { message?: string; error?: string }).message
            ?? (body as { error?: string }).error
            ?? 'Generation failed',
        );
        return;
      }
      setPost(body as PerfectPost);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setGenerating(false);
    }
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
      const brand = brandList.find((b) => b.id === brandId);
      const brandSlug = brand?.slug ?? 'affectly';
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-3">
          <label className="text-sm text-white">Brand</label>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
          >
            {brandList.length === 0 && <option value="">No brands</option>}
            {brandList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
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

        {/* Refresh only makes sense once there's data to re-derive from.
            For a brand with zero insights (e.g. a brand-new account that
            hasn't scraped its IG yet), steer the user to Analytics instead
            of offering a button that would sync nothing and analyze
            nothing. */}
        {(actionable.length > 0 || refreshing || loadingInsights) ? (
          <button
            onClick={() => void loadInsights(true)}
            disabled={refreshing || loadingInsights}
            title="Rescrape Instagram + Buffer engagement, then recompute learnings"
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
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
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-500"
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

              {!post && (
                <button
                  onClick={() => void handleGenerate()}
                  disabled={!canGenerate}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Composing your perfect post
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generate Perfect Post
                    </>
                  )}
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
