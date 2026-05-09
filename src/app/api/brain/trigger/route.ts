// src/app/api/brain/trigger/route.ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

async function callBrainEndpoint(
  path: string,
  body: object,
  secret: string,
  baseUrl: string
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', secret).update(raw).digest('hex');
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brain-signature': sig },
    body: raw,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

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
  const baseUrl = new URL(req.url).origin;
  if (!secret) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const day = new Date().toISOString().slice(0, 10);
  const runId = randomUUID();
  const sources = ['ig', 'ads', 'competitor_account'] as const;
  const results: Record<string, unknown> = {};
  for (const source of sources) {
    results[source] = await callBrainEndpoint(
      `/api/brain/snapshot?brandId=${brandId}&source=${source}`,
      { runId, day },
      secret,
      baseUrl
    );
  }
  results.compute = await callBrainEndpoint(
    `/api/brain/compute?brandId=${brandId}`,
    { runId },
    secret,
    baseUrl
  );
  results.brief = await callBrainEndpoint(
    `/api/brain/brief?brandId=${brandId}`,
    { runId },
    secret,
    baseUrl
  );

  return NextResponse.json({ runId, results });
}
