// src/app/api/autopilot/queue/route.ts
import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, posts } from '@/lib/db/schema';

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

  const limit = Math.min(50, Number(searchParams.get('limit')) || 10);

  const rows = await db
    .select({
      id: posts.id,
      caption: posts.caption,
      hookText: posts.hookText,
      hashtags: posts.hashtags,
      status: posts.status,
      scheduledAt: posts.scheduledAt,
      publishedAt: posts.publishedAt,
      bufferPostId: posts.bufferPostId,
      sourceImageUrl: posts.sourceImageUrl,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(eq(posts.brandId, brandId), eq(posts.source, 'autopilot')))
    .orderBy(desc(posts.createdAt))
    .limit(limit);

  return NextResponse.json({ posts: rows });
}
