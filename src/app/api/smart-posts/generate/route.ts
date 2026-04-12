import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedPosts, posts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { seedFromInsight, mergePerfectSeed } from '@/lib/smart-posts';
import { createInstagramImageWithText } from '@/lib/image-processing';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import type { InsightCard } from '@/lib/health-score';
import type { Brand } from '@/lib/domain-types';

// Allow longer runtime — image compositing + LLM caption + image search.
export const maxDuration = 60;

const DAY_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// Asks a small LLM call to translate the generated caption into a concrete
// 3–5 word stock-photo search query. The caption is the source of truth for
// what the post is actually about — far more accurate than guessing from a
// top-post hook fragment. Returns `fallback` on any error/timeout so the
// pipeline never blocks on image-query derivation.
async function deriveImageQuery(args: {
  brandName: string;
  brandDescription: string;
  hookText: string;
  caption: string;
  contentType: string;
  fallback: string;
}): Promise<string> {
  if (!isCerebrasAvailable()) return args.fallback;
  try {
    const captionExcerpt = args.caption.split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 400);
    const prompt = `Pick the best stock-photo search query for this Instagram post.

BRAND: ${args.brandName}${args.brandDescription ? ` — ${args.brandDescription.slice(0, 200)}` : ''}
HOOK: ${args.hookText}
CAPTION: ${captionExcerpt}

Your job: extract the most CONCRETE VISUAL SUBJECT from the caption above (not the brand, not the hook — the caption) and turn it into a 3–5 word stock-photo query.

Process:
1. Identify the literal activity, scene, or object the caption is about (e.g. "studying in bed at night", "running on a treadmill", "writing in a journal", "hiking alone at dawn", "taking notes in a cafe").
2. Turn that into 3–5 concrete words a stock-photo search would return well (people + activity + setting).

HARD BANS — these stock cliches always come back generic and ruin the post:
- silhouette / person looking at sunset / person looking at water / person on mountain
- abstract nature (frost, twigs, waves, clouds, leaves) unless the caption is literally about that
- hands holding a phone, hands typing, generic "lifestyle" stock
- "contemplation", "reflection", "journey" as query words

Good queries match a SCENE. Bad queries match a MOOD.

Return ONLY the query: 3–5 words, lowercase, no quotes, no punctuation.`;

    const content = await cerebrasChatCompletion(
      [
        { role: 'system', content: 'You are a visual editor. You pick stock-photo queries that precisely match post subjects. Reply with ONLY the query.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 30 },
    );
    const cleaned = content
      .replace(/["'`]/g, '')
      .replace(/[.!?,;:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ');
    // Sanity: reject anything too short or still full of prompt artifacts.
    if (cleaned.length < 6 || cleaned.length > 80) return args.fallback;
    if (/query|reply|only|search|caption|hook/.test(cleaned)) return args.fallback;
    // Reject cliche queries that return generic atmospheric stock photos.
    // If the LLM slips back into these despite the prompt, fall back.
    if (/silhouette|sunset|contemplation|reflection|journey\b/.test(cleaned)) {
      return args.fallback;
    }
    return cleaned;
  } catch (err) {
    console.error('[SmartPosts/generate] Image query derivation failed:', err instanceof Error ? err.message : err);
    return args.fallback;
  }
}

// Returns the next future occurrence of `dayName` at `hour:00` as an ISO string.
// If today matches and the hour is still ahead, uses today; otherwise rolls
// forward to the next matching weekday (always at least 1 hour in the future).
function nextOccurrenceIso(dayName: string, hour: number): string | null {
  const dayIdx = DAY_INDEX[dayName.trim().toLowerCase()];
  if (dayIdx === undefined) return null;
  const safeHour = Math.max(0, Math.min(23, Math.floor(hour)));
  const now = new Date();
  const target = new Date(now);
  target.setHours(safeHour, 0, 0, 0);
  let delta = (dayIdx - now.getDay() + 7) % 7;
  if (delta === 0 && target.getTime() - now.getTime() < 60 * 60 * 1000) {
    delta = 7; // today's slot already passed or too close — jump one week
  }
  target.setDate(target.getDate() + delta);
  return target.toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { insightId, brandId } = body as { insightId?: string; brandId?: string };

    if (!brandId) {
      return NextResponse.json({ error: 'brandId required — pick a brand first.' }, { status: 400 });
    }

    // Verify brand ownership
    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.userId, userId), eq(brands.id, brandId)))
      .limit(1);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // No-fabrication guard: refuse if no real data at all
    const [anyScraped] = await db
      .select({ id: scrapedPosts.id })
      .from(scrapedPosts)
      .where(eq(scrapedPosts.userId, userId))
      .limit(1);
    const [anyPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.userId, userId))
      .limit(1);
    if (!anyScraped && !anyPost) {
      return NextResponse.json(
        {
          error: 'no_data',
          message:
            'We need real data before we can recommend anything. Head to Analytics and scrape your Instagram first.',
        },
        { status: 422 },
      );
    }

    // Brand-scoped insight load. The shared insightsCache row is keyed only by
    // (userId, type), so two brands fight for the same slot and whoever
    // refreshed last wins. To avoid that cross-brand leak, we call the
    // insights API with ?brandId=X internally — which runs the brand-filtered
    // compute path — instead of trusting the cache to match the current brand.
    const origin = request.nextUrl.origin;
    const cookie = request.headers.get('cookie') ?? '';
    const insightsRes = await fetch(
      `${origin}/api/insights?type=analytics&brandId=${encodeURIComponent(brandId)}`,
      { headers: { cookie } },
    );
    if (!insightsRes.ok) {
      return NextResponse.json(
        { error: 'no_insights', message: 'Run Analytics first so we have insights to work with.' },
        { status: 422 },
      );
    }
    const insightsPayload = (await insightsRes.json()) as { insights?: InsightCard[] };
    const allInsights = insightsPayload.insights ?? [];
    if (allInsights.length === 0) {
      return NextResponse.json(
        {
          error: 'no_insights',
          message: 'No insights for this brand yet — scrape its Instagram from Analytics first.',
        },
        { status: 422 },
      );
    }

    // Two modes:
    //   (a) insightId provided — generate from a single card (legacy path)
    //   (b) no insightId — compose ONE "perfect post" from ALL actionable insights
    let seed;
    let contributions: Record<string, string> = {};
    if (insightId) {
      const card = allInsights.find((c) => c.id === insightId);
      if (!card) {
        return NextResponse.json({ error: 'insight_not_found' }, { status: 404 });
      }
      seed = seedFromInsight(card, brandId);
      if (!seed) {
        return NextResponse.json(
          { error: 'not_actionable', message: 'This insight is diagnostic only.' },
          { status: 400 },
        );
      }
      contributions = { [card.type]: seed.reasoning };
    } else {
      const merged = mergePerfectSeed(allInsights, brandId);
      if (!merged) {
        return NextResponse.json(
          {
            error: 'no_actionable_insights',
            message: 'No actionable insights yet — run Analytics to build up data first.',
          },
          { status: 422 },
        );
      }
      seed = merged.seed;
      contributions = merged.contributions;
    }

    // 1. Caption
    const captionRes = await fetch(`${origin}/api/captions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        brandSlug: brand.slug,
        contentType: seed.contentType,
        avoidTopics: seed.avoidTopics,
        hookPattern: seed.hookPattern ?? '',
        captionLengthHint: seed.captionLengthHint,
        captionPatternHint: seed.captionPatternHint,
        toneHint: seed.toneHint,
        variationSeed: Math.floor(Math.random() * 100000),
      }),
    });
    if (!captionRes.ok) {
      const err = (await captionRes.json().catch(() => ({}))) as { error?: string; message?: string };
      return NextResponse.json(
        { error: 'caption_failed', message: err.message ?? err.error ?? 'Caption generation failed' },
        { status: 502 },
      );
    }
    const captionPayload = (await captionRes.json()) as {
      caption?: string;
      hashtags?: string;
      hookText?: string;
    };

    // 2. Stock image — derive a *subject-accurate* search query from the
    // generated caption itself. The old approach used the first 3 words of
    // the top-post hook (e.g. "thecyborgrunner on February"), which has no
    // visual signal and dragged in random nature photos. We now ask a small
    // LLM call to translate the caption + brand + hook into a 3–5 word
    // stock-photo query. Falls back to the old seed-based query on failure.
    const fallbackQuery =
      seed.topicHint ?? brand.description?.split(/\s+/).slice(0, 3).join(' ') ?? brand.name;
    const topicQuery = await deriveImageQuery({
      brandName: brand.name,
      brandDescription: brand.description ?? '',
      hookText: captionPayload.hookText ?? '',
      caption: captionPayload.caption ?? '',
      contentType: seed.contentType,
      fallback: fallbackQuery,
    });
    const imagesRes = await fetch(
      `${origin}/api/images?source=all&q=${encodeURIComponent(topicQuery)}`,
      { headers: { cookie } },
    );
    if (!imagesRes.ok) {
      return NextResponse.json(
        {
          error: 'image_search_failed',
          message: "Couldn't fetch a stock image. Connect a stock source in Settings.",
        },
        { status: 502 },
      );
    }
    const imagesPayload = (await imagesRes.json()) as {
      images?: Array<{ largeImageURL?: string; url?: string }>;
    };
    const firstImage = imagesPayload.images?.[0];
    const sourceImageUrl = firstImage?.largeImageURL ?? firstImage?.url;
    if (!sourceImageUrl) {
      return NextResponse.json(
        {
          error: 'no_images',
          message:
            'No stock image found for this topic. Connect Pixabay, Unsplash, or Pexels in Settings.',
        },
        { status: 422 },
      );
    }

    // 3. Render overlay image
    const hookText = captionPayload.hookText ?? seed.hookPattern ?? 'Save this';
    const renderBrand: Brand =
      brand.slug === 'affectly' || brand.slug === 'pacebrain' ? (brand.slug as Brand) : 'affectly';
    const imageBuffer = await createInstagramImageWithText(
      sourceImageUrl,
      renderBrand,
      hookText.slice(0, 60),
      seed.textPosition,
      '#FFFFFF',
      64,
      seed.overlayStyle,
      brand.logoUrl ?? null,
    );
    const imageDataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

    // Resolve the suggested day+hour into a concrete future ISO timestamp so
    // the UI can schedule with mode:'customScheduled' instead of generic
    // queue placement. This is what makes "Tuesday 19:00" actually post at
    // Tuesday 19:00 rather than whenever Buffer's queue happens to fire.
    const scheduledAt = seed.suggestedPostTime
      ? nextOccurrenceIso(seed.suggestedPostTime.day, seed.suggestedPostTime.hour)
      : null;

    return NextResponse.json({
      imageDataUrl,
      sourceImageUrl,
      caption: captionPayload.caption ?? '',
      hashtags: captionPayload.hashtags ?? '',
      hookText: hookText.slice(0, 60),
      seed,
      suggestedPostTime: seed.suggestedPostTime,
      scheduledAt,
      sourceInsightId: insightId ?? null,
      contributions,
    });
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
