import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, autopilotSettings } from '@/lib/db/schema';
import { readBrandBrain } from '@/lib/brain/consume';
import { parseBriefSections } from '@/lib/brain/brief-sections';
import { buildCompetitorIntel } from '@/lib/brain/competitor-intel';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  const formula = brain?.formula
    ? {
        format: brain.formula.format,
        bestSlot: {
          day: DAY_NAMES[brain.formula.bestSlot.dow],
          hour: brain.formula.bestSlot.hour,
        },
        captionShape: brain.formula.captionShape,
      }
    : null;

  return NextResponse.json({
    brain: brain
      ? { briefVersion: brain.briefVersion, generatedAt: brain.generatedAt }
      : null,
    sections,
    formula,
    competitorIntel,
    autopilot: settings
      ? {
          lastRunAt: settings.lastRunAt?.toISOString() ?? null,
          nextRunAt: settings.nextRunAt?.toISOString() ?? null,
          totalGenerated: settings.totalGenerated ?? 0,
          lastError: settings.lastError ?? null,
        }
      : null,
  });
}
