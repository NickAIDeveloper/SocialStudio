import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, brandBrain, brainSignals, brainSnapshots } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, session.user.id)));
  if (!brand) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [brain] = await db.select().from(brandBrain).where(eq(brandBrain.brandId, brandId));
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const recent = await db
    .select({ source: brainSnapshots.source, capturedAt: brainSnapshots.capturedAt })
    .from(brainSnapshots)
    .where(and(eq(brainSnapshots.brandId, brandId), gte(brainSnapshots.capturedAt, sevenDaysAgo)))
    .orderBy(desc(brainSnapshots.capturedAt));

  return NextResponse.json({ brain: brain ?? null, signals28d: s28 ?? null, signals7d: s7 ?? null, recent });
}
