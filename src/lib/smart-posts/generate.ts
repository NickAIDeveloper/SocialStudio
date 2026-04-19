import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedPosts, posts } from '@/lib/db/schema';
import { seedFromInsight, mergePerfectSeed } from '@/lib/smart-posts';
import { fetchTopPerformingPastImages } from './past-images';
import { createInstagramImageWithText } from '@/lib/image-processing';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import type { InsightCard } from '@/lib/health-score';
import type { Brand } from '@/lib/domain-types';

const DAY_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const SEMANTIC_OVERLAP_STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'your', 'have', 'will', 'more', 'just',
  'some', 'when', 'what', 'they', 'them', 'their', 'there', 'these', 'those',
  'into', 'about', 'than', 'then', 'been', 'being', 'were', 'which', 'would',
  'could', 'should', 'like', 'make', 'made', 'also', 'only',
]);

function tokenizeForOverlap(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
    if (raw.length >= 4 && !SEMANTIC_OVERLAP_STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

// Does the LLM-derived image query share at least one substantive word with
// the actual post content? If not the query drifted into unrelated territory
// (the "coins for a running post" bug) and we should fall back to the
// brand-anchored default.
function hasContextOverlap(query: string, contextTexts: string[]): boolean {
  const queryTokens = tokenizeForOverlap(query);
  if (queryTokens.size === 0) return false;
  for (const ctx of contextTexts) {
    for (const tok of tokenizeForOverlap(ctx)) {
      if (queryTokens.has(tok)) return true;
    }
  }
  return false;
}

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
    if (cleaned.length < 6 || cleaned.length > 80) return args.fallback;
    if (/query|reply|only|search|caption|hook/.test(cleaned)) return args.fallback;
    if (/silhouette|sunset|contemplation|reflection|journey\b/.test(cleaned)) {
      return args.fallback;
    }
    // Reject queries that drift off-topic (no substantive word overlap with
    // brand + post content). Catches cases like "coins stacks money" for a
    // running post where the LLM latched onto a metaphor and lost the subject.
    const contextTexts = [
      args.brandName,
      args.brandDescription,
      args.hookText,
      args.caption,
    ];
    if (!hasContextOverlap(cleaned, contextTexts)) return args.fallback;
    return cleaned;
  } catch (err) {
    console.error('[SmartPosts/generate] Image query derivation failed:', err instanceof Error ? err.message : err);
    return args.fallback;
  }
}

function nextOccurrenceIso(dayName: string, hour: number): string | null {
  const dayIdx = DAY_INDEX[dayName.trim().toLowerCase()];
  if (dayIdx === undefined) return null;
  const safeHour = Math.max(0, Math.min(23, Math.floor(hour)));
  const now = new Date();
  const target = new Date(now);
  target.setHours(safeHour, 0, 0, 0);
  let delta = (dayIdx - now.getDay() + 7) % 7;
  if (delta === 0 && target.getTime() - now.getTime() < 60 * 60 * 1000) {
    delta = 7;
  }
  target.setDate(target.getDate() + delta);
  return target.toISOString();
}

export interface MetaOverrides {
  preset?: string;
  format?: 'REEL' | 'CAROUSEL' | 'IMAGE';
  day?: string;
  hour?: number;
  pattern?: string;
}

export function sanitizeMetaOverrides(raw: unknown): MetaOverrides | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: MetaOverrides = {};
  if (typeof o.preset === 'string' && o.preset.trim().length > 0) {
    out.preset = o.preset;
  }
  if (o.format === 'REEL' || o.format === 'CAROUSEL' || o.format === 'IMAGE') {
    out.format = o.format;
  }
  if (
    typeof o.day === 'string' &&
    DAY_INDEX[o.day.trim().toLowerCase()] !== undefined
  ) {
    out.day = o.day;
  }
  if (
    typeof o.hour === 'number' &&
    Number.isFinite(o.hour) &&
    o.hour >= 0 &&
    o.hour <= 23
  ) {
    out.hour = Math.floor(o.hour);
  }
  if (typeof o.pattern === 'string' && o.pattern.trim().length > 0) {
    out.pattern = o.pattern;
  }
  return out;
}

function contentTypeFromFormat(format: MetaOverrides['format']) {
  if (format === 'REEL') return 'tip' as const;
  if (format === 'CAROUSEL') return 'carousel' as const;
  if (format === 'IMAGE') return 'quote' as const;
  return null;
}

