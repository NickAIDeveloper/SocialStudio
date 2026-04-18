import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import { sanitizeImageQueries } from '@/lib/image-queries';

/**
 * POST /api/images/pick
 * Mode A (no images): derives search queries from the caption.
 *   Returns { searchTerm, alternatives, source }.
 * Mode B (with images): picks the best image for the caption.
 *   Returns { pickedIndex, source }.
 */
export async function POST(request: NextRequest) {
  try {
    await getUserId();
    const body = await request.json();
    const { caption, brand, contentType, images } = body;

    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    if (!images || images.length === 0) {
      const captionExcerpt = String(caption ?? '').slice(0, 400);
      const searchPrompt = `Pick stock-photo search queries for this Instagram post.

CAPTION: "${captionExcerpt}"
BRAND: ${brand ?? 'unknown'}

Your job: extract the most CONCRETE VISUAL SUBJECT from the caption (not the brand) and return 5 distinct stock-photo queries that could illustrate it. Each query: 3-5 words, lowercase, people + activity + setting.

HARD BANS — these come back as generic stock and ruin the post:
- silhouette / sunset / person looking at water / mountain
- abstract nature (frost, twigs, waves, clouds, leaves) unless caption literally about that
- hands holding phone, hands typing, generic "lifestyle" stock
- abstract words: contemplation, reflection, journey, success, mindset, transformation
- brand names

Good queries match a SCENE. Bad queries match a MOOD.

Return ONLY this JSON shape, no other text:
{"queries":["query one","query two","query three","query four","query five"]}`;

      const raw = await cerebrasChatCompletion(
        [
          { role: 'system', content: 'You are a visual editor. You pick stock-photo queries that precisely match post subjects. Reply with ONLY a JSON object.' },
          { role: 'user', content: searchPrompt },
        ],
        { temperature: 0.4, maxTokens: 200 },
      );

      const queries = sanitizeImageQueries(raw, {
        contextTexts: [String(caption ?? ''), String(brand ?? ''), String(contentType ?? '')],
      });

      if (queries.length === 0) {
        return NextResponse.json({ searchTerm: '', alternatives: [], source: 'cerebras-empty' });
      }

      return NextResponse.json({
        searchTerm: queries[0],
        alternatives: queries,
        source: 'cerebras',
      });
    }

    // Mode B: pick best image from provided list (unchanged)
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
