import { createHmac } from 'node:crypto';
import { eq, and, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedPosts, posts } from '@/lib/db/schema';
import { seedFromInsight, mergePerfectSeed } from '@/lib/smart-posts';
import { fetchTopPerformingPastImages } from './past-images';
import { createInstagramImageWithText } from '@/lib/image-processing';
import { deriveImageQuery, deriveImageQueryFromHook } from './image-query';
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
  /** When set, sub-route fetches are signed with HMAC instead of using cookie. */
  cronSecret?: string;
  /** Optional connected IG account id; when present, top past posts join the candidate list. */
  igUserId?: string;
  /** Optional learning IDs from the cart. When non-empty, only insights with
   * matching ids contribute to the merged seed. Empty/undefined = every
   * actionable insight contributes (pre-cart behavior). */
  learningIds?: string[];
}

function authHeaders(body: string, cronSecret?: string, cookie?: string): Record<string, string> {
  if (cronSecret) {
    const sig = createHmac('sha256', cronSecret).update(body).digest('hex');
    return { 'Content-Type': 'application/json', 'x-brain-signature': sig };
  }
  return { 'Content-Type': 'application/json', cookie: cookie ?? '' };
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
  const { insightId, brandId, metaOverrides: rawMetaOverrides, userId, origin, cookie, cronSecret, igUserId, learningIds } = input;
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

  // Brain context (additive only — never overrides explicit metaOverrides)
  let brainCtx: import('@/lib/brain/types').BrainContext | null = null;
  if (process.env.BRAIN_UI_ENABLED === 'true') {
    try {
      const { readBrandBrain } = await import('@/lib/brain/consume');
      brainCtx = await readBrandBrain(brandId);
    } catch {
      // Brain failures must never block caption generation.
      brainCtx = null;
    }
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

  const insightsUrl = cronSecret
    ? `${origin}/api/insights?type=analytics&brandId=${encodeURIComponent(brandId)}&_uid=${encodeURIComponent(userId)}`
    : `${origin}/api/insights?type=analytics&brandId=${encodeURIComponent(brandId)}`;
  const insightsSig = cronSecret ? createHmac('sha256', cronSecret).update('').digest('hex') : '';
  const insightsRes = await fetch(insightsUrl, {
    headers: cronSecret
      ? { 'x-brain-signature': insightsSig }
      : { cookie },
  });
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
    const filtered =
      learningIds && learningIds.length > 0
        ? allInsights.filter((c) => learningIds.includes(c.id))
        : allInsights;
    if (filtered.length === 0) {
      return {
        ok: false,
        err: {
          error: 'no_actionable_insights',
          message: 'No actionable insights matched your selection.',
          status: 422,
        },
      };
    }
    const merged = mergePerfectSeed(filtered, brandId);
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

  // Brain-derived fallbacks: only fill slots the user / metaOverrides didn't specify.
  if (brainCtx?.formula) {
    const f = brainCtx.formula;
    // Format fallback
    if (!seed.contentType) {
      const ct = contentTypeFromFormat(f.format);
      if (ct) {
        seed = { ...seed, contentType: ct };
        contributions['brain-format'] = `Brain → ${f.format}`;
      }
    }
    // Timing fallback
    if (!seed.suggestedPostTime) {
      const dowToDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const day = dowToDay[f.bestSlot.dow];
      if (day) {
        seed = { ...seed, suggestedPostTime: { day, hour: f.bestSlot.hour } };
        contributions['brain-timing'] = `Brain best slot → ${day} ${String(f.bestSlot.hour).padStart(2, '0')}:00`;
      }
    }
  }

  const captionBodyObj = {
    brandSlug: brand.slug,
    contentType: seed.contentType,
    avoidTopics: seed.avoidTopics,
    hookPattern: seed.hookPattern ?? '',
    captionLengthHint: seed.captionLengthHint,
    captionPatternHint: seed.captionPatternHint,
    toneHint: seed.toneHint,
    variationSeed: Math.floor(Math.random() * 100000),
    brainBriefMd: brainCtx?.briefMd ?? null,
    ...(cronSecret ? { userId } : {}),
  };
  const captionBodyStr = JSON.stringify(captionBodyObj);
  const captionRes = await fetch(`${origin}/api/captions`, {
    method: 'POST',
    headers: authHeaders(captionBodyStr, cronSecret, cookie),
    body: captionBodyStr,
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

  // Build a concrete scene fallback rather than the bare brand name / description
  // words, which produce poor Pixabay results for brands like Affectly.
  const { brandCategories } = await import('@/lib/pixabay');
  const hookFallback = (captionPayload.hookText ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join(' ');
  const categoryFallback = brandCategories[brand.slug] ?? '';
  const fallbackQuery =
    hookFallback ||
    seed.topicHint ||
    categoryFallback ||
    'person desk laptop';
  let topicQuery = await deriveImageQuery({
    brandName: brand.name,
    brandDescription: brand.description ?? '',
    hookText: captionPayload.hookText ?? '',
    caption: captionPayload.caption ?? '',
    contentType: seed.contentType,
    fallback: fallbackQuery,
  });
  // If primary query fell back to the brand-generic fallback, try deriving from
  // hook text alone — the hook is often more topically concentrated than the
  // full caption and may produce a better query even when the caption-based
  // query failed the context-overlap check against the brand description.
  if (topicQuery === fallbackQuery && (captionPayload.hookText ?? '').trim().length > 0) {
    const hookQuery = await deriveImageQueryFromHook(
      captionPayload.hookText ?? '',
      fallbackQuery,
    );
    if (hookQuery !== fallbackQuery) {
      topicQuery = hookQuery;
    }
  }
  const imagesUrl = cronSecret
    ? `${origin}/api/images?source=all&q=${encodeURIComponent(topicQuery)}&_uid=${encodeURIComponent(userId)}`
    : `${origin}/api/images?source=all&q=${encodeURIComponent(topicQuery)}`;
  const imagesSig = cronSecret ? createHmac('sha256', cronSecret).update('').digest('hex') : '';
  const [imagesRes, pastRes] = await Promise.all([
    fetch(imagesUrl, {
      headers: cronSecret ? { 'x-brain-signature': imagesSig } : { cookie },
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

  // No-repeat filter: 90-day window per brand.
  // Build usedUrls FIRST so we can filter the full Pixabay pool BEFORE slicing,
  // preventing the same top-N images from being reused across every batch.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
  const recentImageRows = await db
    .select({
      src: posts.sourceImageUrl,
      processed: posts.processedImageUrl,
    })
    .from(posts)
    .where(and(eq(posts.brandId, brandId), gte(posts.createdAt, ninetyDaysAgo)));

  const usedUrls = new Set<string>();
  for (const r of recentImageRows) {
    if (r.src) usedUrls.add(r.src);
    if (r.processed) usedUrls.add(r.processed);
  }

  // Past candidates — filter used URLs first.
  const allPastCandidates: ImageCandidate[] = pastRes
    .slice(0, PAST_CAP)
    .map((m) => ({
      url: (m.media_url ?? m.thumbnail_url) as string,
      source: 'past' as const,
      permalink: m.permalink,
    }))
    .filter((c) => Boolean(c.url));
  const freshPast = allPastCandidates.filter((c) => !usedUrls.has(c.url));
  const pastCandidates: ImageCandidate[] = freshPast.length > 0 ? freshPast : allPastCandidates;

  // Stock candidates — filter the FULL Pixabay pool first, then slice.
  const allStock: ImageCandidate[] = (imagesPayload.images ?? [])
    .map((img) => ({
      url: (img.largeImageURL ?? img.url) as string,
      source: 'stock' as const,
    }))
    .filter((c) => Boolean(c.url));
  const freshStock = allStock.filter((c) => !usedUrls.has(c.url));
  const stockPool = freshStock.length > 0 ? freshStock : allStock;
  const stockCandidates: ImageCandidate[] = stockPool.slice(0, TARGET - pastCandidates.length);

  const combinedCandidates: ImageCandidate[] = [...stockCandidates, ...pastCandidates];

  // Safety net: if Pixabay returned 0 results for the topic query, retry with
  // the brand's category as a generic fallback so posts always have an image.
  if (combinedCandidates.length === 0) {
    try {
      const { brandCategories } = await import('@/lib/pixabay');
      const category = brandCategories[brand.slug] ?? 'lifestyle';
      const fallbackImagesUrl = cronSecret
        ? `${origin}/api/images?source=all&q=${encodeURIComponent(category)}&_uid=${encodeURIComponent(userId)}`
        : `${origin}/api/images?source=all&q=${encodeURIComponent(category)}`;
      const fallbackImagesRes = await fetch(fallbackImagesUrl, {
        headers: cronSecret ? { 'x-brain-signature': imagesSig } : { cookie },
      });
      if (fallbackImagesRes.ok) {
        const fb = (await fallbackImagesRes.json()) as {
          images?: Array<{ largeImageURL?: string; url?: string }>;
        };
        const fallbackPool = (fb.images ?? [])
          .map((img) => ({ url: (img.largeImageURL ?? img.url) as string, source: 'stock' as const }))
          .filter((c) => c.url && !usedUrls.has(c.url));
        combinedCandidates.push(...fallbackPool.slice(0, 3));
      }
    } catch { /* swallow — final fallback is no image */ }
  }

  const candidates: ImageCandidate[] = combinedCandidates;

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
