'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { hashtagSets, optimalPostingTimes } from '@/data/competitor-insights';
import { suggestedQueries, brandCategories } from '@/lib/pixabay';
import type { ImageResult } from '@/lib/image-sources';
import { generateCaption, extractHookText, resetCaptionHistory, sanitizeCaption, sanitizeHook, sanitizeHashtags } from '@/lib/caption-engine';
import { decodeLearnings } from '@/lib/analyze/learnings';
import { mergePerfectSeed } from '@/lib/smart-posts';
import type { InsightCard } from '@/lib/health-score';
import { rankCandidates } from '@/lib/smart-posts/image-scoring';
import { normalizeImageUrlForDedup, buildDedupSet } from '@/lib/smart-posts/url-dedup';

type Brand = string;
type ContentType = 'quote' | 'tip' | 'carousel' | 'community' | 'promo';
type ImageEffect = 'none' | 'duotone' | 'color-blend' | 'vignette' | 'high-contrast';

const IMAGE_EFFECTS: ImageEffect[] = ['none', 'duotone', 'color-blend', 'vignette', 'high-contrast'];
const IMAGE_EFFECT_LABELS: Record<ImageEffect, string> = {
  none: 'Original',
  duotone: 'Duotone',
  'color-blend': 'Color Blend',
  vignette: 'Vignette',
  'high-contrast': 'High Contrast',
};

function getHashtagsForPost(brand: Brand): string {
  const tags = hashtagSets[brand as keyof typeof hashtagSets];
  if (!tags) return '';
  const branded = tags.branded.slice(0, 1);
  const reach = [...tags.tier1_reach].sort(() => Math.random() - 0.5).slice(0, 2);
  const niche = [...tags.tier3_niche].sort(() => Math.random() - 0.5).slice(0, 2);
  return [...branded, ...reach, ...niche].join(' ');
}

// ── Types ────────────────────────────────────────────────────────────────

interface BatchPost {
  id: string;
  dbId?: string; // Database UUID after persistence
  brand: Brand;
  contentType: ContentType;
  caption: string;
  hashtags: string;
  hookText: string;
  imageUrl: string | null;
  processedImageUrl: string | null;
  status: 'ready' | 'scheduling' | 'scheduled' | 'error';
  error?: string;
  scheduledAt?: string; // ISO string — auto-assigned from optimal times
  scheduledLabel?: string; // Human-readable label
}

// Generate optimal time slots for a brand over the next 7 days
function generateTimeSlots(brand: Brand, count: number): { iso: string; label: string }[] {
  const times = optimalPostingTimes[brand as keyof typeof optimalPostingTimes] || optimalPostingTimes[Object.keys(optimalPostingTimes)[0] as keyof typeof optimalPostingTimes];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const bestDaySet = new Set(times.bestDays.map((d: string) => d.toLowerCase()));
  const slots: { iso: string; label: string; isBest: boolean }[] = [];

  for (let dayOffset = 0; dayOffset < 42; dayOffset++) {
    const target = new Date();
    target.setDate(target.getDate() + dayOffset);
    const dow = target.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayTimes = isWeekend ? times.weekend : times.weekday;
    const dayNameFull = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dow];
    const isBest = bestDaySet.has(dayNameFull);

    // Pick one random time per day to spread posts across weeks
    const t = dayTimes[Math.floor(Math.random() * dayTimes.length)];
    if (!t) continue;
    const [time, period] = t.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    let h = hours;
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    const slot = new Date(target);
    slot.setHours(h, minutes, 0, 0);
    if (slot <= new Date()) continue;
    slots.push({
      iso: slot.toISOString(),
      label: `${dayNames[dow]} ${monthNames[slot.getMonth()]} ${slot.getDate()} at ${t}${isBest ? ' ★' : ''}`,
      isBest,
    });
  }

  // Sort chronologically, then evenly sample to spread across the full range
  slots.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  if (slots.length <= count) {
    return slots.map(s => ({ iso: s.iso, label: s.label }));
  }

  // Evenly space picks across the available slots
  const picked: typeof slots = [];
  const step = slots.length / count;
  for (let i = 0; i < count; i++) {
    picked.push(slots[Math.floor(i * step)]);
  }
  return picked.map(s => ({ iso: s.iso, label: s.label }));
}

interface BufferChannel {
  id: string;
  name: string;
  service: string;
  avatar: string;
}

interface BufferOrganization {
  id: string;
  name: string;
  channels: BufferChannel[];
}

