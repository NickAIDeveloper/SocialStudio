import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import { sanitizeImageQueries, tokenize, scoreTagOverlap } from '@/lib/image-queries';

/**
 * POST /api/images/pick
 * Mode A (no images): derives search queries from the caption + hook.
 *   Returns { searchTerm, alternatives, source }.
 * Mode B (with images): picks the best image for the caption + hook via
 *   deterministic tag-overlap scoring against post tokens. Falls back to
 *   first image when no candidate has any tag overlap.
 *   Returns { pickedIndex, score, source }.
 */
export async function POST(request: NextRequest) {
  try {
    await getUserId();
    const body = await request.json();
    const { caption, brand, contentType, hookText, images } = body;

    if (!isCerebrasAvailable() && (!images || images.length === 0)) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    if (!images || images.length === 0) {
      const captionExcerpt = String(caption ?? '').slice(0, 400);
      const hookLine = hookText ? `HOOK: "${String(hookText).slice(0, 120)}"\n` : '';
      const searchPrompt = `Pick stock-photo search queries for this Instagram post.

${hookLine}CAPTION: "${captionExcerpt}"
BRAND: ${brand ?? 'unknown'}

Your job: extract the most CONCRETE VISUAL SUBJECT from the hook + caption (not the brand) and return 5 distinct stock-photo queries that could illustrate it. The HOOK is the strongest signal — match its literal subject. Each query: 3-5 words, lowercase, people + activity + setting.

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
        contextTexts: [
          String(caption ?? ''),
          String(hookText ?? ''),
          String(brand ?? ''),
          String(contentType ?? ''),
        ],
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

    // Mode B: pick best image via deterministic tag-overlap scoring.
    // Was previously an LLM-by-number pick that frequently chose images
    // with zero tag overlap (forest landscape for a study post). Tag
    // overlap is fast, deterministic, and reliable — the LLM was the
    // wrong tool for this job.
    const candidates = images as Array<{ id?: string | number; tags?: string; previewURL?: string }>;
    const postTokens = tokenize(
      [String(caption ?? ''), String(hookText ?? ''), String(brand ?? '')].join(' '),
    );

    let bestIdx = 0;
    let bestScore = -1;
    candidates.slice(0, 20).forEach((img, i) => {
      const score = scoreTagOverlap(String(img.tags ?? ''), postTokens);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });

    return NextResponse.json({
      pickedIndex: bestIdx,
      score: bestScore,
      source: bestScore > 0 ? 'overlap-score' : 'overlap-fallback-first',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to pick image' }, { status: 500 });
  }
}
