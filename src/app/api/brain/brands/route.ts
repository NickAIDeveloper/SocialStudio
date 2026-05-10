import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  if (!(await verifyBrainSignature(req, ''))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const rows = await db.select({ id: brands.id, name: brands.name }).from(brands);
  return NextResponse.json(rows);
}
