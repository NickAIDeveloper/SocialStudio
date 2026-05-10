import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
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

  const secret = process.env.BRAIN_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const baseUrl = new URL(req.url).origin;
  const day = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({ runId: randomUUID(), day });
  const sig = createHmac('sha256', secret).update(body).digest('hex');

  const res = await fetch(`${baseUrl}/api/competitors/sync?brandId=${brandId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brain-signature': sig },
    body,
  });
  const json = await res.json().catch(() => null);
  return NextResponse.json({ status: res.status, json });
}
