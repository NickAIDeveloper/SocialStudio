import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, autopilotSettings, brainSignals, posts } from '@/lib/db/schema';
import { readBrandBrain } from '@/lib/brain/consume';
import { parseBriefSections } from '@/lib/brain/brief-sections';
import { buildCompetitorIntel } from '@/lib/brain/competitor-intel';
import { buildBrainNarrative } from '@/lib/autopilot/narrative';
import { SUPPORTED_FORMATS, isSupportedFormat } from '@/lib/autopilot/capabilities';

interface StoredHookPattern { pattern: string; sampleSize: number; medianReach?: number }
interface StoredRawKpis { totalPosts?: number; totalReach?: number; medianReach?: number }

async function fetchOwnSignals(brandId: string): Promise<{ hookPattern: string | null; postsReviewed: number }> {
  const [row] = await db
    .select({ hookPatterns: brainSignals.hookPatterns, rawKpis: brainSignals.rawKpis })
    .from(brainSignals)
    .where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 28)))
    .orderBy(desc(brainSignals.computedAt))
    .limit(1);
  if (!row) return { hookPattern: null, postsReviewed: 0 };
  const list = (row.hookPatterns as StoredHookPattern[] | null) ?? [];
  const sorted = [...list].sort((a, b) => (b.sampleSize ?? 0) - (a.sampleSize ?? 0));
  const kpis = (row.rawKpis as StoredRawKpis | null) ?? {};
  return { hookPattern: sorted[0]?.pattern ?? null, postsReviewed: kpis.totalPosts ?? 0 };
}

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WEEKLY_GOAL: Record<string, number> = {
  daily: 7,
  every_other_day: 4,
  three_per_week: 3,
  weekly: 1,
};

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function computeWeekly(
  autopilotPosts: { createdAt: Date | null }[],
  frequency: string | null,
): {
  postsThisWeek: number;
  postsLastWeek: number;
  weeklyGoal: number;
  last14dDaily: { day: string; count: number }[];
  status: 'on_track' | 'close' | 'behind' | 'paused';
} {
  const now = new Date();
  const today = startOfDayUtc(now);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86_400_000);

  const postsThisWeek = autopilotPosts.filter(
    (p) => p.createdAt && p.createdAt >= weekAgo,
  ).length;
  const postsLastWeek = autopilotPosts.filter(
    (p) => p.createdAt && p.createdAt >= twoWeeksAgo && p.createdAt < weekAgo,
  ).length;

  const buckets: Map<string, number> = new Map();
  for (let i = 13; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(day, 0);
  }
  for (const p of autopilotPosts) {
    if (!p.createdAt) continue;
    const day = startOfDayUtc(p.createdAt).toISOString().slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  const last14dDaily = [...buckets.entries()].map(([day, count]) => ({ day, count }));

  const weeklyGoal = frequency ? (WEEKLY_GOAL[frequency] ?? 4) : 4;
  let status: 'on_track' | 'close' | 'behind' | 'paused' = 'on_track';
  if (!frequency) status = 'paused';
  else if (postsThisWeek >= weeklyGoal) status = 'on_track';
  else if (postsThisWeek >= weeklyGoal * 0.5) status = 'close';
  else status = 'behind';

  return { postsThisWeek, postsLastWeek, weeklyGoal, last14dDaily, status };
}

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauth' }, { status: 401 });
  }
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) {
    return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });
  }

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, session.user.id)));
  if (!brand) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const brain = await readBrandBrain(brandId);
  const sections = parseBriefSections(brain?.briefMd);

  let competitorIntel = null;
  try {
    competitorIntel = await buildCompetitorIntel(brandId);
  } catch {
    competitorIntel = null;
  }

  const [settings] = await db
    .select()
    .from(autopilotSettings)
    .where(eq(autopilotSettings.brandId, brandId));

  // Clamp the displayed format to what the pipeline can actually ship.
  // Older brain rows may carry REEL/CAROUSEL even though autopilot only
  // produces single-photo posts. Showing them in the UI would mislead users.
  const formula = brain?.formula
    ? {
        format: isSupportedFormat(brain.formula.format) ? brain.formula.format : SUPPORTED_FORMATS[0],
        bestSlot: {
          day: DAY_NAMES[brain.formula.bestSlot.dow],
          hour: brain.formula.bestSlot.hour,
        },
        captionShape: brain.formula.captionShape,
      }
    : null;

  const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);
  const autopilotPosts = await db
    .select({ createdAt: posts.createdAt })
    .from(posts)
    .where(
      and(
        eq(posts.brandId, brandId),
        eq(posts.source, 'autopilot'),
        gte(posts.createdAt, twoWeeksAgo),
      ),
    );

  const weekly = computeWeekly(autopilotPosts, settings?.frequency ?? null);
  const ownSignals = await fetchOwnSignals(brandId);

  // Narrative is best-effort and cached by briefVersion — a failure here
  // (Cerebras down, parse error) must never block the rest of the response.
  let narrative = null;
  if (brain) {
    try {
      narrative = await buildBrainNarrative({
        brandId,
        briefVersion: brain.briefVersion,
        competitorIntel,
      });
    } catch (err) {
      console.warn('[autopilot/insights] narrative failed:', err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    brain: brain
      ? { briefVersion: brain.briefVersion, generatedAt: brain.generatedAt }
      : null,
    sections,
    formula,
    competitorIntel,
    yourHookPattern: ownSignals.hookPattern,
    yourPostsReviewed: ownSignals.postsReviewed,
    narrative,
    weekly,
    autopilot: settings
      ? {
          enabled: settings.enabled,
          frequency: settings.frequency,
          mode: settings.mode,
          lastRunAt: settings.lastRunAt?.toISOString() ?? null,
          nextRunAt: settings.nextRunAt?.toISOString() ?? null,
          totalGenerated: settings.totalGenerated ?? 0,
          lastError: settings.lastError ?? null,
        }
      : null,
  });
}
