// POST /api/ads/advice { adId } — on-demand AI next-step advice for one ad.
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAdInsights, brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { readBrandBrain } from '@/lib/brain/consume';
import { buildCompetitorIntel, type CompetitorIntel } from '@/lib/brain/competitor-intel';
import { evaluateSignals } from '@/lib/ads/signals';
import { getAdvice } from '@/lib/ads/advice';
import type { AdInsight } from '@/lib/meta/ad-insights';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Distil competitor intel into a concise prompt-friendly string, mirroring the
// summarizer in generate/route.ts.
function summarizeCompetitorIntel(intel: CompetitorIntel | null): string | null {
  if (!intel || intel.competitorCount === 0 || intel.sampleSize === 0) return null;
  const parts: string[] = [];
  parts.push(`${intel.competitorCount} competitors, ${intel.sampleSize} top posts analyzed.`);
  if (intel.topHookPatterns.length > 0) {
    parts.push(`Their best hooks lean: ${intel.topHookPatterns.map((h) => h.pattern).slice(0, 3).join(', ')}.`);
  }
  if (intel.topPosts.length > 0) {
    const hooks = intel.topPosts.slice(0, 3).map((p) => `"${p.hook.slice(0, 70)}"`).join(' / ');
    parts.push(`Top competitor hooks: ${hooks}.`);
  }
  return parts.join(' ').slice(0, 800);
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const { adId } = (await req.json()) as { adId?: string };
    if (!adId) return NextResponse.json({ error: 'missing adId' }, { status: 400 });

    const [ad] = await db.select().from(metaAds)
      .where(eq(metaAds.id, adId)).limit(1);
    if (!ad || ad.userId !== userId) return NextResponse.json({ error: 'Ad not found' }, { status: 404 });

    const [snap] = await db.select().from(metaAdInsights)
      .where(eq(metaAdInsights.metaAdsId, ad.id))
      .orderBy(desc(metaAdInsights.snapshotDate)).limit(1);
    if (!snap) return NextResponse.json({ success: true, advice: 'Not enough data yet — check back once this ad has run for a day or two.' });

    const insight: AdInsight = {
      spend: Number(snap.spend), impressions: snap.impressions, reach: snap.reach,
      clicks: snap.clicks, inlineLinkClicks: snap.inlineLinkClicks, ctr: Number(snap.ctr),
      cpc: Number(snap.cpc), frequency: Number(snap.frequency), results: snap.results,
      resultType: snap.resultType ?? 'link_click', currency: snap.currency,
    };
    const signals = evaluateSignals(insight, ad.objective);

    const [brand] = await db.select().from(brands).where(eq(brands.id, ad.brandId)).limit(1);
    const draft = (ad.draft ?? {}) as { headline?: string };

    let briefMd: string | null = null;
    let competitorContext: string | null = null;
    try {
      const [brain, intel] = await Promise.all([
        readBrandBrain(ad.brandId).catch(() => null),
        buildCompetitorIntel(ad.brandId).catch(() => null),
      ]);
      briefMd = brain?.briefMd ?? null;
      competitorContext = summarizeCompetitorIntel(intel);
    } catch { /* optional context — advice still works without it */ }

    try {
      const advice = await getAdvice({
        brandName: brand?.name ?? 'your brand',
        objective: ad.objective,
        insight,
        reasons: signals.reasons,
        headline: draft.headline ?? null,
        briefMd,
        competitorContext,
      });
      return NextResponse.json({ success: true, advice });
    } catch {
      return NextResponse.json({ success: true, advice: 'Could not generate advice right now. Please try again shortly.' });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get advice' }, { status: 500 });
  }
}
