import { createHmac } from 'node:crypto';
import type { AngleId } from './creative-angles';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedPosts, posts } from '@/lib/db/schema';
import { seedFromInsight, mergePerfectSeed } from '@/lib/smart-posts';
import { fetchTopPerformingPastImages } from './past-images';
import { createInstagramImageWithText, fetchImageBuffer } from '@/lib/image-processing';
import { deriveImageQuery, deriveImageQueryFromHook } from './image-query';
import { rankCandidates, hasBrandDomainConfig } from './image-scoring';
import { normalizeImageUrlForDedup, buildDedupSet } from './url-dedup';
import { resolveHook } from './hook-fallback';
import {
  computeImageHash,
  isVisuallyDuplicate,
  DEFAULT_HAMMING_THRESHOLD,
} from './image-hash';
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

// The pipeline can only ship single photos (SUPPORTED_FORMATS = ['IMAGE']), and
// IMAGE used to map to a single caption framework ('quote' — contrarian one-liner),
// so EVERY autopilot post came out as the same "Your X is Y" truth-bomb. These are
// the copywriting frameworks that still work on a single image; we rotate through
// them by the brand's post count so consecutive posts vary in structure (quote →
// tip → community → promo) even though the visual format is fixed.
export const IMAGE_FRAMEWORKS = ['quote', 'tip', 'community', 'promo'] as const;
export type ImageFramework = (typeof IMAGE_FRAMEWORKS)[number];

/**
 * Deterministically picks a caption framework from the rotation given how many
 * posts the brand already has. Stable for a given count; wraps around; falls
 * back to the first framework for non-finite/negative input.
 */
