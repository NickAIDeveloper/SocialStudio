'use client';

import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Hash,
  Type,
  Zap,
  Trophy,
  AlertTriangle,
  Target,
} from 'lucide-react';
import type { InsightCard as InsightCardType } from '@/lib/health-score';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Hash,
  Type,
  Zap,
  Trophy,
  AlertTriangle,
  Target,
};

const VERDICT_COLORS: Record<InsightCardType['verdict'], string> = {
  positive: 'bg-green-500',
  opportunity: 'bg-amber-500',
  negative: 'bg-red-500',
};

function BestContentType({ data }: { data: Record<string, unknown> }) {
  const bars = data.bars as Array<{ label: string; pct: number }> | undefined;
  if (!bars) return null;

  return (
    <div className="space-y-2">
      {bars.slice(0, 3).map((bar) => (
        <div key={bar.label} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-white">{bar.label}</span>
            <span className="text-white">{bar.pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-teal-500/70"
              style={{ width: `${Math.min(100, bar.pct)}%`, transition: 'width 0.4s ease' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function OptimalTiming({ data }: { data: Record<string, unknown> }) {
  const grid = data.grid as number[][] | undefined;
  if (!grid) return null;

  return (
    <div className="space-y-1">
      <div className="flex gap-0.5 text-[10px] text-zinc-600 pl-7">
        {['6a', '9a', '12p', '6p'].map((t) => (
          <span key={t} className="flex-1 text-center">{t}</span>
        ))}
      </div>
      <div className="space-y-0.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, di) => (
          <div key={`${day}-${di}`} className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-600 w-5 text-right">{day}</span>
            <div className="flex gap-0.5 flex-1">
              {(grid[di] ?? [0, 0, 0, 0]).map((level, ci) => (
                <div
                  key={ci}
                  className="flex-1 h-3 rounded-sm"
                  style={{
                    backgroundColor: level > 0
                      ? `rgba(16, 185, 129, ${Math.min(1, level * 0.25)})`
                      : 'rgba(39, 39, 42, 0.6)',
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HashtagHealth({ data }: { data: Record<string, unknown> }) {
  const drop = data.drop as string[] | undefined;
  const tryTags = data.try as string[] | undefined;
  if (!drop && !tryTags) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {drop && drop.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Drop</p>
          <div className="flex flex-wrap gap-1">
            {drop.map((tag) => (
              <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
      {tryTags && tryTags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-green-400 uppercase tracking-wider">Try</p>
          <div className="flex flex-wrap gap-1">
            {tryTags.map((tag) => (
              <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CaptionLength({ data }: { data: Record<string, unknown> }) {
  const sweetSpot = data.sweetSpot as [number, number] | undefined;
  const current = data.current as number | undefined;
  const max = data.max as number | undefined;
  if (!sweetSpot || current == null || !max) return null;

  const pctStart = (sweetSpot[0] / max) * 100;
  const pctEnd = (sweetSpot[1] / max) * 100;
  const pctCurrent = (current / max) * 100;

  return (
    <div className="space-y-2">
      <div className="relative h-3 rounded-full bg-zinc-800">
        {/* Sweet spot highlight */}
        <div
          className="absolute top-0 h-full rounded-full bg-teal-500/30"
          style={{ left: `${pctStart}%`, width: `${pctEnd - pctStart}%` }}
        />
        {/* Current marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-teal-500"
          style={{ left: `${Math.min(97, pctCurrent)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-white">
        <span>{sweetSpot[0]} chars</span>
        <span className="text-teal-400">sweet spot</span>
        <span>{sweetSpot[1]} chars</span>
      </div>
    </div>
  );
}

function Momentum({ data }: { data: Record<string, unknown> }) {
  const direction = data.direction as 'up' | 'down' | 'flat' | undefined;
  const pct = data.pct as number | undefined;
  if (!direction || pct == null) return null;

  const iconMap = { up: TrendingUp, down: TrendingDown, flat: Minus };
  const colorMap = { up: 'text-green-400', down: 'text-red-400', flat: 'text-amber-400' };
  const Icon = iconMap[direction];

  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-6 h-6 ${colorMap[direction]}`} />
      <span className={`text-lg font-bold ${colorMap[direction]}`}>
        {direction === 'up' ? '+' : direction === 'down' ? '-' : ''}{pct}%
      </span>
    </div>
  );
}

function PostSnippet({ data }: { data: Record<string, unknown> }) {
  const caption = data.caption as string | undefined;
  const reasons = data.reasons as string[] | undefined;

  return (
    <div className="space-y-2">
      {caption && (
        <p className="text-xs text-white leading-relaxed line-clamp-2 italic">
          &ldquo;{caption}&rdquo;
        </p>
      )}
      {reasons && reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {reasons.map((r) => (
            <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-700/50">
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DataVisualization({ type, data }: { type: string; data: Record<string, unknown> }) {
  switch (type) {
    case 'best-content-type':
      return <BestContentType data={data} />;
    case 'optimal-timing':
      return <OptimalTiming data={data} />;
    case 'hashtag-health':
      return <HashtagHealth data={data} />;
    case 'caption-length':
      return <CaptionLength data={data} />;
    case 'momentum':
      return <Momentum data={data} />;
    case 'top-post':
    case 'worst-post':
      return <PostSnippet data={data} />;
    default:
      return null;
  }
}

export default function InsightCard({ type, icon, title, verdict, summary, action, data }: InsightCardType) {
  const IconComponent = ICON_MAP[icon];

  return (
    <div className="glass-card border border-zinc-800/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${VERDICT_COLORS[verdict]}`} />
        {IconComponent && <IconComponent className="w-4 h-4 text-white shrink-0" />}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>

      {/* Summary */}
      <p className="text-sm text-white leading-relaxed">{summary}</p>

      {/* Action */}
      <div className="rounded-md bg-teal-500/10 border border-teal-500/20 px-3 py-2">
        <p className="text-xs text-teal-300 leading-relaxed">{action}</p>
      </div>

      {/* Data visualization */}
      {data && Object.keys(data).length > 0 && (
        <DataVisualization type={type} data={data} />
      )}
    </div>
  );
}
