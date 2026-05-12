// src/app/api/autopilot/queue/route.ts
import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, posts } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

async function authorizeBrand(req: Request): Promise<
  | { ok: true; brandId: string }
  | { ok: false; res: Response }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, res: NextResponse.json({ error: 'unauth' }, { status: 401 }) };
  }
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) {
    return { ok: false, res: NextResponse.json({ error: 'missing_brandId' }, { status: 400 }) };
  }
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, session.user.id)));
  if (!brand) {
    return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { ok: true, brandId };
}

export async function GET(req: Request): Promise<Response> {
  const guard = await authorizeBrand(req);
  if (!guard.ok) return guard.res;
  const { brandId } = guard;

  const { searchParams } = new URL(req.url);
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
      processedImageUrl: posts.processedImageUrl,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(eq(posts.brandId, brandId), eq(posts.source, 'autopilot')))
    .orderBy(desc(posts.createdAt))
    .limit(limit);

  return NextResponse.json({ posts: rows });
}

// Wipes every autopilot-generated row for this brand. Used by the "Clear all"
// button in the queue UI when the user wants to start fresh after quality
// fixes (or just to clear cruft). Note: this does not unpublish anything that
// already shipped to Buffer/Instagram — those external posts remain — it only
// clears the local listing AND the no-reuse image set, which lets future
// generations pull from previously-used Pixabay images again.
export async function DELETE(req: Request): Promise<Response> {
  const guard = await authorizeBrand(req);
  if (!guard.ok) return guard.res;
  const { brandId } = guard;

  const deleted = await db
    .delete(posts)
    .where(and(eq(posts.brandId, brandId), eq(posts.source, 'autopilot')))
    .returning({ id: posts.id });

  return NextResponse.json({ ok: true, deleted: deleted.length });
}
