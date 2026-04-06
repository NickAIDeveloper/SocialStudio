import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { posts, brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

// ── GET /api/posts ─────────────────────────────────────────────────────────────
// Query params: brandId, status (comma-separated), limit (default 50), offset (default 0)

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);

    const brandId = searchParams.get('brandId');
    const statusParam = searchParams.get('status');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const conditions = [eq(posts.userId, userId)];

    if (brandId) {
      conditions.push(eq(posts.brandId, brandId));
    }

    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(posts.status, statuses[0]));
      } else if (statuses.length > 1) {
        conditions.push(inArray(posts.status, statuses));
      }
    }

    const rows = await db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ posts: rows });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

// ── POST /api/posts ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();

    const {
      brandId,
      caption,
      hashtags,
      hookText,
      contentType,
      overlayStyle,
      textPosition,
      fontSize,
      sourceImageUrl,
      processedImageUrl,
      status,
    } = body;

    if (!brandId || !caption) {
      return NextResponse.json(
        { error: 'brandId and caption are required' },
        { status: 400 },
      );
    }

    // Verify the brand belongs to the user
    const [brand] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.userId, userId)));

    if (!brand) {
      return NextResponse.json(
        { error: 'Brand not found or not owned by user' },
        { status: 403 },
      );
    }

    const [created] = await db
      .insert(posts)
      .values({
        userId,
        brandId,
        caption: String(caption),
        hashtags: hashtags ?? null,
        hookText: hookText ?? null,
        contentType: contentType ?? null,
        overlayStyle: overlayStyle ?? null,
        textPosition: textPosition ?? null,
        fontSize: fontSize ?? 80,
        sourceImageUrl: sourceImageUrl ?? null,
        processedImageUrl: processedImageUrl ?? null,
        status: status || 'draft',
      })
      .returning();

    return NextResponse.json({ post: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}

// ── PUT /api/posts ─────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 });
    }

    // Verify ownership
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)));

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Build update payload from allowed fields
    const allowedFields = [
      'caption', 'hashtags', 'hookText', 'contentType', 'overlayStyle',
      'textPosition', 'fontSize', 'sourceImageUrl', 'processedImageUrl',
      'status', 'scheduledAt', 'publishedAt', 'bufferPostId',
    ] as const;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates[key] = fields[key];
      }
    }

    if (Object.keys(updates).length === 1) {
      // Only updatedAt, no real fields
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const [updated] = await db
      .update(posts)
      .set(updates)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)))
      .returning();

    return NextResponse.json({ post: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 });
  }
}

// ── DELETE /api/posts ──────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    let id: string | null = searchParams.get('id');

    if (!id) {
      try {
        const body = await request.json();
        id = body.id;
      } catch {
        // No body provided
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 });
    }

    // Verify ownership
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)));

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    await db
      .delete(posts)
      .where(and(eq(posts.id, id), eq(posts.userId, userId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 });
  }
}