interface ApiBrand {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

// Hints derived from a brand's analyze insights, forwarded to /api/captions
// to make the batch caption generator learning-aware. When learningIds are
// supplied (cart-passed), they filter the insights; otherwise we use every
// actionable insight the brand has.
interface BatchHints {
  hookPattern?: string;
  captionLengthHint?: 'short' | 'medium' | 'long';
  captionPatternHint?: { type: string; label: string };
  toneHint?: 'community';
  avoidTopics: string[];
  // Autopilot's daily-updated strategic brief (briefMd). Passed straight to the
  // captions LLM so batch posts ride on the same fresh intel that autopilot
  // uses for its single posts.
  brainBriefMd?: string;
}

const EMPTY_HINTS: BatchHints = { avoidTopics: [] };

// ── Component ────────────────────────────────────────────────────────────

export function BatchGallery() {
  const sp = useSearchParams();
  const incomingLearnings = decodeLearnings(sp.get('learnings'));
  const [posts, setPosts] = useState<BatchPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bufferOrgs, setBufferOrgs] = useState<BufferOrganization[]>([]);
  const [filter, setFilter] = useState('all');
  const generatingRef = useRef(false);
  const [apiBrands, setApiBrands] = useState<ApiBrand[]>([]);
  // Until this flips, "no brands" is indistinguishable from "not loaded yet",
  // and generating with zero brands silently produces nothing.
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  // ...and a FAILED request must not read as "you have no brands" either,
  // which would tell a user with five brands to go and create one.
  const [brandsError, setBrandsError] = useState(false);

  // Load Buffer orgs + brands on mount (cached)
  useEffect(() => {
    (async () => {
      const { cachedBufferFetch } = await import('@/lib/buffer-cache');
      const data = await cachedBufferFetch<{ organizations: BufferOrganization[] }>('/api/buffer?action=channels');
      if (data?.organizations) setBufferOrgs(data.organizations);
    })();

    fetch('/api/brands')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(data => {
        if (data.brands) setApiBrands(data.brands);
      })
      .catch(() => setBrandsError(true))
      .finally(() => setBrandsLoaded(true));
  }, []);

  // Find matching channel for a brand
  const getChannelForBrand = useCallback((brandSlug: Brand): { channelId: string; orgId: string } | null => {
    for (const org of bufferOrgs) {
      for (const ch of org.channels) {
        if (ch.name.toLowerCase().includes(brandSlug.toLowerCase())) {
          return { channelId: ch.id, orgId: org.id };
        }
      }
    }
    // Fallback: first channel
    if (bufferOrgs.length > 0 && bufferOrgs[0].channels.length > 0) {
      return { channelId: bufferOrgs[0].channels[0].id, orgId: bufferOrgs[0].id };
    }
    return null;
  }, [bufferOrgs]);

  // Generate all posts
  const [batchCount, setBatchCount] = useState(5);
  const batchCountRef = useRef(5);
  const [batchContentType, setBatchContentType] = useState<ContentType | 'mixed'>('mixed');
  const batchContentTypeRef = useRef<ContentType | 'mixed'>('mixed');
  const [batchEffect, setBatchEffect] = useState<ImageEffect | 'random'>('random');
  const batchEffectRef = useRef<ImageEffect | 'random'>('random');