export interface GenerateFromSeedInput {
  insightId?: string;
  brandId?: string;
  metaOverrides?: unknown;
  userId: string;
  /** Origin of the Next.js app (e.g. "https://example.com") used for internal fetches. */
  origin: string;
  /** Forwarded cookie header for internal API auth. */
  cookie: string;
  /** Optional connected IG account id; when present, top past posts join the candidate list. */
  igUserId?: string;
}

export interface ImageCandidate {
  url: string;
  source: 'stock' | 'past';
  permalink?: string;
}

export interface RenderParams {
  brand: 'affectly' | 'pacebrain';
  hookText: string;
  textPosition: 'top' | 'center' | 'bottom';
  overlayStyle: 'editorial' | 'bold-card' | 'gradient-bar' | 'full-tint';
  logoUrl: string | null;
}

export interface GenerateFromSeedResult {
  imageDataUrl: string;
  sourceImageUrl: string;
  caption: string;
  hashtags: string;
  hookText: string;
  seed: unknown;
  suggestedPostTime: unknown;
  scheduledAt: string | null;
  sourceInsightId: string | null;
  contributions: Record<string, string>;
  candidates: ImageCandidate[];
  renderParams: RenderParams;
}

export type GenerateFromSeedError =
  | { error: 'brandId_required'; message: string; status: 400 }
  | { error: 'brand_not_found'; message: string; status: 404 }
  | { error: 'no_data'; message: string; status: 422 }
  | { error: 'no_insights'; message: string; status: 422 }
  | { error: 'insight_not_found'; message: string; status: 404 }
  | { error: 'not_actionable'; message: string; status: 400 }
  | { error: 'no_actionable_insights'; message: string; status: 422 }
  | { error: 'caption_failed'; message: string; status: 502 }
  | { error: 'image_search_failed'; message: string; status: 502 }
  | { error: 'no_images'; message: string; status: 422 }
  | { error: string; message: string; status: number };

export type GenerateFromSeedOutcome =
  | { ok: true; data: GenerateFromSeedResult }
  | { ok: false; err: GenerateFromSeedError };

