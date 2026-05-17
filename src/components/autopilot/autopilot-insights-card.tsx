'use client';
import { useEffect, useState } from 'react';
import { Check, X, TrendingUp, TrendingDown, Sparkles, Target, Clock, Hash, Brain } from 'lucide-react';

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
  autopilot: {
    lastRunAt: string | null;
    totalGenerated: number;
  } | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatHour(h: number): string {
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

function Chip({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'good' | 'bad' | 'lean' | 'drop' | 'neutral';
}) {
  const styles = {
    good: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/50',
    bad: 'bg-rose-950/40 text-rose-300 border-rose-900/50',
    lean: 'bg-teal-950/40 text-teal-300 border-teal-900/50',
    drop: 'bg-zinc-900 text-zinc-400 border-zinc-800 line-through',
    neutral: 'bg-zinc-900 text-zinc-300 border-zinc-800',
  }[variant];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${styles}`}>
      {children}
    </span>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        {icon}
        <span>{title}</span>
        {count !== undefined && count > 0 && (
          <span className="text-zinc-500">({count})</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function AutopilotInsightsCard({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/autopilot/insights?brandId=${brandId}`);
        if (!res.ok) throw new Error(`insights ${res.status}`);
        setData(await res.json());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5 animate-pulse">
        <div className="h-4 w-40 rounded bg-zinc-800" />
        <div className="mt-3 h-3 w-64 rounded bg-zinc-800/60" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-300">
        Failed to load insights: {err}
      </div>
    );
  }

  if (!data) return null;

  const hasBrain = data.brain !== null;
  const hasAnySection =
    data.sections.working.length > 0 ||
    data.sections.notWorking.length > 0 ||
    data.sections.leanInto.length > 0 ||
    data.sections.drop.length > 0;
  const hasCompetitorData = data.competitorIntel && data.competitorIntel.sampleSize > 0;

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/70 to-zinc-950 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-white">
            {brandName} <span className="text-zinc-500">· what the brain learned</span>
          </h3>
        </div>
        <div className="text-xs text-zinc-500">
          {hasBrain ? (
            <>
              Brain v{data.brain!.briefVersion} · updated {timeAgo(data.brain!.generatedAt)}
              {data.autopilot && (
                <>
                  {' · '}last run {timeAgo(data.autopilot.lastRunAt)} · {data.autopilot.totalGenerated} posts shipped
                </>
              )}
            </>
          ) : (
            <span className="text-amber-300">No brain yet — waiting for first daily run.</span>
          )}
        </div>
      </div>

      {!hasAnySection && !hasCompetitorData && hasBrain && (
        <p className="text-xs text-zinc-500">
          Brain exists but no actionable insights yet. Keep posting; signals get sharper with more data.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data.sections.working.length > 0 && (
          <Section icon={<Check className="h-3 w-3 text-emerald-400" />} title="Discovered" count={data.sections.working.length}>
            <ul className="space-y-1.5">
              {data.sections.working.slice(0, 5).map((b, i) => (
                <li key={i} className="text-xs text-zinc-300 leading-relaxed">
                  <span className="text-emerald-400">✓</span> {b}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.sections.notWorking.length > 0 && (
          <Section icon={<X className="h-3 w-3 text-rose-400" />} title="Not working" count={data.sections.notWorking.length}>
            <ul className="space-y-1.5">
              {data.sections.notWorking.slice(0, 5).map((b, i) => (
                <li key={i} className="text-xs text-zinc-400 leading-relaxed">
                  <span className="text-rose-400">✗</span> {b}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.sections.leanInto.length > 0 && (
          <Section icon={<TrendingUp className="h-3 w-3 text-teal-400" />} title="Will lean into" count={data.sections.leanInto.length}>
            <div className="flex flex-wrap gap-1.5">
              {data.sections.leanInto.slice(0, 8).map((b, i) => (
                <Chip key={i} variant="lean">{b}</Chip>
              ))}
            </div>
          </Section>
        )}

        {data.sections.drop.length > 0 && (
          <Section icon={<TrendingDown className="h-3 w-3 text-zinc-500" />} title="Won't do anymore" count={data.sections.drop.length}>
            <div className="flex flex-wrap gap-1.5">
              {data.sections.drop.slice(0, 8).map((b, i) => (
                <Chip key={i} variant="drop">{b}</Chip>
              ))}
            </div>
          </Section>
        )}
      </div>

      {data.formula && (
        <div className="mt-5 rounded-lg border border-teal-900/40 bg-teal-950/20 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-300">
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

      {hasCompetitorData && (
        <div className="mt-4 rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              <Target className="h-3 w-3" />
              <span>Competitor watch</span>
            </div>
            <span className="text-[10px] text-zinc-500">
              {data.competitorIntel!.sampleSize} posts · {data.competitorIntel!.competitorCount} competitors
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {data.competitorIntel!.topHookPatterns[0] && (
              <CompStat
                label="Winning hook style"
                value={data.competitorIntel!.topHookPatterns[0].pattern}
                detail={`${data.competitorIntel!.topHookPatterns[0].avgEngagement.toLocaleString()} avg eng`}
              />
            )}
            {data.competitorIntel!.topMediaTypes[0] && (
              <CompStat
                label="Top media type"
                value={data.competitorIntel!.topMediaTypes[0].mediaType}
                detail={`${data.competitorIntel!.topMediaTypes[0].avgEngagement.toLocaleString()} avg eng`}
              />
            )}
            {data.competitorIntel!.topPostingSlots[0] && (
              <CompStat
                label="Hottest slot"
                icon={<Clock className="h-3 w-3" />}
                value={`${data.competitorIntel!.topPostingSlots[0].day} ${formatHour(data.competitorIntel!.topPostingSlots[0].hour)}`}
                detail={`${data.competitorIntel!.topPostingSlots[0].avgEngagement.toLocaleString()} avg eng`}
              />
            )}
            {data.competitorIntel!.topHashtags.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                  <Hash className="h-3 w-3" /> Hashtags borrowed
                </div>
                <div className="flex flex-wrap gap-1">
                  {data.competitorIntel!.topHashtags.slice(0, 4).map((h) => (
                    <Chip key={h.tag} variant="neutral">
                      {h.tag}
                      <span className="text-zinc-500">·{h.avgEngagement.toLocaleString()}</span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function CompStat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-white">{value}</div>
      <div className="text-[11px] text-zinc-500">{detail}</div>
    </div>
  );
}
