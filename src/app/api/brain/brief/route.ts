import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  brainSignals,
  brandBrain,
  type SelectBrainSignals,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { runBrief } from '@/lib/brain/brief-runner';
import { cerebrasChatCompletion } from '@/lib/cerebras';
import type { ComputeSignalsOutput } from '@/lib/brain/compute-signals';

export const dynamic = 'force-dynamic';

function rowToSignals(row: SelectBrainSignals): ComputeSignalsOutput {
  return {
    windowDays: row.windowDays,
    topFormat: row.topFormat as ComputeSignalsOutput['topFormat'],
    topSlotDow: row.topSlotDow,
    topSlotHour: row.topSlotHour,
    hookPatterns: (row.hookPatterns ?? []) as ComputeSignalsOutput['hookPatterns'],
    ctaPatterns: (row.ctaPatterns ?? []) as ComputeSignalsOutput['ctaPatterns'],
    captionShape: (row.captionShape ?? {
      avgLines: 0,
      avgParagraphs: 0,
      emojiDensity: 'low',
      hookToBodyRatio: 0,
    }) as ComputeSignalsOutput['captionShape'],
    topicClusters: (row.topicClusters ?? []) as ComputeSignalsOutput['topicClusters'],
    competitorSummary: (row.competitorSummary ?? {
      totalCompetitors: 0,
      followerGrowthMedian: null,
      postsPerWeekMedian: null,
    }) as ComputeSignalsOutput['competitorSummary'],
    adSummary: (row.adSummary ?? null) as ComputeSignalsOutput['adSummary'],
    rawKpis: (row.rawKpis ?? {
      totalPosts: 0,
      totalReach: 0,
      medianReach: 0,
    }) as ComputeSignalsOutput['rawKpis'],
  };
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  const [s28] = await db
    .select()
    .from(brainSignals)
    .where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 28)))
    .orderBy(desc(brainSignals.computedAt))
    .limit(1);
  const [s7] = await db
    .select()
    .from(brainSignals)
    .where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 7)))
    .orderBy(desc(brainSignals.computedAt))
    .limit(1);

  if (!s28 || !s7) {
    return NextResponse.json({ status: 'partial', reason: 'no_signals' });
  }

  const [prev] = await db.select().from(brandBrain).where(eq(brandBrain.brandId, brandId));

  const result = await runBrief({
    brandName: brand.name,
    todayIso: new Date().toISOString().slice(0, 10),
    signals28d: rowToSignals(s28),
    signals7d: rowToSignals(s7),
    previousBriefMd: prev?.briefMd ?? null,
    previousVersion: prev?.briefVersion ?? 0,
    llmCall: async (system, user) =>
      cerebrasChatCompletion(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 800, temperature: 0.7 }
      ),
  });

  await db
    .insert(brandBrain)
    .values({
      brandId,
      briefMd: result.briefMd,
      briefVersion: result.briefVersion,
      signalsId: s28.id,
      generatedAt: new Date(),
      lastRunAt: new Date(),
      lastRunStatus: result.status === 'ok' ? 'ok' : 'partial',
      lastRunError: result.error ?? null,
      ingestedSources: { ig: 'ok', ads: 'skipped_no_campaigns', competitor_account: 'ok' },
    })
    .onConflictDoUpdate({
      target: brandBrain.brandId,
      set: {
        briefMd: result.briefMd,
        briefVersion: result.briefVersion,
        signalsId: s28.id,
        generatedAt: new Date(),
        lastRunAt: new Date(),
        lastRunStatus: result.status === 'ok' ? 'ok' : 'partial',
        lastRunError: result.error ?? null,
      },
    });

  return NextResponse.json({
    briefVersion: result.briefVersion,
    charCount: result.briefMd.length,
    status: result.status,
  });
}