export function rotateImageFramework(postCount: number): ImageFramework {
  if (!Number.isFinite(postCount) || postCount < 0) return IMAGE_FRAMEWORKS[0];
  return IMAGE_FRAMEWORKS[Math.floor(postCount) % IMAGE_FRAMEWORKS.length];
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
  /** Stock photo tags (Pixabay returns a comma-separated string). Used by
   *  the relevance ranker to demote landscape candidates and pick the best
   *  topical match — not surfaced to the UI. */
  tags?: string;
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
  /** Perceptual hash of the source image, 16-char hex. Persisted on the
   *  post row so future generations can dedup the same photo even when
   *  it shows up under a different URL. */
  imageHash: string | null;
  caption: string;
  hashtags: string;
  hookText: string;
  /** Creative angle chosen by /api/captions — persisted on the post row so the
   *  next generation's LRU rotation is exact rather than inferred from text. */
  angle: AngleId | null;
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
      // For the single-image format, rotate the caption framework across posts
      // instead of always shipping 'quote' (the cause of the repetitive
      // "Your X is Y" hooks). Format stays IMAGE; only the copywriting angle
      // varies. Other formats keep their direct mapping.
      let framework: typeof ct | ImageFramework = ct;
      if (metaOverrides.format === 'IMAGE') {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(posts)
          .where(eq(posts.brandId, brandId));
        framework = rotateImageFramework(row?.count ?? 0);
      }
      seed = { ...seed, contentType: framework };
      // Meta format replaces the insight-based framework pick — drop the stale
      // base contribution so "Why this works" doesn't say "picked carousel"
      // while the post is actually a reel.
      delete contributions['best-content-type'];
      contributions['meta-format'] = `Meta format → ${metaOverrides.format} (${framework})`;
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
    angle?: string;
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
    images?: Array<{ largeImageURL?: string; url?: string; tags?: string }>;
  };

  const TARGET = 6;
  const PAST_CAP = 2;

  // No-repeat filter: ALL-TIME per brand. Once an image has been used in any
  // post for this brand, it never appears again — the user explicitly asked
  // for permanent uniqueness, not a rolling window.
  //
  // URLs are compared by their normalised (query-string-stripped) form so
  // CDN-signed URLs (Instagram oh=/oe=, Unsplash ixlib=, Pexels h=/w=) dedup
  // the same photo across fetches. See url-dedup.ts.
  const allImageRows = await db
    .select({
      id: posts.id,
      src: posts.sourceImageUrl,
      processed: posts.processedImageUrl,
      hash: posts.imageHash,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.brandId, brandId))
    // Newest first — the lazy backfill below picks 6 unhashed rows per
    // run, so we want recent posts (what the user actually sees and
    // complains about) to get hashed before old test data.
    .orderBy(desc(posts.createdAt));

  const usedUrls = buildDedupSet(
    allImageRows.flatMap((r) => [r.src, r.processed]),
  );

  // Visual dedup set — collected up front from posts that already have a
  // hash stored. Posts without a hash (legacy rows pre-pHash) are backfilled
  // lazily inside the candidate loop below, capped per generation so we
  // never blow the function-timeout budget on a brand with a long history.
  const pastHashes = new Set<string>(
    allImageRows
      .map((r) => r.hash)
      .filter((h): h is string => typeof h === 'string' && h.length === 16),
  );

  // Past candidates — filter used URLs first.
  const allPastCandidates: ImageCandidate[] = pastRes
    .slice(0, PAST_CAP)
    .map((m) => ({
      url: (m.media_url ?? m.thumbnail_url) as string,
      source: 'past' as const,
      permalink: m.permalink,
    }))
    .filter((c) => Boolean(c.url));
  // Normalised match — IG CDN URLs sign every fetch with fresh oh=/oe= params,
  // so the raw URL string varies but the path stays stable.
  const freshPast = allPastCandidates.filter(
    (c) => !usedUrls.has(normalizeImageUrlForDedup(c.url)),
  );
  const pastCandidates: ImageCandidate[] = freshPast.length > 0 ? freshPast : allPastCandidates;

  // Stock candidates — capture tags so we can rank by topic relevance below.
  // Filter the full Pixabay pool by used-URL set first so the ranker sees
  // only fresh material.
  const buildStock = (
    payload: { images?: Array<{ largeImageURL?: string; url?: string; tags?: string }> },
  ): ImageCandidate[] =>
    (payload.images ?? [])
      .map((img) => ({
        url: (img.largeImageURL ?? img.url) as string,
        source: 'stock' as const,
        tags: img.tags,
      }))
      .filter((c) => Boolean(c.url) && !usedUrls.has(normalizeImageUrlForDedup(c.url)));

  const stockPool: ImageCandidate[] = buildStock(imagesPayload);

  // Helper: extend the pool with extra Pixabay results from a given query,
  // dedupe by URL, never include images in the brand's no-reuse set.
  async function extendPool(extraQuery: string): Promise<void> {
    if (!extraQuery) return;
    try {
      const url = cronSecret
        ? `${origin}/api/images?source=all&q=${encodeURIComponent(extraQuery)}&_uid=${encodeURIComponent(userId)}`
        : `${origin}/api/images?source=all&q=${encodeURIComponent(extraQuery)}`;
      const res = await fetch(url, {
        headers: cronSecret ? { 'x-brain-signature': imagesSig } : { cookie },
      });
      if (!res.ok) return;
      const payload = (await res.json()) as {
        images?: Array<{ largeImageURL?: string; url?: string; tags?: string }>;
      };
      const extra = buildStock(payload);
      const seen = new Set(stockPool.map((c) => c.url));
      for (const c of extra) {
        if (!seen.has(c.url)) {
          stockPool.push(c);
          seen.add(c.url);
        }
      }
    } catch {
      // Extra searches are best-effort — never block the post.
    }
  }

  // Tag-overlap relevance ranking. Brand slug enables the brand-domain HARD
  // floor: a "kid with phone" candidate never beats a "runner training"
  // candidate for PaceBrain, even when neither shares words with the
  // metaphorical hook ("Most runners hit a wall…").
  const relevanceContext = `${captionPayload.hookText ?? ''} ${captionPayload.caption ?? ''}`;
  let ranked = rankCandidates(stockPool, relevanceContext, brand.slug);
  const topScore = ranked.length > 0 ? ranked[0].score : 0;

  // Recovery path 1 — generic caption/hook-only re-search when nothing
  // shared any words with the LLM-derived query. Same as before.
  if (topScore === 0 && (captionPayload.hookText ?? '').trim().length > 0) {
    const hookOnlyQuery = await deriveImageQueryFromHook(
      captionPayload.hookText ?? '',
      fallbackQuery,
    );
    if (hookOnlyQuery && hookOnlyQuery !== topicQuery) {
      await extendPool(hookOnlyQuery);
      ranked = rankCandidates(stockPool, relevanceContext, brand.slug);
    }
  }

  // Recovery path 2 — brand-domain hard floor. If we have a brand-domain
  // vocabulary configured AND no candidate in the current pool matches it,
  // do extra Pixabay searches using the brand's hand-picked suggestedQueries.
  // A single anchored query can starve once the all-time no-reuse set
  // depletes the popular tag pool (PaceBrain saw this at ~13 used posts —
  // every "runner road morning" hit was banned, leaving only off-topic
  // Pexels alt-text noise like "white storks on grass field" or "child
  // reading book"). Rotating through several queries combines sub-pools
  // until the ranker has at least one on-topic fresh photo to surface.
  if (hasBrandDomainConfig(brand.slug)) {
    try {
      const { suggestedQueries } = await import('@/lib/pixabay');
      const queriesPool = suggestedQueries[brand.slug as keyof typeof suggestedQueries];
      if (queriesPool && queriesPool.length > 0) {
        // Deterministic start by day-of-year keeps re-runs of the same day
        // stable, then we walk forward through neighbouring queries when
        // the first one fails to surface a brand-domain match.
        const day = Math.floor(Date.now() / 86_400_000);
        const start = day % queriesPool.length;
        const maxQueries = Math.min(4, queriesPool.length);
        for (let i = 0; i < maxQueries; i++) {
          const topMatchesDomain = ranked.length > 0 && ranked[0].brandDomainMatch;
          if (topMatchesDomain) break;
          const brandAnchored = queriesPool[(start + i) % queriesPool.length];
          await extendPool(brandAnchored);
          ranked = rankCandidates(stockPool, relevanceContext, brand.slug);
        }
      }
    } catch {
      // Best-effort — brand anchor failure should never block generation.
    }
  }

  const stockCandidates: ImageCandidate[] = ranked
    .map((r) => r.candidate)
    .slice(0, TARGET - pastCandidates.length);

  const combinedCandidates: ImageCandidate[] = [...stockCandidates, ...pastCandidates];

  // Safety net: if Pixabay returned 0 fresh results, retry with the brand's
  // category as a generic fallback so posts always have an image. Still
  // respects the all-time no-reuse set.
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
          images?: Array<{ largeImageURL?: string; url?: string; tags?: string }>;
        };
        const fallbackPool = buildStock(fb);
        // Pass brand.slug so the category safety-net still honors the brand-domain
        // floor — without it this fallback served off-topic (misaligned) images.
        const fallbackRanked = rankCandidates(fallbackPool, relevanceContext, brand.slug);
        combinedCandidates.push(...fallbackRanked.map((r) => r.candidate).slice(0, 3));
      }
    } catch { /* swallow — final fallback is no image */ }
  }

  const candidates: ImageCandidate[] = combinedCandidates;

  if (candidates.length === 0) {
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

  // Use a falsy-aware fallback (NOT `??`) so an empty-string hookText from
  // /api/captions falls through to a caption-derived hook instead of an empty
  // overlay that crashes the renderer (libvips "no text to render"). See
  // hook-fallback.ts.
  const hookText = resolveHook({
    hookText: captionPayload.hookText,
    caption: captionPayload.caption,
  });
  const renderBrand: Brand =
    brand.slug === 'affectly' || brand.slug === 'pacebrain' ? (brand.slug as Brand) : 'affectly';

  // Candidate failover: image CDNs (Pixabay/Unsplash/Pexels) periodically
  // rate-limit Vercel's shared egress IPs with a 429. fetchImageBuffer
  // already retries 3× with backoff, but if the chosen URL stays throttled
  // we'd kill the whole generation while 5+ other ranked candidates sit
  // unused. Walk the list until one downloads cleanly. Non-rate-limit
  // errors (bad URL, sharp failure, etc.) still abort immediately — those
  // aren't recoverable by picking another URL.
  // JIT no-reuse refresh. `usedUrls` was built at the top of this function —
  // between then and now a concurrent autopilot run (manual "Run now" + cron
  // tick, or two rapid clicks) may have committed a post that picked one of
  // the candidates below. Re-fetch the brand's URL set right before the
  // composite loop and normalise — one extra query that closes the race for
  // anything committed since function entry, AND handles CDN-signed URLs
  // that the original per-candidate eq() check couldn't match.
  const recentImageRows = await db
    .select({
      src: posts.sourceImageUrl,
      processed: posts.processedImageUrl,
      hash: posts.imageHash,
    })
    .from(posts)
    .where(eq(posts.brandId, brandId));
  const usedUrlsJit = buildDedupSet(
    recentImageRows.flatMap((r) => [r.src, r.processed]),
  );
  // Refresh past-hash set too — concurrent runs could have inserted between
  // the top-of-function fetch and now.
  for (const r of recentImageRows) {
    if (r.hash && r.hash.length === 16) pastHashes.add(r.hash);
  }

  // Lazy backfill: for up to N past rows that have a URL but no hash yet,
  // fetch the bytes and compute the hash on the fly. This is what fixes the
  // user's immediate complaint — without this, the first run after the
  // pHash deploy has zero past hashes to compare against. Capped at 6 per
  // generation so backfill never busts god-mode's 90s function timeout
  // (each fetch+hash is ~200-500ms). Cumulative across many runs.
  const BACKFILL_CAP = 6;
  const backfillTargets = allImageRows.filter(
    (r) => r.src && (!r.hash || r.hash.length !== 16),
  );
  for (const r of backfillTargets.slice(0, BACKFILL_CAP)) {
    try {
      const buf = await fetchImageBuffer(r.src!);
      const h = await computeImageHash(buf);
      pastHashes.add(h);
      // Persist for future runs. Best-effort — failure to write must not
      // block generation.
      await db
        .update(posts)
        .set({ imageHash: h })
        .where(eq(posts.id, r.id))
        .catch(() => {});
    } catch {
      // Bad URL / fetch failure / sharp decode error — skip silently. The
      // row remains un-hashed and may be retried on the next generation.
    }
  }

  let imageBuffer: Buffer | null = null;
  let sourceImageUrl: string | null = null;
  let sourceImageHash: string | null = null;
  let lastImageError: Error | null = null;
  for (const candidate of candidates) {
    if (usedUrlsJit.has(normalizeImageUrlForDedup(candidate.url))) continue;

    // Visual dedup — fetch the bytes, hash, compare against past. Same
    // photo at a different Pixabay URL collapses to the same hash.
    let candidateBytes: Buffer;
    let candidateHash: string;
    try {
      candidateBytes = await fetchImageBuffer(candidate.url);
      candidateHash = await computeImageHash(candidateBytes);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastImageError = e;
      // Rate-limit on fetch → try next candidate. Other errors → abort.
      if (!/rate-limit/i.test(e.message)) throw e;
      continue;
    }
    if (isVisuallyDuplicate(candidateHash, pastHashes, DEFAULT_HAMMING_THRESHOLD)) {
      // Same photo (different URL). Treat as used and move on.
      continue;
    }

    try {
      // We have the bytes already, but createInstagramImageWithText takes a
      // URL; passing the URL again means a second download. The cost is
      // bounded (one redundant fetch per successful generation) and avoids
      // a deeper refactor of the image-processing module. Acceptable for v1.
      imageBuffer = await createInstagramImageWithText(
        candidate.url,
        renderBrand,
        hookText.slice(0, 60),
        seed.textPosition,
        '#FFFFFF',
        64,
        seed.overlayStyle,
        brand.logoUrl ?? null,
      );
      sourceImageUrl = candidate.url;
      sourceImageHash = candidateHash;
      break;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastImageError = e;
      if (!/rate-limit/i.test(e.message)) throw e;
    }
  }
  if (!imageBuffer || !sourceImageUrl) {
    return {
      ok: false,
      err: {
        error: 'image_rate_limited',
        message:
          lastImageError?.message ??
          'Every candidate image was rate-limited. Try again in a moment.',
        status: 503,
      },
    };
  }
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
      imageHash: sourceImageHash,
      caption: captionPayload.caption ?? '',
      hashtags: captionPayload.hashtags ?? '',
      hookText: hookText.slice(0, 60),
      // The value is an AngleId at the source (captions/route chosenAngle.id); it
      // just crossed HTTP as a string, so narrow it back at this boundary.
      angle: (captionPayload.angle ?? null) as AngleId | null,
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
