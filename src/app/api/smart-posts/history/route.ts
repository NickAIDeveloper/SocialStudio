import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, isNull, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { healthScoreSnapshots } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');
    const brandFilter = brandId
      ? eq(healthScoreSnapshots.brandId, brandId)
      : isNull(healthScoreSnapshots.brandId);

    const [latest] = await db
      .select()
      .from(healthScoreSnapshots)
      .where(and(eq(healthScoreSnapshots.userId, userId), brandFilter))
      .orderBy(desc(healthScoreSnapshots.dateKey))
      .limit(1);

    if (!latest) return NextResponse.json({ current: null, previous: null, delta: null });

    const ms = 86400 * 1000;
    const start = new Date(Date.now() - 10 * ms).toISOString().slice(0, 10);
    const end = new Date(Date.now() - 5 * ms).toISOString().slice(0, 10);

    const [previous] = await db
      .select()
      .from(healthScoreSnapshots)
      .where(and(
        eq(healthScoreSnapshots.userId, userId),
        brandFilter,
        gte(healthScoreSnapshots.dateKey, start),
        lte(healthScoreSnapshots.dateKey, end),
      ))
      .orderBy(desc(healthScoreSnapshots.dateKey))
      .limit(1);

    return NextResponse.json({
      current: { score: latest.healthScore, dateKey: latest.dateKey },
      previous: previous ? { score: previous.healthScore, dateKey: previous.dateKey } : null,
      delta: previous ? latest.healthScore - previous.healthScore : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}