export async function generateFromSeed(
  input: GenerateFromSeedInput,
): Promise<GenerateFromSeedOutcome> {
  const { insightId, brandId, metaOverrides: rawMetaOverrides, userId, origin, cookie, igUserId } = input;
  const metaOverrides = sanitizeMetaOverrides(rawMetaOverrides);

  if (!brandId) {
    return {
      ok: false,
      err: { error: 'brandId_required', message: 'brandId required — pick a brand first.', status: 400 },
    };
  }

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.userId, userId), eq(brands.id, brandId)))
    .limit(1);
  if (!brand) {
    return { ok: false, err: { error: 'brand_not_found', message: 'Brand not found', status: 404 } };
  }

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
    return {
      ok: false,
      err: {
        error: 'no_data',
        message:
          'We need real data before we can recommend anything. Head to Analytics and scrape your Instagram first.',
        status: 422,
      },
    };
  }

  const insightsRes = await fetch(
    `${origin}/api/insights?type=analytics&brandId=${encodeURIComponent(brandId)}`,
    { headers: { cookie } },
  );
  if (!insightsRes.ok) {
    return {
      ok: false,
      err: { error: 'no_insights', message: 'Run Analytics first so we have insights to work with.', status: 422 },
    };
  }
  const insightsPayload = (await insightsRes.json()) as { insights?: InsightCard[] };
  const allInsights = insightsPayload.insights ?? [];
  if (allInsights.length === 0) {
    return {
      ok: false,
      err: {
        error: 'no_insights',
        message: 'No insights for this brand yet — scrape its Instagram from Analytics first.',
        status: 422,
      },
    };
  }

  let seed;
  let contributions: Record<string, string> = {};
  if (insightId) {
    const card = allInsights.find((c) => c.id === insightId);
    if (!card) {
      return { ok: false, err: { error: 'insight_not_found', message: 'Insight not found', status: 404 } };
    }
    seed = seedFromInsight(card, brandId);
    if (!seed) {
      return {
        ok: false,
        err: { error: 'not_actionable', message: 'This insight is diagnostic only.', status: 400 },
      };
    }
    contributions = { [card.type]: seed.reasoning };
  } else {
    const merged = mergePerfectSeed(allInsights, brandId);
    if (!merged) {
      return {
        ok: false,
        err: {
          error: 'no_actionable_insights',
          message: 'No actionable insights yet — run Analytics to build up data first.',
          status: 422,
        },
      };
    }
    seed = merged.seed;
    contributions = merged.contributions;
  }

  if (metaOverrides) {
    const ct = contentTypeFromFormat(metaOverrides.format);
    if (ct) {
      seed = { ...seed, contentType: ct };
      // Meta format replaces the insight-based framework pick — drop the stale
      // base contribution so "Why this works" doesn't say "picked carousel"
      // while the post is actually a reel.
      delete contributions['best-content-type'];
      contributions['meta-format'] = `Meta format → ${metaOverrides.format}`;
    }
    if (metaOverrides.day && typeof metaOverrides.hour === 'number') {
      const hour = Math.max(0, Math.min(23, Math.floor(metaOverrides.hour)));
      seed = { ...seed, suggestedPostTime: { day: metaOverrides.day, hour } };
      delete contributions['optimal-timing'];
      contributions['meta-timing'] =
        `Meta best slot → ${metaOverrides.day} ${String(hour).padStart(2, '0')}:00`;
    }
    if (metaOverrides.pattern) {
      seed = {
        ...seed,
        captionPatternHint: { type: 'meta', label: metaOverrides.pattern.slice(0, 80) },
      };
      delete contributions['caption-patterns'];
      contributions['meta-pattern'] =
        `Meta caption pattern → ${metaOverrides.pattern.slice(0, 60)}`;
    }
    if (metaOverrides.preset) {
      const preset = metaOverrides.preset.slice(0, 240);
      if (!seed.topicHint) seed = { ...seed, topicHint: preset };
      contributions['meta-preset'] = `Meta seed → "${preset.slice(0, 80)}"`;
    }
  }

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
    return {
      ok: false,
      err: {
        error: 'caption_failed',
        message: err.message ?? err.error ?? 'Caption generation failed',
        status: 502,
      },
    };
  }
  const captionPayload = (await captionRes.json()) as {
    caption?: string;
    hashtags?: string;
    hookText?: string;
  };

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
  const [imagesRes, pastRes] = await Promise.all([
    fetch(`${origin}/api/images?source=all&q=${encodeURIComponent(topicQuery)}`, {
      headers: { cookie },
    }),
    fetchTopPerformingPastImages({ igUserId, limit: 2, origin, cookie }),
  ]);

  if (!imagesRes.ok) {
    return {
      ok: false,
      err: {
        error: 'image_search_failed',
        message: "Couldn't fetch a stock image. Connect a stock source in Settings.",
        status: 502,
      },
    };
  }
  const imagesPayload = (await imagesRes.json()) as {
    images?: Array<{ largeImageURL?: string; url?: string }>;
  };

  const TARGET = 6;
  const PAST_CAP = 2;
  const pastCandidates: ImageCandidate[] = pastRes
    .slice(0, PAST_CAP)
    .map((m) => ({
      url: (m.media_url ?? m.thumbnail_url) as string,
      source: 'past' as const,
      permalink: m.permalink,
    }))
    .filter((c) => Boolean(c.url));
  const stockCandidates: ImageCandidate[] = (imagesPayload.images ?? [])
    .slice(0, TARGET - pastCandidates.length)
    .map((img) => ({
      url: (img.largeImageURL ?? img.url) as string,
      source: 'stock' as const,
    }))
    .filter((c) => Boolean(c.url));

  const candidates: ImageCandidate[] = [...stockCandidates, ...pastCandidates];
  const sourceImageUrl = candidates[0]?.url;
  if (!sourceImageUrl) {
    return {
      ok: false,
      err: {
        error: 'no_images',
        message:
          'No stock image found for this topic. Connect Pixabay, Unsplash, or Pexels in Settings.',
        status: 422,
      },
    };
  }

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

  const scheduledAt = seed.suggestedPostTime
    ? nextOccurrenceIso(seed.suggestedPostTime.day, seed.suggestedPostTime.hour)
    : null;

  const renderParams: RenderParams = {
    brand: renderBrand,
    hookText: hookText.slice(0, 60),
    textPosition: seed.textPosition,
    overlayStyle: seed.overlayStyle,
    logoUrl: brand.logoUrl ?? null,
  };

  return {
    ok: true,
    data: {
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
      candidates,
      renderParams,
    },
  };
}
