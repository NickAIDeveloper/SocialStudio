'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import type { InsightCardLike } from '@/lib/analyze/insight-mapper';

interface InsightCardViewProps {
  card: InsightCardLike;
}

const VERDICT_STYLES = {
  positive: 'border-emerald-500/30 bg-emerald-500/5',
  opportunity: 'border-amber-500/30 bg-amber-500/5',
  negative: 'border-rose-500/30 bg-rose-500/5',
} as const;

const VERDICT_ICON = {
  positive: CheckCircle2,
  opportunity: Sparkles,
  negative: AlertCircle,
} as const;

const VERDICT_ICON_COLOR = {
  positive: 'text-emerald-300',
  opportunity: 'text-amber-300',
  negative: 'text-rose-300',
} as const;

export function InsightCardView({ card }: InsightCardViewProps) {
  const [open, setOpen] = useState(false);
  const Icon = VERDICT_ICON[card.verdict];
  return (
    <div className={`rounded-xl border p-4 ${VERDICT_STYLES[card.verdict]}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${VERDICT_ICON_COLOR[card.verdict]}`} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">{card.title}</h3>
          <p className="mt-1 text-sm text-zinc-200">{card.summary}</p>
          {card.action && (
            <p className="mt-2 text-xs font-medium text-teal-300">→ {card.action}</p>
          )}
        </div>
        {card.drillDown && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Hide details' : 'Show details'}
            className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-800/40 hover:text-white"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      {open && card.drillDown && (
        <div className="mt-3 rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
            {card.drillDown.label}
          </p>
          <ul className="space-y-1 text-xs text-zinc-300">
            {card.drillDown.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
