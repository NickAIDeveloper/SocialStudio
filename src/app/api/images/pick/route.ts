import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

/**
 * POST /api/images/pick
 * Given a caption and a list of image options, use AI to pick the best one.
 * Also generates the ideal search term for the caption.
 */
export async function POST(request: NextRequest) {
  try {
    await getUserId();
    const body = await request.json();
    const { caption, brand, contentType, images } = body;

    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    // Step 1: Generate the ideal search term based on caption
    let searchTerm = '';
    if (!images || images.length === 0) {
      const searchPrompt = `You are picking stock photos for an Instagram post. Given this caption, generate the BEST single search term (2-4 words) to find a matching photo on Pixabay/Unsplash/Pexels.

Caption: "${(caption ?? '').slice(0, 300)}"
Brand: ${brand ?? 'unknown'}
Content type: ${contentType ?? 'general'}

Requirements:
- Extract the CORE SUBJECT or EMOTION from the caption
- The search term must directly relate to what the caption is about
- Use concrete, visual nouns (e.g. "woman journaling morning" not "self-improvement")
- Avoid abstract/generic terms like "business", "technology", "success"
- Think: what scene would visually MATCH this specific message?
- If the caption mentions a specific activity, person, or setting, use that

Return ONLY the search term (2-4 words), nothing else.`;

      const termResult = await cerebrasChatCompletion(
        [{ role: 'user', content: searchPrompt }],
        { temperature: 0.7, maxTokens: 50 },
      );
      searchTerm = termResult.trim().replace(/['"]/g, '').slice(0, 50);

      return NextResponse.json({ searchTerm, source: 'cerebras' });
    }

    // Step 2: If images are provided, pick the best one
    const imageDescriptions = (images as Array<{ id: string | number; tags: string; previewURL: string }>)
      .slice(0, 10)
      .map((img, i) => `${i + 1}. Tags: ${img.tags ?? 'none'}`)
      .join('\n');

    const pickPrompt = `You are an Instagram visual curator. Pick the BEST image for this post.

Caption: "${(caption ?? '').slice(0, 200)}"
Brand: ${brand ?? 'unknown'}

Available images:
${imageDescriptions}

Pick the ONE image number that would:
- Stop people scrolling
- Match the mood and message of the caption
- Look professional and on-brand
- Have strong visual impact

Return ONLY the number (1-${Math.min(images.length, 10)}), nothing else.`;

    const pickResult = await cerebrasChatCompletion(
      [{ role: 'user', content: pickPrompt }],
      { temperature: 0.3, maxTokens: 10 },
    );

    const pickedIndex = parseInt(pickResult.trim(), 10) - 1;
    const validIndex = isNaN(pickedIndex) || pickedIndex < 0 || pickedIndex >= images.length ? 0 : pickedIndex;

    return NextResponse.json({
      pickedIndex: validIndex,
      source: 'cerebras',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to pick image' }, { status: 500 });
  }
}
