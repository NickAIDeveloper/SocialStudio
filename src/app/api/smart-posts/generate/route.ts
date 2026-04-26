import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { generateFromSeed } from '@/lib/smart-posts/generate';

// Allow longer runtime — image compositing + LLM caption + image search.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { insightId, brandId, metaOverrides, igUserId, learningIds } = body as {
      insightId?: string;
      brandId?: string;
      metaOverrides?: unknown;
      igUserId?: string;
      learningIds?: string[];
    };
    const cleanLearningIds = Array.isArray(learningIds)
      ? learningIds.filter((s): s is string => typeof s === 'string' && s.length > 0)
      : undefined;

    const origin = request.nextUrl.origin;
    const cookie = request.headers.get('cookie') ?? '';

    const outcome = await generateFromSeed({
      insightId, brandId, metaOverrides, userId, origin, cookie, igUserId,
      learningIds: cleanLearningIds,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.err.error, message: outcome.err.message },
        { status: outcome.err.status },
      );
    }

    return NextResponse.json(outcome.data);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[SmartPosts/generate] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate smart post', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
