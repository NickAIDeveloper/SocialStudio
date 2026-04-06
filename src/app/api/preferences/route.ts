import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { userPreferences } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';

export async function GET() {
  try {
    const userId = await getUserId();

    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    if (!prefs) {
      // Return defaults if no row exists yet
      return NextResponse.json({
        success: true,
        data: {
          onboardingCompleted: false,
          onboardingStep: 0,
          defaultOverlayStyle: 'editorial',
          defaultTextPosition: 'center',
          timezone: 'UTC',
          defaultBrandId: null,
        },
      });
    }

    return NextResponse.json({ success: true, data: prefs });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch preferences' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();

    // Allowed fields for update
    const allowedFields = [
      'onboardingCompleted',
      'onboardingStep',
      'defaultBrandId',
      'defaultOverlayStyle',
      'defaultTextPosition',
      'timezone',
    ] as const;

    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 },
      );
    }

    // Upsert: insert if not exists, update if exists
    await db
      .insert(userPreferences)
      .values({
        userId,
        ...updates,
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId],
        set: updates,
      });

    const [updated] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 },
    );
  }
}
