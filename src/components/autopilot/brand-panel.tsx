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
  on_track: { label: 'On track', dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-500/30', icon: Check },
  close: { label: 'Close', dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-500/30', icon: Minus },
  behind: { label: 'Behind', dot: 'bg-rose-400', text: 'text-rose-300', ring: 'ring-rose-500/30', icon: AlertTriangle },
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

function Chip({ children, variant }: { children: React.ReactNode; variant: 'lean' | 'drop' | 'neutral' }) {
  const styles = {
    lean: 'bg-teal-950/40 text-teal-300 border-teal-900/50',
    drop: 'bg-zinc-900 text-zinc-500 border-zinc-800 line-through',
    neutral: 'bg-zinc-900 text-zinc-300 border-zinc-800',
  }[variant];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${styles}`}>{children}</span>;
}

function BrainTab({ data }: { data: InsightsData }) {
  const hasBrain = data.brain !== null;
  const hasAny =
    data.sections.working.length > 0 ||
    data.sections.notWorking.length > 0 ||
    data.sections.leanInto.length > 0 ||
    data.sections.drop.length > 0;
  const ci = data.competitorIntel;

  if (!hasBrain) {
    return (
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4 text-sm text-zinc-400">
        <span className="text-amber-300">Brain hasn't run yet.</span> Daily cron fires at 03:00 UTC — once it has data, your discoveries land here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.formula && (
        <div className="rounded-lg border border-teal-900/40 bg-teal-950/20 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-300">
            <Sparkles className="h-3 w-3" />
            <span>Next post formula</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Format" value={data.formula.format} />
            <Stat label="Best slot" value={`${data.formula.bestSlot.day} ${formatHour(data.formula.bestSlot.hour)}`} />
            <Stat label="Caption shape" value={`${data.formula.captionShape.lines}L · ${data.formula.captionShape.paragraphs}p`} />
            <Stat label="Emoji" value={data.formula.captionShape.emojiDensity} />
          </div>
        </div>
      )}

      {hasAny && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.sections.working.length > 0 && (
            <BulletList icon={<Check className="h-3 w-3 text-emerald-400" />} title="Discovered" items={data.sections.working} color="emerald" />
          )}
          {data.sections.notWorking.length > 0 && (
            <BulletList icon={<AlertTriangle className="h-3 w-3 text-rose-400" />} title="Not working" items={data.sections.notWorking} color="rose" />
          )}
        </div>
      )}

      {(data.sections.leanInto.length > 0 || data.sections.drop.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.sections.leanInto.length > 0 && (
            <div>
              <SectionLabel icon={<TrendingUp className="h-3 w-3 text-teal-400" />} text="Will lean into" />
              <div className="flex flex-wrap gap-1.5">
                {data.sections.leanInto.slice(0, 8).map((b, i) => (
                  <Chip key={i} variant="lean">{b}</Chip>
                ))}
              </div>
            </div>
          )}
          {data.sections.drop.length > 0 && (
            <div>
              <SectionLabel icon={<TrendingDown className="h-3 w-3 text-zinc-500" />} text="Won't do anymore" />
              <div className="flex flex-wrap gap-1.5">
                {data.sections.drop.slice(0, 8).map((b, i) => (
                  <Chip key={i} variant="drop">{b}</Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {ci && ci.sampleSize > 0 && (
        <div className="rounded-lg border border-amber-900/30 bg-amber-950/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              <Target className="h-3 w-3" />
              <span>What competitors win on</span>
            </div>
            <span className="text-[10px] text-zinc-500">{ci.sampleSize} posts · {ci.competitorCount} competitors</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ci.topHookPatterns[0] && (
              <CompStat label="Winning hook style" value={ci.topHookPatterns[0].pattern} detail={`${ci.topHookPatterns[0].avgEngagement.toLocaleString()} avg eng`} />
            )}
            {ci.topMediaTypes[0] && (
              <CompStat label="Top media type" value={ci.topMediaTypes[0].mediaType} detail={`${ci.topMediaTypes[0].avgEngagement.toLocaleString()} avg eng`} />
            )}
            {ci.topPostingSlots[0] && (
              <CompStat label="Hottest slot" value={`${ci.topPostingSlots[0].day} ${formatHour(ci.topPostingSlots[0].hour)}`} detail={`${ci.topPostingSlots[0].avgEngagement.toLocaleString()} avg eng`} />
            )}
            {ci.topHashtags.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">Hashtags worth borrowing</div>
                <div className="flex flex-wrap gap-1">
                  {ci.topHashtags.slice(0, 4).map((h) => (
                    <Chip key={h.tag} variant="neutral">
                      {h.tag} <span className="text-zinc-500">·{h.avgEngagement.toLocaleString()}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BulletList({ icon, title, items, color }: { icon: React.ReactNode; title: string; items: string[]; color: 'emerald' | 'rose' }) {
  const mark = color === 'emerald' ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4">
      <SectionLabel icon={icon} text={title} count={items.length} />
      <ul className="space-y-1.5">
        {items.slice(0, 5).map((b, i) => (
          <li key={i} className="text-xs leading-relaxed text-zinc-300">
            <span className={mark}>{color === 'emerald' ? '✓' : '✗'}</span> {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionLabel({ icon, text, count }: { icon: React.ReactNode; text: string; count?: number }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
      {icon}
      <span>{text}</span>
      {count !== undefined && count > 0 && <span className="text-zinc-500">({count})</span>}
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

function CompStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
      <div className="text-[11px] text-zinc-500">{detail}</div>
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
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Posts this week</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{data.weekly.postsThisWeek}</span>
                <span className="text-xs text-zinc-500">/ {data.weekly.weeklyGoal} goal</span>
              </div>
              <DeltaBadge thisWeek={data.weekly.postsThisWeek} lastWeek={data.weekly.postsLastWeek} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Last 14 days</div>
              <Sparkline data={data.weekly.last14dDaily} color={sparkColor} />
              <div className="text-[10px] text-zinc-500">{data.autopilot?.totalGenerated ?? 0} total shipped</div>
            </div>
          </div>
        </div>

        <ChevronDown className={`h-5 w-5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-zinc-800/60 bg-zinc-950/40">
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
