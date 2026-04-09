'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { hashtagSets, optimalPostingTimes } from '@/data/competitor-insights';
import { suggestedQueries, brandCategories } from '@/lib/pixabay';
import type { PixabayImage } from '@/lib/pixabay';
import { generateCaption, extractHookText, resetCaptionHistory, sanitizeCaption, sanitizeHook, sanitizeHashtags } from '@/lib/caption-engine';

type Brand = string;
type ContentType = 'quote' | 'tip' | 'carousel' | 'community' | 'promo';

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
}

// ── Component ────────────────────────────────────────────────────────────

export function BatchGallery() {
  const [posts, setPosts] = useState<BatchPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bufferOrgs, setBufferOrgs] = useState<BufferOrganization[]>([]);
  const [filter, setFilter] = useState('all');
  const generatingRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [apiBrands, setApiBrands] = useState<ApiBrand[]>([]);

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
      .catch(() => {});
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
  const [batchCount, setBatchCount] = useState(10);
  const batchCountRef = useRef(10);
  const [batchContentType, setBatchContentType] = useState<ContentType | 'mixed'>('mixed');
  const batchContentTypeRef = useRef<ContentType | 'mixed'>('mixed');

  const generateBatch = useCallback(async () => {
    const currentBatchCount = batchCountRef.current;
    if (generatingRef.current) return;
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

    resetCaptionHistory();
    let postIdx = 0;
    for (const brand of brandSlugs) {
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
                avoidTopics: newPosts
                  .filter(p => p.brand === brand)
                  .map(p => p.hookText)
                  .filter(Boolean),
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
    const usedImageIds = new Set<number>();
    const batchSize = 4;
    for (let i = 0; i < shuffled.length; i += batchSize) {
      const batch = shuffled.slice(i, i + batchSize);
      await Promise.all(batch.map(async (post) => {
        try {
          // Use AI to pick the best search term for this caption
          let query = '';
          try {
            const pickRes = await fetch('/api/images/pick', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caption: post.caption, brand: post.brand, contentType: post.contentType }),
            });
            const pickData = await pickRes.json();
            if (pickData.searchTerm) query = pickData.searchTerm;
          } catch { /* fallback below */ }

          // Fallback: extract 2-3 key words from the caption for image search
          if (!query) {
            const brandQueries = suggestedQueries[post.brand as keyof typeof suggestedQueries];
            if (brandQueries && brandQueries.length > 0) {
              const qIdx = (usedQueries[post.brand] ?? 0) % brandQueries.length;
              usedQueries[post.brand] = (usedQueries[post.brand] ?? 0) + 1;
              query = brandQueries[qIdx];
            } else {
              // Extract keywords from caption for relevant image search
              const words = post.caption.split(/\s+/).filter((w: string) => w.length > 4 && !w.startsWith('#') && !w.startsWith('@'));
              query = words.slice(0, 3).join(' ') || post.brand;
            }
          }

          const response = await fetch(`/api/images?source=all&q=${encodeURIComponent(query)}`);
          const data = await response.json();
          const hits: PixabayImage[] = data.images || data.hits || [];
          if (hits.length > 0) {
            // Use AI to pick the best image
            let img = hits[0];
            try {
              const pickRes = await fetch('/api/images/pick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption: post.caption, brand: post.brand, images: hits.slice(0, 10) }),
              });
              const pickData = await pickRes.json();
              if (typeof pickData.pickedIndex === 'number' && hits[pickData.pickedIndex]) {
                img = hits[pickData.pickedIndex];
              }
            } catch { /* use first image */ }

            // Skip already-used images
            const unused = hits.filter((h: PixabayImage) => !usedImageIds.has(h.id));
            if (unused.length > 0 && usedImageIds.has(img.id)) {
              img = unused[0];
            }
            usedImageIds.add(img.id);

            // Process image with overlay via /api/logo (returns raw image bytes)
            const cleanHook = sanitizeHook(post.hookText || '');
            const body: Record<string, unknown> = {
              imageUrl: img.largeImageURL,
              brand: post.brand,
              overlayText: cleanHook || undefined,
              textPosition: 'center',
              fontSize: 80,
              overlayStyle: 'editorial',
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
  }, [apiBrands]);

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
            className="h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
          >
            <option value="mixed">Mixed Content</option>
            <option value="promo">Promo</option>
            <option value="quote">Quote</option>
            <option value="tip">Tips / How-to</option>
            <option value="community">Community</option>
          </select>

          {/* Post count radio buttons */}
          <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg p-1 border border-zinc-700/50">
            {[5, 10, 15, 20].map(n => (
              <button
                key={n}
                onClick={() => { setBatchCount(n); batchCountRef.current = n; }}
                disabled={isGenerating}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  batchCount === n
                    ? 'bg-teal-600 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
                } disabled:opacity-50`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            onClick={() => void generateBatch()}
            disabled={isGenerating}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white shadow-lg transition-all disabled:opacity-60 flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating {posts.filter(p => p.imageUrl).length}/{posts.length}...
              </>
            ) : (
              `Generate ${batchCount} Posts`
            )}
          </button>
        </div>

        {posts.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-6 bg-zinc-700" />
            <div className="flex gap-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-zinc-700 text-white'
                    : 'text-white hover:text-white hover:bg-zinc-800/50'
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
                      ? 'bg-zinc-700 text-white'
                      : 'text-white hover:text-white hover:bg-zinc-800/50'
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
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
              >
                {isSchedulingAll ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Scheduling...
                  </span>
                ) : `Schedule All (${readyCount})`}
              </Button>
            )}
            <Separator orientation="vertical" className="h-6 bg-zinc-700" />
            <div className="flex gap-3 text-xs text-white">
              <span>{readyCount} ready</span>
              <span className="text-emerald-400">{scheduledCount} scheduled</span>
            </div>
          </>
        )}
      </div>

      {/* Post grid */}
      {posts.length === 0 && !isGenerating && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📋</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-1">Batch Gallery</h3>
          <p className="text-sm text-white max-w-md mx-auto">
            Generate pre-made posts for all your brands with images, captions, and hooks.
            Preview each one, then schedule the ones you like with a single click.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredPosts.map(post => (
          <Card
            key={post.id}
            className={`bg-zinc-900/80 border-zinc-800/60 overflow-hidden transition-all ${
              post.status === 'scheduled' ? 'opacity-60 border-emerald-800/40' : ''
            } ${expandedId === post.id ? 'ring-1 ring-teal-500/40' : ''}`}
          >
            {/* Image preview */}
            <div className="relative aspect-square bg-zinc-800/40">
              {post.processedImageUrl ? (
                <Image
                  src={post.processedImageUrl}
                  alt="Post preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : post.imageUrl ? (
                <div className="relative w-full h-full">
                  <Image
                    src={post.imageUrl}
                    alt="Post preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {/* Approximate overlay preview */}
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <p className="text-white text-center font-serif text-sm leading-snug drop-shadow-lg">
                      {post.hookText}
                    </p>
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="flex items-center justify-center h-full">
                  <span className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
                  No image
                </div>
              )}
              {/* Brand badge */}
              <Badge
                className="absolute top-2 left-2 text-[10px] bg-teal-500/80 text-white border-0"
              >
                {apiBrands.find(b => b.slug === post.brand)?.name || post.brand}
              </Badge>
              <Badge className="absolute top-2 right-2 bg-zinc-900/70 text-white border-0 text-[10px]">
                {post.contentType}
              </Badge>
              {post.status === 'scheduled' && (
                <div className="absolute inset-0 bg-emerald-900/30 flex items-center justify-center">
                  <span className="text-3xl">✓</span>
                </div>
              )}
            </div>

            <CardContent className="p-3 space-y-2">
              {/* Hook preview */}
              {post.hookText && (
                <p className="text-xs text-teal-300 font-semibold leading-snug line-clamp-1">
                  &ldquo;{post.hookText}&rdquo;
                </p>
              )}

              {/* Caption preview (truncated, cleaned) */}
              <p className="text-[11px] text-white leading-snug line-clamp-4">
                {post.caption.replace(/^(caption\s*:\s*)/i, '').replace(/,\s*hashtags:[\s\S]*/i, '').trim()}
              </p>

              {/* Scheduled time */}
              {post.scheduledLabel && (
                <p className="text-[10px] text-teal-400/70 flex items-center gap-1">
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
                      className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Schedule
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(expandedId === post.id ? null : post.id)}
                      className="h-7 text-xs bg-zinc-800 border-zinc-600 text-zinc-200 hover:bg-zinc-700 hover:text-white"
                    >
                      Preview
                    </Button>
                  </>
                )}
                {post.status === 'scheduling' && (
                  <div className="flex items-center gap-2 text-xs text-white">
                    <span className="w-3 h-3 border-2 border-zinc-600 border-t-teal-400 rounded-full animate-spin" />
                    Scheduling...
                  </div>
                )}
                {post.status === 'scheduled' && (
                  <span className="text-xs text-emerald-400 font-medium">Scheduled</span>
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
                      className="h-6 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-white"
                    >
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>

            {/* Expanded preview panel */}
            {expandedId === post.id && (
              <div className="border-t border-zinc-800/60 p-3 space-y-3 bg-zinc-950/50">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white uppercase tracking-wider font-medium">Caption</label>
                  <Textarea
                    value={post.caption}
                    onChange={(e) => updateCaption(post.id, e.target.value)}
                    className="bg-zinc-800/60 border-zinc-700/50 text-white text-xs min-h-[120px] resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white uppercase tracking-wider font-medium">Hook Text</label>
                  <p className="text-xs text-teal-400 bg-zinc-800/40 rounded px-2 py-1.5">
                    {post.hookText || '(auto-generated from caption)'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white uppercase tracking-wider font-medium">Hashtags</label>
                  <p className="text-[11px] text-blue-400 bg-zinc-800/40 rounded px-2 py-1.5">
                    {post.hashtags}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => schedulePost(post.id)}
                  disabled={post.status !== 'ready'}
                  className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
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
