// src/components/analyze/insights/insight-feed.tsx
'use client';

import { useState, useCallback } from 'react';
import type { AnalysisResult } from '@/lib/analyze/types';
import type { InsightCard } from '@/lib/health-score';
import { mapDeepProfileToCards, type InsightCardLike } from '@/lib/analyze/insight-mapper';
import { HealthHeroCard } from './health-hero';
import { InsightCardView } from './insight-card';
import { LearningsCtaDock } from './learnings-cta-dock';

function adaptInsight(card: InsightCard): InsightCardLike {
  return {
    id: card.id,
    title: card.title,
    verdict: card.verdict,
    summary: card.summary,
    action: card.action,
    priority: card.priority,
  };
}

interface InsightFeedProps {
  result: AnalysisResult;
}

export function InsightFeed({ result }: InsightFeedProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const analyticsCards = result.analyticsInsights.map(adaptInsight);
  const profileCards = mapDeepProfileToCards(result.deepProfile);
  const allCards = [...analyticsCards, ...profileCards].sort(
    (a, b) => a.priority - b.priority,
  );

  return (
    <div className="space-y-4">
      <HealthHeroCard
        healthScore={result.healthScore}
        healthDelta={result.healthDelta}
        summary={result.summary}
      />
      {allCards.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          No insights available yet — post a few times and run analysis again.
        </div>
      ) : (
        <div className="space-y-3">
          {allCards.map((card) => (
            <InsightCardView
              key={card.id}
              card={card}
              selected={selectedIds.has(card.id)}
              onToggle={() => toggle(card.id)}
            />
          ))}
        </div>
      )}
      <LearningsCtaDock
        selectedIds={selectedIds}
        brandId={result.brandId}
        igUserId={result.igUserId}
      />
    </div>
  );
}
