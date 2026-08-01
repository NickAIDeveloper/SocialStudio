// GET /api/ads/agent-plan?brandId=…
//
// Shows what the ads agent WOULD do. Read-only by construction: it computes a
// plan and returns it, and there is no code path from here to a Meta write.
//
// The agent is intentionally not autonomous — it was scoped as infrastructure
// with no spending authority — so this endpoint is the whole product for now:
// you can watch its judgement against real numbers for as long as you like
// before deciding whether it should ever act.

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, metaAds, metaAdInsights } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import {
  DEFAULT_AGENT_CONFIG, planAgentActions, costPerResult, medianCostPerResult, type AdPerformance,
} from '@/lib/ads/agent-policy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, userId)));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  const ads = await db.select().from(metaAds).where(eq(metaAds.brandId, brand.id));
  const now = Date.now();
  const perf: AdPerformance[] = [];

  for (const a of ads) {
    const [snap] = await db
      .select()
      .from(metaAdInsights)
      .where(eq(metaAdInsights.metaAdsId, a.id))
      .orderBy(desc(metaAdInsights.snapshotDate))
      .limit(1);

    perf.push({
      adId: a.adId ?? a.id,
      createdBy: (a.createdBy as 'human' | 'agent' | null) ?? null,
      status: a.status,
      ageHours: a.createdAt ? (now - a.createdAt.getTime()) / 3_600_000 : 0,
      impressions: snap?.impressions ?? 0,
      spendMinor: snap ? Math.round(Number(snap.spend) * 100) : 0,
      results: snap?.results ?? 0,
    });
  }

  const plan = planAgentActions(perf, DEFAULT_AGENT_CONFIG);
  const decisions = [...plan.pause, ...plan.promote, ...plan.other];

  return NextResponse.json({
    brand: brand.slug,
    executable: false, // there is no write path from this endpoint
    halted: plan.halted,
    haltReason: plan.haltReason,
    config: DEFAULT_AGENT_CONFIG,
    medianCostPerResult: medianCostPerResult(perf.filter(p => p.createdBy === 'agent')),
    counts: { pause: plan.pause.length, promote: plan.promote.length, untouched: plan.other.length },
    ads: perf.map(p => ({
      adId: p.adId,
      createdBy: p.createdBy,
      status: p.status,
      ageHours: Math.round(p.ageHours),
      impressions: p.impressions,
      costPerResult: costPerResult(p),
      decision: decisions.find(d => d.adId === p.adId) ?? null,
    })),
  });
}