  // Auto-pull hints for a brand from its analyze insights AND the autopilot
  // brain brief. Returns empty hints on any failure so the batch falls back
  // gracefully to the unguided flow.
  //
  // Two intel sources are merged here:
  //  - /api/insights?type=analytics — actionable cards (hookPattern, length,
  //    pattern, tone, avoidTopics) derived from your own past posts.
  //  - /api/autopilot/insights — the brain brief (briefMd), updated daily,
  //    forwarded as-is to the captions LLM so batch posts inherit the same
  //    fresh strategic context autopilot uses.
  const deriveHintsForBrand = useCallback(
    async (brandId: string, learningIds: string[] | undefined): Promise<BatchHints> => {
      const [analyticsRes, autopilotRes] = await Promise.allSettled([
        fetch(`/api/insights?type=analytics&brandId=${encodeURIComponent(brandId)}`),
        fetch(`/api/autopilot/insights?brandId=${encodeURIComponent(brandId)}`),
      ]);

      let analyticsHints: Omit<BatchHints, 'brainBriefMd'> = { avoidTopics: [] };
      if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
        try {
          const payload = (await analyticsRes.value.json()) as { insights?: InsightCard[] };
          const all = payload.insights ?? [];
          const filtered =
            learningIds && learningIds.length > 0
              ? all.filter((c) => learningIds.includes(c.id))
              : all;
          if (filtered.length > 0) {
            const merged = mergePerfectSeed(filtered, brandId);
            if (merged) {
              const seed = merged.seed;
              analyticsHints = {
                hookPattern: seed.hookPattern,
                captionLengthHint: seed.captionLengthHint,
                captionPatternHint: seed.captionPatternHint,
                toneHint: seed.toneHint,
                avoidTopics: seed.avoidTopics ?? [],
              };
            }
          }
        } catch {
          /* fall through with empty analytics */
        }
      }

      let brainBriefMd: string | undefined;
      if (autopilotRes.status === 'fulfilled' && autopilotRes.value.ok) {
        try {
          const payload = (await autopilotRes.value.json()) as { brain?: { briefMd?: string } | null };
          if (payload.brain?.briefMd) brainBriefMd = payload.brain.briefMd;
        } catch {
          /* brain optional */
        }
      }

      return { ...analyticsHints, brainBriefMd };
    },
    [],
  );

  const generateBatch = useCallback(async () => {
    const currentBatchCount = batchCountRef.current;
    if (generatingRef.current) return;
    // Without brands there is nothing to generate FOR: the old code sailed on
    // and span through "Generating 0/0..." producing nothing, with no message.
    if (apiBrands.length === 0) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setPosts([]);

    const selectedType = batchContentTypeRef.current;
    const contentTypes: ContentType[] = selectedType === 'mixed'
      ? ['quote', 'tip', 'community', 'promo']
      : [selectedType];
    // Use actual brands from DB
    const brandSlugs: Brand[] = apiBrands.length > 0
      ? apiBrands.map(b => b.slug)
      : [];
    const newPosts: BatchPost[] = [];

    // Distribute posts across brands
    const postsPerBrand = Math.ceil(currentBatchCount / Math.max(brandSlugs.length, 1));
    const roundsNeeded = Math.ceil(postsPerBrand / contentTypes.length);

    // Cart-passed learnings narrow the insight set; absent → use every
    // actionable insight the brand has (auto-pull mode).
    const filterLearnings = incomingLearnings.length > 0 ? incomingLearnings : undefined;
    const brandHintsMap = new Map<string, BatchHints>();

    resetCaptionHistory();
    let postIdx = 0;
    for (const brand of brandSlugs) {
      // Derive hints once per brand at the start of its loop
      if (!brandHintsMap.has(brand)) {
        const matchedBrand = apiBrands.find((b) => b.slug === brand);
        const hints = matchedBrand
          ? await deriveHintsForBrand(matchedBrand.id, filterLearnings)
          : EMPTY_HINTS;
        brandHintsMap.set(brand, hints);
      }
      const brandHints = brandHintsMap.get(brand) ?? EMPTY_HINTS;

      const slots = generateTimeSlots(brand, postsPerBrand);
      let brandPostCount = 0;
      for (let round = 0; round < roundsNeeded && brandPostCount < postsPerBrand; round++) {
        for (const type of contentTypes) {
          if (brandPostCount >= postsPerBrand || postIdx >= currentBatchCount) break;
          let caption = '';
          let hashtags = '';
          let hookText = '';

          // Use universal sanitizers from caption-engine

          // Try AI generation with uniqueness tracking
          try {
            const aiRes = await fetch('/api/captions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                brandSlug: brand,
                contentType: type,
                variationSeed: postIdx * 100 + Math.floor(Math.random() * 99),
                avoidTopics: [
                  ...brandHints.avoidTopics,
                  ...newPosts
                    .filter((p) => p.brand === brand)
                    .map((p) => p.hookText)
                    .filter(Boolean),
                ],
                hookPattern: brandHints.hookPattern,
                captionLengthHint: brandHints.captionLengthHint,
                captionPatternHint: brandHints.captionPatternHint,
                toneHint: brandHints.toneHint,
                brainBriefMd: brandHints.brainBriefMd,
              }),
            });
            const aiData = await aiRes.json();
            if (aiData.success && aiData.caption) {
              caption = sanitizeCaption(aiData.caption);
              hashtags = sanitizeHashtags(aiData.hashtags || '');
              hookText = sanitizeHook(aiData.hookText || '');
            }
          } catch {
            // Fall through to pool
          }

          // Fallback to pre-written pool (only works for known brands)
          if (!caption) {
            try {
              caption = generateCaption(brand as 'affectly' | 'pacebrain', type);
            } catch {
              caption = `Check out our latest ${type} content!`;
            }
            hashtags = getHashtagsForPost(brand);
          }

          // Final sanitization pass
          caption = sanitizeCaption(caption);
          hashtags = sanitizeHashtags(hashtags);
          hookText = hookText ? sanitizeHook(hookText) : '';

          // Always ensure hookText exists
          if (!hookText) {
            hookText = sanitizeHook(extractHookText(caption));
          }

          const slot = slots[postIdx % slots.length] || undefined;
          postIdx++;
          brandPostCount++;
          newPosts.push({
            id: `${brand}-${type}-${round}-${postIdx}`,
            brand,
            contentType: type,
            caption,
            hashtags,
            hookText,
            imageUrl: null,
            processedImageUrl: null,
            status: 'ready',
            scheduledAt: slot?.iso,
            scheduledLabel: slot?.label,
          });

          // Update UI progressively
          setPosts([...newPosts]);
        }
      }
    }

    // Shuffle within each brand for variety
    const shuffled = brandSlugs.flatMap(b =>
      newPosts.filter(p => p.brand === b).sort(() => Math.random() - 0.5)
    );
    setPosts(shuffled);

    // Fetch unique images — cycle through all queries, never reusing the same one
    const usedQueries: Record<string, number> = {};
    for (const b of brandSlugs) usedQueries[b] = 0;
    // ImageResult.id is a string after the multi-source refactor (commit bc1c71d).
    // Previously this was Set<number> and the dedup filter checked typeof === 'number',
    // silently dropping every image and leaving the batch grid empty.
    const usedImageIds = new Set<string>();

    // Cross-batch image dedup. Without this, every Generate click resets the
    // used-image memory and the same photo (the user reported "lady biting on
    // the pen" appearing 5x) keeps surfacing because Pixabay's ranker is
    // deterministic for a given query. Pre-populate per brand from past posts
    // so the same photo never wins twice across runs.
    //
    // URLs are normalised (query-string-stripped) so signed-CDN variants of
    // the same Pixabay/Unsplash/Pexels photo dedup correctly.
    const usedUrlsByBrand = new Map<string, Set<string>>();
    await Promise.all(
      brandSlugs.map(async (brand) => {
        const matched = apiBrands.find((b) => b.slug === brand);
        if (!matched) {
          usedUrlsByBrand.set(brand, new Set<string>());
          return;
        }
        try {
          const res = await fetch(`/api/posts?brandId=${encodeURIComponent(matched.id)}&limit=200`);
          if (!res.ok) {
            usedUrlsByBrand.set(brand, new Set<string>());
            return;
          }
          const data = (await res.json()) as {
            posts?: Array<{ sourceImageUrl?: string | null; processedImageUrl?: string | null }>;
          };
          const urls = (data.posts ?? []).flatMap((p) => [p.sourceImageUrl, p.processedImageUrl]);
          usedUrlsByBrand.set(brand, buildDedupSet(urls));
        } catch {
          usedUrlsByBrand.set(brand, new Set<string>());
        }
      }),
    );
    const batchSize = 4;
    for (let i = 0; i < shuffled.length; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize);
      await Promise.all(batch.map(async (post) => {
        try {
          // Step 1: get up to 5 query alternatives from the LLM. Brand
          // description sharpens the queries — without it the model sees
          // only "affectly" as a string and produces generic queries that
          // drift to mood-stock (plant pots for "science-backed insights").
          const matchedBrandRecord = apiBrands.find((b) => b.slug === post.brand);
          const brandDescription = matchedBrandRecord?.description ?? '';
          let queries: string[] = [];
          try {
            const pickRes = await fetch('/api/images/pick', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: post.caption,
                hookText: post.hookText,
                brand: post.brand,
                brandDescription,
                contentType: post.contentType,
              }),
            });
            const pickData = await pickRes.json();
            if (Array.isArray(pickData.alternatives) && pickData.alternatives.length > 0) {
              queries = pickData.alternatives;
            } else if (pickData.searchTerm) {
              queries = [pickData.searchTerm];
            }
          } catch { /* fallback below */ }

          // Fallback: extract keywords from caption + hook when LLM is down
          if (queries.length === 0) {
            const source = `${post.hookText} ${post.caption}`;
            const stopWords = new Set(['about','after','being','could','every','their','these','thing','think','those','would','which','while','your','from','have','into','just','know','like','make','more','most','much','only','over','some','such','take','than','that','them','then','they','this','very','want','what','when','will','with']);
            const words = source.split(/\s+/)
              .map((w: string) => w.replace(/[^a-zA-Z]/g, '').toLowerCase())
              .filter((w: string) => w.length > 3 && !stopWords.has(w) && !w.startsWith('#'));
            queries = [words.slice(0, 3).join(' ') || post.brand];
          }

          // Step 2: fan out — fetch the top 3 queries in parallel, dedupe
          // by image id. A single query that drifts off-topic isn't fatal
          // when alternatives are searched alongside it.
          const TOP_N_QUERIES = 3;
          const fetchResults = await Promise.all(
            queries.slice(0, TOP_N_QUERIES).map(async (q) => {
              try {
                const r = await fetch(`/api/images?source=all&q=${encodeURIComponent(q)}`);
                const d = await r.json();
                return (d.images || d.hits || []) as ImageResult[];
              } catch {
                return [];
              }
            }),
          );
          const seenIds = new Set<string>();
          const combinedHits: ImageResult[] = [];
          for (const list of fetchResults) {
            for (const h of list) {
              const id = h.id != null ? String(h.id) : '';
              if (id && !seenIds.has(id)) {
                seenIds.add(id);
                combinedHits.push(h);
              }
            }
          }

          if (combinedHits.length > 0) {
            // Step 3: use the same brand-aware ranker autopilot uses
            // (rankCandidates from smart-posts/image-scoring). Sort priority is:
            //   1. Brand-domain match (HARD floor — pacebrain → running tags,
            //      affectly → study tags, with motorsport/book negatives that
            //      disqualify a Formula 1 photo for a "race predictions" post)
            //   2. Non-landscape before landscape
            //   3. Higher caption/hook tag overlap
            //
            // Includes brand description in the context bag so brand-relevant
            // tags ("running", "athlete" for PaceBrain) win even when caption
            // tokens are metaphorical.
            const contextText = [post.caption, post.hookText, post.brand, brandDescription].join(' ');
            const scorable = combinedHits.map((h) => ({
              url: h.largeImageURL,
              tags: h.tags,
              _hit: h,
            }));
            const ranked = rankCandidates(scorable, contextText, post.brand);

            // Cross-batch + in-batch dedup. Walk the ranked list in order and
            // pick the first whose normalised URL hasn't been used for this
            // brand (either in a prior batch run or earlier in this one).
            const usedUrls = usedUrlsByBrand.get(post.brand) ?? new Set<string>();
            let chosen: typeof scorable[number] | null = null;
            for (const r of ranked) {
              const normalised = normalizeImageUrlForDedup(r.candidate.url);
              const id = String(r.candidate._hit.id);
              if (!usedUrls.has(normalised) && !usedImageIds.has(id)) {
                chosen = r.candidate;
                break;
              }
            }
            // If every candidate has been used, fall back to ranked[0] so the
            // post still ships with an image — duplicates beat blanks.
            if (!chosen && ranked.length > 0) chosen = ranked[0].candidate;
            if (!chosen) return;

            const img = chosen._hit;
            usedImageIds.add(String(img.id));
            usedUrls.add(normalizeImageUrlForDedup(img.largeImageURL));
            usedUrlsByBrand.set(post.brand, usedUrls);

            // Process image with overlay via /api/logo (returns raw image bytes)
            const cleanHook = sanitizeHook(post.hookText || '');
            const currentEffect = batchEffectRef.current;
            const postEffect: ImageEffect = currentEffect === 'random'
              ? IMAGE_EFFECTS[Math.floor(Math.random() * IMAGE_EFFECTS.length)]
              : currentEffect;
            const body: Record<string, unknown> = {
              imageUrl: img.largeImageURL,
              brand: post.brand,
              overlayText: cleanHook || undefined,
              textPosition: 'center',
              fontSize: 80,
              overlayStyle: 'editorial',
              imageEffect: postEffect,
            };
            const processResponse = await fetch('/api/logo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            let processedUrl: string | null = null;
            if (processResponse.ok) {
              const blob = await processResponse.blob();
              processedUrl = URL.createObjectURL(blob);
            }

            setPosts(prev => prev.map(p =>
              p.id === post.id
                ? {
                    ...p,
                    imageUrl: img.largeImageURL,
                    processedImageUrl: processedUrl,
                  }
                : p
            ));
          }
        } catch {
          // Image fetch failed — post still usable without image
        }
      }));
    }

    // Persist all generated posts to DB as drafts
    setPosts(currentPosts => {
      const postsToSave = [...currentPosts];
      (async () => {
        for (const post of postsToSave) {
          const matchedBrand = apiBrands.find(
            b => b.slug === post.brand || b.name.toLowerCase() === post.brand,
          );
          if (!matchedBrand) continue;
          try {
            const res = await fetch('/api/posts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                brandId: matchedBrand.id,
                caption: post.caption,
                hashtags: post.hashtags || undefined,
                hookText: post.hookText || undefined,
                contentType: post.contentType,
                overlayStyle: 'editorial',
                textPosition: 'center',
                fontSize: 80,
                sourceImageUrl: post.imageUrl || undefined,
                processedImageUrl: undefined, // blob URLs aren't persistable
                status: 'draft',
              }),
            });
            if (res.ok) {
              const data = await res.json();
              const dbId = data.post?.id;
              if (dbId) {
                setPosts(prev => prev.map(p =>
                  p.id === post.id ? { ...p, dbId } : p
                ));
              }
            }
          } catch {
            // DB save failed for this post — continue with others
          }
        }
      })();
      return postsToSave;
    });

    setIsGenerating(false);
    generatingRef.current = false;
  }, [apiBrands, incomingLearnings, deriveHintsForBrand]);

  // Schedule a single post to Buffer
  const schedulePost = useCallback(async (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const channel = getChannelForBrand(post.brand);
    if (!channel) {
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, status: 'error', error: 'No Buffer channel found' } : p
      ));
      return;
    }

    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, status: 'scheduling' } : p
    ));

    try {
      const body: Record<string, unknown> = {
        channelId: channel.channelId,
        organizationId: channel.orgId,
        text: `${post.caption}\n\n${post.hashtags}`.trim(),
        mode: post.scheduledAt ? 'customScheduled' : 'addToQueue',
        scheduledAt: post.scheduledAt || undefined,
      };
      if (post.imageUrl) {
        body.imageUrl = post.imageUrl;
        body.brand = post.brand;
        body.imageEffect = batchEffectRef.current === 'random' ? 'none' : batchEffectRef.current;
        if (post.hookText) {
          body.overlayText = post.hookText;
          body.textPosition = 'center';
          body.fontSize = 80;
          body.overlayStyle = 'editorial';
        }
      }

      const response = await fetch('/api/buffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to schedule');
      }

      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, status: 'scheduled' } : p
      ));

      // Update status in DB
      if (post.dbId) {
        fetch('/api/posts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: post.dbId, status: 'scheduled' }),
        }).catch(() => {});
      }
    } catch (err) {
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, status: 'error', error: err instanceof Error ? err.message : 'Failed' }
          : p
      ));
    }
  }, [posts, getChannelForBrand]);

  // Schedule all ready posts (sequential to avoid rate limiting)
  const [isSchedulingAll, setIsSchedulingAll] = useState(false);
  const scheduleAll = useCallback(async () => {
    const readyPosts = posts.filter(p => p.status === 'ready');
    if (readyPosts.length === 0) return;
    setIsSchedulingAll(true);
    for (const post of readyPosts) {
      await schedulePost(post.id);
    }
    setIsSchedulingAll(false);
  }, [posts, schedulePost]);

  // Update caption for a post
  const updateCaption = useCallback((postId: string, newCaption: string) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, caption: newCaption, hookText: extractHookText(newCaption) }
        : p
    ));
  }, []);

  const filteredPosts = filter === 'all' ? posts : posts.filter(p => p.brand === filter);
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;
  const readyCount = posts.filter(p => p.status === 'ready').length;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Content type */}
          <select
            value={batchContentType}
            onChange={(e) => { setBatchContentType(e.target.value as ContentType | 'mixed'); batchContentTypeRef.current = e.target.value as ContentType | 'mixed'; }}
            disabled={isGenerating}
            className="h-9 rounded-lg bg-(--surface-2) border border-(--line) text-(--txt) text-sm px-3 focus:outline-none focus:ring-1 focus:ring-(--violet) disabled:opacity-50"
          >
            <option value="mixed">Mixed Content</option>
            <option value="promo">Promo</option>
            <option value="quote">Quote</option>
            <option value="tip">Tips / How-to</option>
            <option value="community">Community</option>
          </select>

          {/* Image effect */}
          <select
            value={batchEffect}
            onChange={(e) => { setBatchEffect(e.target.value as ImageEffect | 'random'); batchEffectRef.current = e.target.value as ImageEffect | 'random'; }}
            disabled={isGenerating}
            className="h-9 rounded-lg bg-(--surface-2) border border-(--line) text-(--txt) text-sm px-3 focus:outline-none focus:ring-1 focus:ring-(--violet) disabled:opacity-50"
          >
            <option value="random">Random Effects</option>
            <option value="none">Original</option>
            <option value="duotone">Duotone</option>
            <option value="color-blend">Color Blend</option>
            <option value="vignette">Vignette</option>
            <option value="high-contrast">High Contrast</option>
          </select>

          {incomingLearnings.length > 0 && (
            <div className="rounded-lg border border-(--violet-24) bg-(--violet-12) px-3 py-1.5 text-xs text-(--violet-bright)">
              {incomingLearnings.length} learning{incomingLearnings.length === 1 ? '' : 's'} from Analyze will guide this batch
            </div>
          )}

          {/* Post count radio buttons */}
          <div className="flex items-center gap-1 bg-(--surface-2) rounded-lg p-1 border border-(--line)">
            {[1, 5, 15, 20, 30].map(n => (
              <button
                key={n}
                onClick={() => { setBatchCount(n); batchCountRef.current = n; }}
                disabled={isGenerating}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  batchCount === n
                    ? 'bg-(--violet) text-white'
                    : 'text-(--muted) hover:text-(--txt) hover:bg-white/[0.04]'
                } disabled:opacity-50`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            onClick={() => void generateBatch()}
            disabled={isGenerating || !brandsLoaded || apiBrands.length === 0}
            title={brandsLoaded && !brandsError && apiBrands.length === 0 ? 'Add a brand in Settings first' : undefined}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-(--violet) to-(--violet-deep) hover:from-(--violet-bright) hover:to-(--violet) text-white shadow-lg transition-all disabled:opacity-60 flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating {posts.filter(p => p.imageUrl).length}/{posts.length}...
              </>
            ) : !brandsLoaded ? (
              'Loading your brands...'
            ) : brandsError ? (
              'Unavailable'
            ) : apiBrands.length === 0 ? (
              'No brands yet'
            ) : (
              `Generate ${batchCount} Posts`
            )}
          </button>
          {brandsLoaded && brandsError && (
            <span className="text-sm text-rose-400">
              Could not load your brands. Refresh the page to try again.
            </span>
          )}
          {brandsLoaded && !brandsError && apiBrands.length === 0 && (
            <span className="text-sm text-(--muted)">
              Add a brand in Settings and this will generate posts for it.
            </span>
          )}
        </div>

        {posts.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-6 bg-(--line)" />
            <div className="flex gap-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-(--surface-2) text-(--txt)'
                    : 'text-(--muted) hover:text-(--txt) hover:bg-white/[0.04]'
                }`}
              >
                All
              </button>
              {apiBrands.map(b => (
                <button
                  key={b.id}
                  onClick={() => setFilter(b.slug)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === b.slug
                      ? 'bg-(--surface-2) text-(--txt)'
                      : 'text-(--muted) hover:text-(--txt) hover:bg-white/[0.04]'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
            {readyCount > 0 && (
              <Button
                onClick={scheduleAll}
                disabled={isSchedulingAll || isGenerating}
                size="sm"
                className="cta-violet text-xs font-medium"
              >
                {isSchedulingAll ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Scheduling...
                  </span>
                ) : `Schedule All (${readyCount})`}
              </Button>
            )}
            <Separator orientation="vertical" className="h-6 bg-(--line)" />
            <div className="flex gap-3 text-xs text-(--muted)">
              <span>{readyCount} ready</span>
              <span className="text-(--success)">{scheduledCount} scheduled</span>
            </div>
          </>
        )}
      </div>

      {/* Post grid */}
      {posts.length === 0 && !isGenerating && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-(--surface-2) flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📋</span>
          </div>
          <h3 className="text-lg font-medium text-(--txt) mb-1">Batch Gallery</h3>
          <p className="text-sm text-(--muted) max-w-md mx-auto">
            Generate pre-made posts for all your brands with images, captions, and hooks.
            Preview each one, then schedule the ones you like with a single click.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredPosts.map(post => (
          <Card
            key={post.id}
            className={`bg-(--surface) border-(--line) overflow-hidden transition-all ${
              post.status === 'scheduled' ? 'opacity-60 border-(--success)/40' : ''
            } ${expandedId === post.id ? 'ring-1 ring-(--violet-24)' : ''}`}
          >
            {/* Image preview */}
            <div className="relative aspect-square bg-(--surface-2)">
              {(post.processedImageUrl || post.imageUrl) ? (
                <>
                  <Image
                    src={post.processedImageUrl || post.imageUrl!}
                    alt="Post preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {/* Hook text CSS overlay (editorial style) */}
                  {post.hookText && (
                    <>
                      <div className="absolute inset-0 bg-black/50" />
                      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 p-6 flex flex-col items-center">
                        <p className="relative text-center leading-tight text-white drop-shadow-lg font-serif tracking-wide"
                           style={{ fontSize: '20px' }}>
                          {post.hookText}
                        </p>
                        <div className="w-16 h-0.5 bg-(--violet-bright) rounded-full mt-3" />
                      </div>
                    </>
                  )}
                </>
              ) : isGenerating ? (
                <div className="flex items-center justify-center h-full">
                  <span className="w-6 h-6 border-2 border-(--line) border-t-(--violet) rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-(--muted-2) text-xs">
                  No image
                </div>
              )}
              {/* Brand badge */}
              <Badge
                className="absolute top-2 left-2 text-[10px] bg-(--violet) text-white border-0"
              >
                {apiBrands.find(b => b.slug === post.brand)?.name || post.brand}
              </Badge>
              <Badge className="absolute top-2 right-2 bg-(--surface)/70 text-(--txt) border-0 text-[10px]">
                {post.contentType}
              </Badge>
              {post.status === 'scheduled' && (
                <div className="absolute inset-0 bg-(--success)/20 flex items-center justify-center">
                  <span className="text-3xl">✓</span>
                </div>
              )}
            </div>

            <CardContent className="p-3 space-y-2">
              {/* Hook preview */}
              {post.hookText && (
                <p className="text-xs text-(--violet-bright) font-semibold leading-snug line-clamp-1">
                  &ldquo;{post.hookText}&rdquo;
                </p>
              )}

              {/* Caption preview (truncated, cleaned) */}
              <p className="text-[11px] text-(--muted) leading-snug line-clamp-4">
                {post.caption.replace(/^(caption\s*:\s*)/i, '').replace(/,\s*hashtags:[\s\S]*/i, '').trim()}
              </p>

              {/* Scheduled time */}
              {post.scheduledLabel && (
                <p className="text-[10px] text-(--violet-bright) flex items-center gap-1">
                  <span>🕐</span> {post.scheduledLabel}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {post.status === 'ready' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => schedulePost(post.id)}
                      className="cta-violet flex-1 h-7 text-xs"
                    >
                      Schedule
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}
                      className="h-7 text-xs bg-(--surface-2) border-(--line) text-(--muted) hover:bg-white/[0.04] hover:text-(--txt)"
                    >
                      Preview
                    </Button>
                  </>
                )}
                {post.status === 'scheduling' && (
                  <div className="flex items-center gap-2 text-xs text-(--muted)">
                    <span className="w-3 h-3 border-2 border-(--line) border-t-(--violet) rounded-full animate-spin" />
                    Scheduling...
                  </div>
                )}
                {post.status === 'scheduled' && (
                  <span className="text-xs text-(--success) font-medium">Scheduled</span>
                )}
                {post.status === 'error' && (
                  <div className="space-y-1 w-full">
                    <p className="text-xs text-red-400 truncate">{post.error}</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setPosts(prev => prev.map(p =>
                          p.id === post.id ? { ...p, status: 'ready', error: undefined } : p
                        ));
                      }}
                      className="h-6 text-[10px] bg-(--surface-2) hover:bg-white/[0.04] text-(--txt)"
                    >
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>

            {/* Expanded preview panel */}
            {expandedId === post.id && (
              <div className="border-t border-(--line) p-3 space-y-3 bg-(--bg)">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-(--muted) uppercase tracking-wider font-medium">Caption</label>
                  <Textarea
                    value={post.caption}
                    onChange={(e) => updateCaption(post.id, e.target.value)}
                    className="bg-(--surface-2) border-(--line) text-(--txt) text-xs min-h-[120px] resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-(--muted) uppercase tracking-wider font-medium">Hook Text</label>
                  <p className="text-xs text-(--violet-bright) bg-(--surface-2) rounded px-2 py-1.5">
                    {post.hookText || '(auto-generated from caption)'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-(--muted) uppercase tracking-wider font-medium">Hashtags</label>
                  <p className="text-[11px] text-(--violet-bright) bg-(--surface-2) rounded px-2 py-1.5">
                    {post.hashtags}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => schedulePost(post.id)}
                  disabled={post.status !== 'ready'}
                  className="cta-violet w-full h-8 text-xs"
                >
                  Schedule This Post
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
