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

    const updates: Record<string, unknown> = {};

    if ('onboardingCompleted' in body && typeof body.onboardingCompleted === 'boolean') {
      updates.onboardingCompleted = body.onboardingCompleted;
    }
    if ('onboardingStep' in body && typeof body.onboardingStep === 'number' && body.onboardingStep >= 0 && body.onboardingStep <= 5) {
      updates.onboardingStep = body.onboardingStep;
    }
    if ('defaultBrandId' in body && (typeof body.defaultBrandId === 'string' || body.defaultBrandId === null)) {
      updates.defaultBrandId = body.defaultBrandId;
    }
    if ('defaultOverlayStyle' in body && typeof body.defaultOverlayStyle === 'string' && ['editorial', 'bold-card', 'gradient-bar', 'full-tint'].includes(body.defaultOverlayStyle)) {
      updates.defaultOverlayStyle = body.defaultOverlayStyle;
    }
    if ('defaultTextPosition' in body && typeof body.defaultTextPosition === 'string' && ['top', 'center', 'bottom'].includes(body.defaultTextPosition)) {
      updates.defaultTextPosition = body.defaultTextPosition;
    }
    if ('timezone' in body && typeof body.timezone === 'string' && body.timezone.length <= 50) {
      updates.timezone = body.timezone;
    }
    if ('brandVoiceTone' in body && typeof body.brandVoiceTone === 'string' && ['casual', 'neutral', 'professional', 'playful', 'serious'].includes(body.brandVoiceTone)) {
      updates.brandVoiceTone = body.brandVoiceTone;
    }
    if ('brandVoiceStyle' in body && typeof body.brandVoiceStyle === 'string' && ['short_punchy', 'balanced', 'storytelling', 'educational'].includes(body.brandVoiceStyle)) {
      updates.brandVoiceStyle = body.brandVoiceStyle;
    }
    if ('brandVoiceDos' in body && typeof body.brandVoiceDos === 'string') {
      updates.brandVoiceDos = body.brandVoiceDos.slice(0, 2000);
    }
    if ('brandVoiceDonts' in body && typeof body.brandVoiceDonts === 'string') {
      updates.brandVoiceDonts = body.brandVoiceDonts.slice(0, 2000);
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
