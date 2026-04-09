import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scrapedAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

const HANDLE_REGEX = /^[a-zA-Z0-9._]{1,100}$/;

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get('brandId');

    const conditions = [
      eq(scrapedAccounts.userId, userId),
      eq(scrapedAccounts.isCompetitor, true),
    ];

    if (brandId) {
      conditions.push(eq(scrapedAccounts.brandId, brandId));
    }

    const competitors = await db
      .select()
      .from(scrapedAccounts)
      .where(and(...conditions));

    return NextResponse.json({ competitors });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch competitors' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const handle: unknown = body.handle;
    const brandId: unknown = body.brandId;
    const normalizedHandle = (typeof handle === 'string' ? handle : '').trim().replace(/^@/, '');

    if (!HANDLE_REGEX.test(normalizedHandle)) {
      return NextResponse.json(
        {
          error:
            'Invalid handle. Must be 1-100 characters, alphanumeric with dots and underscores only.',
        },
        { status: 400 },
      );
    }

    const existing = await db
      .select({ id: scrapedAccounts.id })
      .from(scrapedAccounts)
      .where(
        and(
          eq(scrapedAccounts.userId, userId),
          eq(scrapedAccounts.handle, normalizedHandle),
        ),
      );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Competitor already exists' },
        { status: 409 },
      );
    }

    const [created] = await db
      .insert(scrapedAccounts)
      .values({
        userId,
        handle: normalizedHandle,
        isCompetitor: true,
        brandId: typeof brandId === 'string' ? brandId : null,
      })
      .returning();

    return NextResponse.json({ competitor: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to add competitor' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();

    let id: string | null = null;

    const url = new URL(request.url);
    id = url.searchParams.get('id');

    if (!id) {
      const body = await request.json().catch(() => null);
      id = body?.id ?? null;
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Competitor id is required' },
        { status: 400 },
      );
    }

    const existing = await db
      .select({ id: scrapedAccounts.id })
      .from(scrapedAccounts)
      .where(
        and(
          eq(scrapedAccounts.id, id),
          eq(scrapedAccounts.userId, userId),
        ),
      );

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Competitor not found or not owned by you' },
        { status: 404 },
      );
    }

    await db
      .delete(scrapedAccounts)
      .where(
        and(
          eq(scrapedAccounts.id, id),
          eq(scrapedAccounts.userId, userId),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to delete competitor' },
      { status: 500 },
    );
  }
}
