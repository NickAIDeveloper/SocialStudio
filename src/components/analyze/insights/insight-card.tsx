'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Sparkles, Square, CheckSquare } from 'lucide-react';
import type { InsightCardLike } from '@/lib/analyze/insight-mapper';

interface InsightCardViewProps {
  card: InsightCardLike;
  selected: boolean;
  onToggle: () => void;
}

const VERDICT_STYLES = {
  positive: 'border-(--success)/30 bg-(--success)/5',
  opportunity: 'border-amber-500/30 bg-amber-500/5',
  negative: 'border-(--pink)/30 bg-(--pink)/5',
} as const;

const VERDICT_ICON = {
  positive: CheckCircle2,
  opportunity: Sparkles,
  negative: AlertCircle,
} as const;

const VERDICT_ICON_COLOR = {
  positive: 'text-(--success)',
  opportunity: 'text-amber-300',
  negative: 'text-(--pink)',
} as const;

export function InsightCardView({ card, selected, onToggle }: InsightCardViewProps) {
  const [open, setOpen] = useState(false);
  const Icon = VERDICT_ICON[card.verdict];
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${VERDICT_STYLES[card.verdict]} ${
        selected ? 'ring-2 ring-(--violet)/40' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${VERDICT_ICON_COLOR[card.verdict]}`} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-(--txt)">{card.title}</h3>
          <p className="mt-1 text-sm text-(--muted)">{card.summary}</p>
          {card.action && (
            <p className="mt-2 text-xs font-medium text-(--violet-bright)">→ {card.action}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={selected ? 'Remove from learnings' : 'Use this learning'}
          className="shrink-0 rounded-md p-1 text-(--muted) hover:bg-white/[0.04] hover:text-(--txt)"
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-(--violet-bright)" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
        {card.drillDown && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Hide details' : 'Show details'}
            className="shrink-0 rounded-md p-1 text-(--muted) hover:bg-white/[0.04] hover:text-(--txt)"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      {open && card.drillDown && (
        <div className="mt-3 rounded-lg border border-(--line) bg-(--bg)/50 p-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-(--muted-2)">
            {card.drillDown.label}
          </p>
          <ul className="space-y-1 text-xs text-(--muted)">
            {card.drillDown.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
