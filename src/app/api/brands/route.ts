import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET() {
  try {
    const userId = await getUserId();

    const rows = await db
      .select()
      .from(brands)
      .where(eq(brands.userId, userId));

    return NextResponse.json({ brands: rows });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch brands' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { name, slug, primaryColor, secondaryColor, instagramHandle, logoUrl } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Name and slug are required' },
        { status: 400 }
      );
    }

    const normalizedSlug = String(slug).toLowerCase();

    if (!SLUG_REGEX.test(normalizedSlug)) {
      return NextResponse.json(
        { error: 'Slug must be lowercase, alphanumeric, and may contain hyphens' },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(brands)
      .values({
        userId,
        name: String(name).slice(0, 100),
        slug: normalizedSlug.slice(0, 100),
        primaryColor: primaryColor || '#14b8a6',
        secondaryColor: secondaryColor || '#0d9488',
        logoUrl: logoUrl || null,
        instagramHandle: instagramHandle || null,
      })
      .returning();

    return NextResponse.json({ brand: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isUniqueViolation = error instanceof Error && error.message.includes('unique');
    const message = isUniqueViolation
      ? 'A brand with that slug already exists'
      : 'Failed to create brand';
    const status = isUniqueViolation ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Brand id is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const [existing] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, id), eq(brands.userId, userId)));

    if (!existing) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      );
    }

    // Build update payload from allowed fields only
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = String(fields.name).slice(0, 100);
    if (fields.slug !== undefined) {
      const normalizedSlug = String(fields.slug).toLowerCase();
      if (!SLUG_REGEX.test(normalizedSlug)) {
        return NextResponse.json(
          { error: 'Slug must be lowercase, alphanumeric, and may contain hyphens' },
          { status: 400 }
        );
      }
      updates.slug = normalizedSlug.slice(0, 100);
    }
    if (fields.primaryColor !== undefined) updates.primaryColor = fields.primaryColor;
    if (fields.secondaryColor !== undefined) updates.secondaryColor = fields.secondaryColor;
    if (fields.logoUrl !== undefined) updates.logoUrl = fields.logoUrl;
    if (fields.instagramHandle !== undefined) updates.instagramHandle = fields.instagramHandle;
    if (fields.websiteUrl !== undefined) updates.websiteUrl = fields.websiteUrl ? String(fields.websiteUrl).slice(0, 255) : null;
    if (fields.description !== undefined) updates.description = fields.description || null;
    if (fields.brandVoiceTone !== undefined) updates.brandVoiceTone = String(fields.brandVoiceTone).slice(0, 20);
    if (fields.brandVoiceStyle !== undefined) updates.brandVoiceStyle = String(fields.brandVoiceStyle).slice(0, 20);
    if (fields.brandVoiceDos !== undefined) updates.brandVoiceDos = fields.brandVoiceDos;
    if (fields.brandVoiceDonts !== undefined) updates.brandVoiceDonts = fields.brandVoiceDonts;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(brands)
      .set(updates)
      .where(and(eq(brands.id, id), eq(brands.userId, userId)))
      .returning();

    return NextResponse.json({ brand: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to update brand' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();

    // Support both body and search params
    let id: string | null = null;
    const { searchParams } = new URL(request.url);
    id = searchParams.get('id');

    if (!id) {
      try {
        const body = await request.json();
        id = body.id;
      } catch {
        // No body provided
      }
    }

    if (!id) {
      return NextResponse.json(
        { error: 'Brand id is required' },
        { status: 400 }
      );
    }

    // Verify ownership before deleting
    const [existing] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, id), eq(brands.userId, userId)));

    if (!existing) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      );
    }

    await db
      .delete(brands)
      .where(and(eq(brands.id, id), eq(brands.userId, userId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to delete brand' },
      { status: 500 }
    );
  }
}
