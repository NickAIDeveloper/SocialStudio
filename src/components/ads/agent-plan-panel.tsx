'use client';

import { useEffect, useState } from 'react';

interface Decision { action: string; reason: string }
interface PlanAd {
  adId: string; createdBy: string | null; status: string;
  ageHours: number; impressions: number; costPerResult: number | null;
  decision: Decision | null;
}
interface Plan {
  brand: string; halted: boolean; haltReason: string | null;
  counts: { pause: number; promote: number; untouched: number };
  ads: PlanAd[];
}

const ACTION_STYLE: Record<string, string> = {
  pause: 'text-amber-300',
  promote: 'text-(--success)',
  wait: 'text-(--muted)',
  keep: 'text-(--muted)',
  skip: 'text-(--muted-2)',
};

export function AgentPlanPanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    fetch(`/api/ads/agent-plan?brandId=${brandId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [brandId]);

  if (!plan) return null;

  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium text-(--txt)">🎛️ Ads agent · {brandName}</div>
          <div className="text-xs text-(--muted-2) mt-0.5">
            What it would do. It cannot act — there is no path from here to a change.
          </div>
        </div>
        <span className="text-[10px] rounded-full border border-(--line) px-2 py-0.5 text-(--muted-2)">
          preview only
        </span>
      </div>

      {plan.halted && (
        <div className="mt-3 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">
          Halted: {plan.haltReason}
        </div>
      )}

      {plan.ads.length === 0 ? (
        <div className="mt-3 text-sm text-(--muted)">No ads for this brand yet.</div>
      ) : (
        <>
          <div className="mt-3 text-[11px] text-(--muted-2)">
            would pause {plan.counts.pause} · promote {plan.counts.promote} · leave {plan.counts.untouched}
          </div>
          <div className="mt-2 space-y-1">
            {plan.ads.map((a) => (
              <div key={a.adId} className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="text-(--muted) font-mono truncate max-w-[10rem]">{a.adId}</span>
                <span className="text-(--muted-2)">{a.createdBy ?? 'unknown'}</span>
                <span className="text-(--muted-2)">{a.status}</span>
                <span className="text-(--muted-2)">{a.ageHours}h</span>
                <span className={`ml-auto ${ACTION_STYLE[a.decision?.action ?? 'skip']}`}>
                  {a.decision?.action ?? '—'}
                  <span className="text-(--muted-2)"> ({a.decision?.reason})</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-(--muted-2) border-t border-(--line) pt-2">
            The agent can only ever touch ads it created itself. Anything marked{' '}
            <span className="text-(--txt)">human</span> or{' '}
            <span className="text-(--txt)">unknown</span> is permanently off-limits to it.
          </div>
        </>
      )}
    </div>
  );
}
