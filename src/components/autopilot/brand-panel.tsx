'use client';
import { useCallback, useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import {
  ChevronDown,
  Check,
  AlertTriangle,
  PauseCircle,
  Brain,
  Settings as SettingsIcon,
  History,
  Sparkles,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { AutopilotCard } from './autopilot-card';
import { humanCaptionShape, humanEmoji, humanEngagementAvg, humanFormat, humanHook } from '@/lib/autopilot/humanize';

interface InsightsData {
  brain: { briefVersion: number; generatedAt: string } | null;
  sections: {
    working: string[];
    notWorking: string[];
    formula: string[];
    leanInto: string[];
    drop: string[];
    competitorWatch: string[];
  };
  formula: {
    format: 'REEL' | 'CAROUSEL' | 'IMAGE';
    bestSlot: { day: string; hour: number };
    captionShape: { lines: number; paragraphs: number; emojiDensity: 'low' | 'medium' | 'high' };
  } | null;
  yourHookPattern: string | null;
  yourPostsReviewed: number;
  narrative: {
    narrative: string;
    bullets: string[];
    lastAnalysisAt: string;
  } | null;
  competitorIntel: {
    competitorCount: number;
    sampleSize: number;
    topHashtags: { tag: string; uses: number; avgEngagement: number }[];
    topHookPatterns: { pattern: string; uses: number; avgEngagement: number }[];
    topMediaTypes: { mediaType: string; uses: number; avgEngagement: number }[];
    topPostingSlots: { day: string; hour: number; uses: number; avgEngagement: number }[];
  } | null;
  weekly: {
    postsThisWeek: number;
    postsLastWeek: number;
    weeklyGoal: number;
    last14dDaily: { day: string; count: number }[];
    status: 'on_track' | 'close' | 'behind' | 'paused';
  };
  autopilot: {
    enabled: boolean;
    frequency: string;
    mode: string;
    lastRunAt: string | null;
    nextRunAt: string | null;
    totalGenerated: number;
    lastError: string | null;
  } | null;
}

type TabKey = 'brain' | 'recent' | 'settings';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function timeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'due now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

function formatHour(h: number): string {
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

const STATUS_META = {
  on_track: { label: 'Hitting your goal', dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-500/30', icon: Check },
  close: { label: 'Almost there', dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-500/30', icon: Minus },
  behind: { label: 'Falling behind', dot: 'bg-rose-400', text: 'text-rose-300', ring: 'ring-rose-500/30', icon: AlertTriangle },
  paused: { label: 'Paused', dot: 'bg-zinc-500', text: 'text-zinc-400', ring: 'ring-zinc-700/30', icon: PauseCircle },
} as const;

function Sparkline({ data, color }: { data: { day: string; count: number }[]; color: string }) {
  return (
    <div className="h-10 w-32">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
          <Line
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeltaBadge({ thisWeek, lastWeek }: { thisWeek: number; lastWeek: number }) {
  const delta = thisWeek - lastWeek;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <Minus className="h-3 w-3" />
        same as last week
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <TrendingUp className="h-3 w-3" />+{delta} vs last week
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-rose-400">
      <TrendingDown className="h-3 w-3" />
      {delta} vs last week
    </span>
  );
}

function Chip({ children, variant }: { children: React.ReactNode; variant: 'lean' | 'drop' | 'neutral' | 'good' | 'bad' }) {
  const styles = {
    lean: 'bg-teal-950/40 text-teal-300 border-teal-900/50',
    drop: 'bg-zinc-900 text-zinc-500 border-zinc-800 line-through',
    neutral: 'bg-zinc-900 text-zinc-300 border-zinc-800',
    good: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/50',
    bad: 'bg-rose-950/30 text-rose-300 border-rose-900/40',
  }[variant];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${styles}`}>{children}</span>;
}

const NOISE_PHRASES = [
  /,?\s*with no change from the previous brief\.?/gi,
  /,?\s*based on (the|your) [^.,]+\.?/gi,
  /,?\s*indicating[^.,]+\.?/gi,
  /,?\s*suggesting[^.,]+\.?/gi,
  /,?\s*potentially [^.,]+\.?/gi,
];
const BOLD_RE = /\*\*([^*]+)\*\*/g;

function stripMarkdown(s: string): string {
  return s.replace(BOLD_RE, '$1').replace(/[*_`]+/g, '').trim();
}

function extractBoldTerms(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(BOLD_RE)) {
    const term = m[1].trim();
    if (term.length > 0 && term.length < 40 && !out.includes(term)) out.push(term);
  }
  return out;
}

function denoise(s: string): string {
  let out = s;
  for (const re of NOISE_PHRASES) out = out.replace(re, '');
  return stripMarkdown(out).replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
}

function shorten(s: string, max = 90): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return cut.slice(0, lastSpace > 60 ? lastSpace : max) + '…';
}

function bulletsToChips(bullets: string[], max = 3): string[] {
  const chips: string[] = [];
  for (const raw of bullets) {
    const bold = extractBoldTerms(raw);
    if (bold.length > 0) {
      for (const term of bold) {
        if (!chips.includes(term)) chips.push(term);
        if (chips.length >= max) return chips;
      }
    } else {
      const short = shorten(denoise(raw), 50);
      if (short && !chips.includes(short)) chips.push(short);
      if (chips.length >= max) return chips;
    }
  }
  return chips;
}

function buildDecisionSentence(data: InsightsData): string | null {
  if (!data.formula) return null;
  const f = data.formula;
  const type = humanFormat(f.format).toLowerCase();
  const when = `${f.bestSlot.day} at ${formatHour(f.bestSlot.hour)}`;
  const hook = data.yourHookPattern ? humanHook(data.yourHookPattern).toLowerCase() : 'a hook tuned to your top performers';
  return `The brain wants to ship a ${type} on ${when}, opening with ${hook}.`;
}

function BrainTab({ data }: { data: InsightsData }) {
  const [showDetails, setShowDetails] = useState(false);
  const hasBrain = data.brain !== null;
  const ci = data.competitorIntel;

  if (!hasBrain) {
    return (
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 text-sm text-zinc-400">
        <span className="text-amber-300">Brain hasn't run yet.</span> Daily cron fires at 03:00 UTC — discoveries land here once it has data.
      </div>
    );
  }

  const winChips = bulletsToChips(data.sections.working, 3);
  const loseChips = bulletsToChips(data.sections.notWorking, 3);
  const leanChips = bulletsToChips(data.sections.leanInto, 4);
  const dropChips = bulletsToChips(data.sections.drop, 4);

  const compHook = ci?.topHookPatterns[0];
  const compSlot = ci?.topPostingSlots[0];
  const compMedia = ci?.topMediaTypes[0];

  const decision = buildDecisionSentence(data);
  const hasDetails =
    winChips.length > 0 ||
    loseChips.length > 0 ||
    leanChips.length > 0 ||
    dropChips.length > 0 ||
    (ci?.sampleSize ?? 0) > 0;

  return (
    <div className="space-y-4">
      {decision && (
        <div className="rounded-xl border border-teal-900/40 bg-gradient-to-br from-teal-950/30 to-zinc-950 p-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-300">
            The brain's decision
          </div>
          <p className="text-sm leading-relaxed text-white">{decision}</p>
        </div>
      )}

      {data.formula && (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <Sparkles className="h-3 w-3" />
            <span>What the next post will look like</span>
          </div>
          <p className="mb-3 text-xs text-zinc-500">Picked from what worked on your account.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Type" value={humanFormat(data.formula.format)} />
            <Stat label="When it'll post" value={`${data.formula.bestSlot.day} ${formatHour(data.formula.bestSlot.hour)}`} />
            <Stat label="Caption length" value={humanCaptionShape(data.formula.captionShape.lines, data.formula.captionShape.paragraphs)} />
            <Stat label="Emoji style" value={humanEmoji(data.formula.captionShape.emojiDensity)} />
          </div>
        </div>
      )}

      {hasDetails && (
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-900/60 hover:text-zinc-200"
        >
          {showDetails ? 'Hide full breakdown' : 'Show full breakdown'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </button>
      )}

      {showDetails && (winChips.length > 0 || loseChips.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {winChips.length > 0 && (
            <PillBlock title="What's working for you" hint="Patterns the brain noticed in your top posts" icon={<Check className="h-3 w-3 text-emerald-400" />}>
              {winChips.map((c) => <Chip key={c} variant="good">{c}</Chip>)}
            </PillBlock>
          )}
          {loseChips.length > 0 && (
            <PillBlock title="What's falling flat" hint="Things the brain wants to fix on your next post" icon={<AlertTriangle className="h-3 w-3 text-rose-400" />}>
              {loseChips.map((c) => <Chip key={c} variant="bad">{c}</Chip>)}
            </PillBlock>
          )}
        </div>
      )}

      {showDetails && (leanChips.length > 0 || dropChips.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {leanChips.length > 0 && (
            <PillBlock title="More of this" hint="Topics the brain will write about more often" icon={<TrendingUp className="h-3 w-3 text-teal-400" />}>
              {leanChips.map((c) => <Chip key={c} variant="lean">{c}</Chip>)}
            </PillBlock>
          )}
          {dropChips.length > 0 && (
            <PillBlock title="Less of this" hint="Topics it'll quietly stop posting" icon={<TrendingDown className="h-3 w-3 text-zinc-500" />}>
              {dropChips.map((c) => <Chip key={c} variant="drop">{c}</Chip>)}
            </PillBlock>
          )}
        </div>
      )}

      {showDetails && ci && ci.sampleSize > 0 && (
        <div className="rounded-xl border border-amber-900/30 bg-gradient-to-br from-amber-950/15 to-zinc-950 p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              <Target className="h-3 w-3" />
              <span>Borrowing from competitors</span>
            </div>
            <span className="text-[10px] text-zinc-500">Based on {ci.sampleSize} of their posts · {ci.competitorCount} accounts</span>
          </div>
          <p className="mb-3 text-xs text-zinc-400">Where they're beating you. The brain will try these on your next post.</p>

          <div className="grid gap-4 sm:grid-cols-3">
            {compHook && (
              <VsStat
                label="How they start captions"
                you={humanHook(data.yourHookPattern)}
                them={humanHook(compHook.pattern)}
                themDetail={humanEngagementAvg(compHook.avgEngagement)}
              />
            )}
            {compSlot && (
              <VsStat
                label="Best time to post"
                you={data.formula ? `${data.formula.bestSlot.day.slice(0, 3)} ${formatHour(data.formula.bestSlot.hour)}` : '—'}
                them={`${compSlot.day.slice(0, 3)} ${formatHour(compSlot.hour)}`}
                themDetail={humanEngagementAvg(compSlot.avgEngagement)}
              />
            )}
            {compMedia && (
              <VsStat
                label="Post type that wins"
                you={data.formula ? humanFormat(data.formula.format) : '—'}
                them={humanFormat(compMedia.mediaType)}
                themDetail={humanEngagementAvg(compMedia.avgEngagement)}
              />
            )}
          </div>

          {ci.topHashtags.length > 0 && (
            <div className="mt-4 border-t border-zinc-800/60 pt-3">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                Hashtags worth borrowing <span className="normal-case tracking-normal text-zinc-600">(number = avg likes per post that used it)</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {ci.topHashtags.slice(0, 5).map((h) => (
                  <Chip key={h.tag} variant="neutral">
                    {h.tag} <span className="text-zinc-500">·{h.avgEngagement.toLocaleString()}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PillBlock({ title, hint, icon, children }: { title: string; hint?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {icon}
        <span>{title}</span>
      </div>
      {hint && <p className="mb-2.5 text-[11px] text-zinc-500">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function VsStat({ label, you, them, themDetail }: { label: string; you: string; them: string; themDetail: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/40 bg-zinc-950/40 p-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] uppercase text-zinc-500">You</div>
          <div className="truncate text-sm font-medium text-zinc-300">{you}</div>
        </div>
        <div className="border-l border-zinc-800 pl-2">
          <div className="text-[9px] uppercase text-amber-400/80">Them</div>
          <div className="truncate text-sm font-semibold text-amber-200">{them}</div>
          <div className="text-[10px] text-zinc-500">{themDetail}</div>
        </div>
      </div>
    </div>
  );
}

function RecentTab({ brandId, refreshKey }: { brandId: string; refreshKey: number }) {
  interface QueuePost {
    id: string;
    hookText: string | null;
    caption: string | null;
    status: string;
    scheduledAt: string | null;
    createdAt: string | null;
    processedImageUrl: string | null;
    sourceImageUrl: string | null;
  }
  const [items, setItems] = useState<QueuePost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    fetch(`/api/autopilot/queue?brandId=${brandId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`queue ${r.status}`))))
      .then((d) => {
        if (aborted) return;
        setItems(d.posts ?? []);
      })
      .catch((e: unknown) => {
        if (aborted) return;
        setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      aborted = true;
    };
  }, [brandId, refreshKey]);

  if (err) return <div className="text-xs text-rose-300">Failed to load: {err}</div>;
  if (!items) return <div className="text-xs text-zinc-500">Loading recent posts…</div>;
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-6 text-center text-sm text-zinc-400">
        No autopilot posts yet. Hit <span className="text-teal-300">Run now</span> above to generate the first one.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.slice(0, 8).map((p) => {
        const img = p.processedImageUrl ?? p.sourceImageUrl;
        return (
          <div key={p.id} className="flex gap-3 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-3">
            {img && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={img} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{p.hookText ?? '(no hook)'}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{p.caption ?? ''}</div>
              <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                <span className={`rounded-full px-1.5 py-0.5 ${p.status === 'scheduled' ? 'bg-emerald-950/40 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                  {p.status}
                </span>
                <span className="text-zinc-500">
                  {p.scheduledAt ? `for ${new Date(p.scheduledAt).toLocaleString()}` : p.createdAt ? `made ${timeAgo(p.createdAt)}` : ''}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BrandPanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('brain');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/autopilot/insights?brandId=${brandId}`);
      if (!res.ok) throw new Error(`insights ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [brandId]);

  useEffect(() => {
    load();
  }, [load]);

  if (err) {
    return <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-300">Failed to load {brandName}: {err}</div>;
  }
  if (!data) {
    return (
      <div className="animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
        <div className="h-4 w-32 rounded bg-zinc-800" />
        <div className="mt-3 h-3 w-48 rounded bg-zinc-800/60" />
      </div>
    );
  }

  const status = STATUS_META[data.weekly.status];
  const StatusIcon = status.icon;
  const sparkColor = data.weekly.status === 'on_track' ? '#14b8a6' : data.weekly.status === 'close' ? '#f59e0b' : data.weekly.status === 'behind' ? '#f43f5e' : '#71717a';
  const nextRun = data.autopilot?.nextRunAt ? timeUntil(data.autopilot.nextRunAt) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-4 p-5 text-left transition-colors hover:bg-zinc-900/70"
      >
        <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr_auto]">
          <div className="flex items-center gap-3">
            <span className={`flex h-2.5 w-2.5 rounded-full ${status.dot} ring-4 ${status.ring}`} />
            <div>
              <div className="text-base font-semibold text-white">{brandName}</div>
              <div className={`text-xs ${status.text} flex items-center gap-1`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
                {nextRun && data.autopilot?.enabled && <span className="text-zinc-500"> · next {nextRun}</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Posts shipped this week</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{data.weekly.postsThisWeek}</span>
                <span className="text-xs text-zinc-500">of {data.weekly.weeklyGoal} planned</span>
              </div>
              <DeltaBadge thisWeek={data.weekly.postsThisWeek} lastWeek={data.weekly.postsLastWeek} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Posting rhythm · last 14 days</div>
              <Sparkline data={data.weekly.last14dDaily} color={sparkColor} />
              <div className="text-[10px] text-zinc-500">{data.autopilot?.totalGenerated ?? 0} total posts shipped all time</div>
            </div>
          </div>
        </div>

        <ChevronDown className={`h-5 w-5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-zinc-800/60 bg-zinc-950/40">
          <LearningLedger data={data} />
          <div className="flex gap-1 border-b border-zinc-800/60 px-4">
            <TabButton active={tab === 'brain'} onClick={() => setTab('brain')} icon={<Brain className="h-3.5 w-3.5" />}>
              What it learned
            </TabButton>
            <TabButton active={tab === 'recent'} onClick={() => setTab('recent')} icon={<History className="h-3.5 w-3.5" />}>
              Recent posts
            </TabButton>
            <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<SettingsIcon className="h-3.5 w-3.5" />}>
              Settings
            </TabButton>
          </div>

          <div className="p-5">
            {tab === 'brain' && <BrainTab data={data} />}
            {tab === 'recent' && <RecentTab brandId={brandId} refreshKey={refreshKey} />}
            {tab === 'settings' && (
              <div onClick={() => setRefreshKey((n) => n + 1)}>
                <AutopilotCard brandId={brandId} brandName={brandName} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtAnalyzedAt(iso: string | undefined | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'never';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

function LearningLedger({ data }: { data: InsightsData }) {
  if (!data.brain) {
    return (
      <div className="border-b border-zinc-800/60 bg-zinc-900/30 px-5 py-3 text-xs text-zinc-400">
        <span className="text-amber-300">Brain hasn't analyzed yet.</span> Next analysis runs nightly at 03:00 UTC.
      </div>
    );
  }
  const reviewedOwn = data.yourPostsReviewed ?? 0;
  const reviewedComp = data.competitorIntel?.sampleSize ?? 0;
  const compCount = data.competitorIntel?.competitorCount ?? 0;
  return (
    <div className="border-b border-zinc-800/60 bg-gradient-to-r from-teal-950/20 to-zinc-950/40 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-teal-300">
          <Brain className="h-3.5 w-3.5" />
          Last analyzed {fmtAnalyzedAt(data.brain.generatedAt)} ({timeAgo(data.brain.generatedAt)})
        </span>
        <span className="text-zinc-500">
          Reviewed <span className="text-zinc-200">{reviewedOwn}</span> of your posts
          {reviewedComp > 0 && <> + <span className="text-zinc-200">{reviewedComp}</span> competitor posts across <span className="text-zinc-200">{compCount}</span> accounts</>}
        </span>
        <span className="text-zinc-500">Brain v{data.brain.briefVersion}</span>
      </div>

      {data.narrative ? (
        <div className="mt-2.5 rounded-lg border border-teal-900/40 bg-zinc-950/60 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-300">
            <Sparkles className="h-3 w-3" />
            <span>What changed this run</span>
          </div>
          <p className="text-xs leading-relaxed text-zinc-200">{data.narrative.narrative}</p>
          {data.narrative.bullets.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {data.narrative.bullets.map((b, i) => (
                <li key={i} className="text-[11px] text-zinc-400">
                  <span className="text-teal-400">→</span> {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-zinc-500">
          Each new post is designed from these findings — what got the most likes, comments, and reach on your account and on theirs.
        </p>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
        active ? 'border-teal-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
