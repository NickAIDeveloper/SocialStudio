'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HealthHeroProps {
  healthScore: number | null;
  healthDelta: number | null;
  summary: string | null;
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-(--txt)';
  if (score >= 70) return 'text-(--success)';
  if (score >= 40) return 'text-amber-300';
  return 'text-(--pink)';
}

function deltaColor(delta: number | null): string {
  if (delta === null || delta === 0) return 'text-(--muted)';
  return delta > 0 ? 'text-(--cyan)' : 'text-(--pink)';
}

function DeltaIcon({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return <Minus className="h-3.5 w-3.5" />;
  return delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />;
}

export function HealthHeroCard({ healthScore, healthDelta, summary }: HealthHeroProps) {
  return (
    <div className="surface-card surface-glow p-6">
      <div className="flex items-baseline gap-3">
        <span className={`text-5xl font-bold tracking-tight ${scoreColor(healthScore)}`}>
          {healthScore ?? '—'}
        </span>
        <span className="text-sm text-(--muted)">/ 100 health</span>
        {healthDelta !== null && (
          <span
            className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${deltaColor(healthDelta)}`}
            title="vs last week"
          >
            <DeltaIcon delta={healthDelta} />
            {healthDelta > 0 ? '+' : ''}
            {healthDelta} vs last week
          </span>
        )}
      </div>
      {summary && <p className="mt-3 text-sm text-(--muted)">{summary}</p>}
    </div>
  );
}
