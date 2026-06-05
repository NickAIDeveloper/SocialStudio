// src/app/api/autopilot/queue/route.ts
import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, posts } from '@/lib/db/schema';
import { reconcileAutopilotStatuses } from '@/lib/autopilot/reconcile';

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

  // Pull Buffer's ground truth onto our rows before reading them, so a post
  // Buffer already sent shows "Published" (not a stale "Scheduled") and a post
  // Buffer dropped shows "Failed" (not a false "Buffer ✓"). Never throws.
  await reconcileAutopilotStatuses(brandId);

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

// DELETE has two modes — both authenticated via the user's session:
//   1. ?postId=X    — delete a single autopilot post the caller owns (used by
//                     the "Delete this post" button on the preview modal).
//   2. ?brandId=X   — wipe every autopilot row for this brand (used by the
//                     "Clear all" button to start fresh).
// Neither mode unpublishes anything already shipped to Buffer/Instagram — it
// only removes our local rows and frees those images from the no-reuse set.
export async function DELETE(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauth' }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');
  if (postId) {
    const deleted = await db
      .delete(posts)
      .where(
        and(
          eq(posts.id, postId),
          eq(posts.userId, userId),
          eq(posts.source, 'autopilot'),
        ),
      )
      .returning({ id: posts.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'post_not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  const guard = await authorizeBrand(req);
  if (!guard.ok) return guard.res;
  const { brandId } = guard;

  const deleted = await db
    .delete(posts)
    .where(and(eq(posts.brandId, brandId), eq(posts.source, 'autopilot')))
    .returning({ id: posts.id });

  return NextResponse.json({ ok: true, deleted: deleted.length });
}
