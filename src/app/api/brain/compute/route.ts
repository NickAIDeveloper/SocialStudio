import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainSnapshots, brainSignals } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { computeSignals } from '@/lib/brain/compute-signals';
import type { IgMediaItem } from '@/lib/meta/ig-analytics';

export const dynamic = 'force-dynamic';

async function loadWindow(brandId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select()
    .from(brainSnapshots)
    .where(and(eq(brainSnapshots.brandId, brandId), gte(brainSnapshots.capturedAt, since)))
    .orderBy(desc(brainSnapshots.capturedAt));
  return rows;
}

function pickLatest<T extends { source: string; payload: unknown }>(rows: T[], source: string): unknown {
  return rows.find((r) => r.source === source)?.payload ?? null;
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const written: { id: string; windowDays: number }[] = [];
  for (const win of [28, 7] as const) {
    const rows = await loadWindow(brandId, win);
    const igRaw = pickLatest(rows, 'ig') as
      | { media: IgMediaItem[]; insightsByMediaId: Record<string, { data?: unknown[] }> }
      | null;
    // Merge insightsByMediaId back into each media item's `insights` field so
    // computeFormatPerformance / computeHeatmap can read post.insights.find(...).
    const ig = igRaw
      ? {
          media: igRaw.media.map((m) => {
            const data = igRaw.insightsByMediaId?.[m.id]?.data ?? [];
            return { ...m, insights: data } as IgMediaItem;
          }),
          insightsByMediaId: igRaw.insightsByMediaId,
        }
      : null;
    const ads = pickLatest(rows, 'ads') as { hasCampaigns: boolean; insights: unknown } | null;
    const compRow = pickLatest(rows, 'competitor_account') as
      | { competitors: { handle: string; followerCount: number | null; postCount: number | null }[] }
      | null;

    const out = computeSignals({
      windowDays: win,
      ig,
      ads,
      competitors: compRow?.competitors ?? [],
    });

    const [inserted] = await db
      .insert(brainSignals)
      .values({
        brandId,
        windowDays: win,
        topFormat: out.topFormat,
        topSlotDow: out.topSlotDow,
        topSlotHour: out.topSlotHour,
        hookPatterns: out.hookPatterns,
        ctaPatterns: out.ctaPatterns,
        captionShape: out.captionShape,
        topicClusters: out.topicClusters,
        competitorSummary: out.competitorSummary,
        adSummary: out.adSummary,
        rawKpis: out.rawKpis,
      })
      .returning({ id: brainSignals.id });

    written.push({ id: inserted.id, windowDays: win });
  }

  return NextResponse.json({ status: 'ok', signals: written });
}
