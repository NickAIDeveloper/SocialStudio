'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  contentTemplates,
  hashtagSets,
  optimalPostingTimes,
  competitors,
} from '@/data/competitor-insights';
import { suggestedQueries } from '@/lib/pixabay';
import type { ImageResult } from '@/lib/image-sources';
import { ImageSourceSelector } from '@/components/image-source-selector';
import type { ImageSourceSelectorHandle } from '@/components/image-source-selector';
import { generateCaption as getCaption, extractHookText, sanitizeCaption, sanitizeHook, sanitizeHashtags } from '@/lib/caption-engine';

type Brand = string;
type ContentType = 'quote' | 'tip' | 'carousel' | 'community' | 'promo';
type TextPosition = 'top' | 'center' | 'bottom';
type OverlayStyle = 'editorial' | 'bold-card' | 'gradient-bar' | 'full-tint';

interface GeneratedPost {
  dbId?: string; // Database UUID after persistence
  caption: string;
  hashtags: string;
  imageUrl: string | null;
  processedImageUrl: string | null;
  brand: Brand;
  contentType: ContentType;
  scheduledTime: string | null;
}

interface ApiBrand {
  id: string;
  name: string;
  slug: string;
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

const TEXT_POSITION_CLASSES: Record<TextPosition, string> = {
  top: 'top-0',
  center: 'top-1/2 -translate-y-1/2',
  bottom: 'bottom-0',
};

const OVERLAY_STYLE_META: Record<OverlayStyle, { label: string; desc: string }> = {
  editorial: { label: 'Editorial', desc: 'Calm-style: dark tint + serif text + accent line' },
  'bold-card': { label: 'Bold Card', desc: 'Headspace-style: brand gradient card overlay' },
  'gradient-bar': { label: 'Gradient', desc: 'Strava-style: strong gradient + bold text' },
  'full-tint': { label: 'Brand Tint', desc: 'Wysa-style: full brand color wash + serif' },
};


// Persist used image IDs to sessionStorage
function saveUsedImageIds(ids: Set<string>) {
  try { sessionStorage.setItem('gv_usedImageIds', JSON.stringify([...ids])); } catch { /* ignore */ }
}

// Strip dashes, em-dashes, en-dashes, and hyphens used as separators
function stripDashes(text: string): string {
  return text
    .replace(/\s*[—–-]{1,3}\s*/g, ' ')  // em-dash, en-dash, hyphen used as separator
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getHashtagsForPost(brand: Brand): string {
  const tags = hashtagSets[brand as keyof typeof hashtagSets];
  if (!tags) return '';
  const branded = tags.branded.slice(0, 1);
  const reach = [...tags.tier1_reach].sort(() => Math.random() - 0.5).slice(0, 2);
  const niche = [...tags.tier3_niche].sort(() => Math.random() - 0.5).slice(0, 2);
  return [...branded, ...reach, ...niche].join('\n');
}

// Get viral content patterns from competitor data for a given brand
function getViralPatterns(brand: Brand) {
  const brandCompetitors = competitors.filter((c) => c.brand === brand);
  if (brandCompetitors.length === 0) {
    return { viralTypes: [] as string[], winningFormulas: ['Create engaging content for your audience'], imageKeywords: ['social media'] };
  }
  const viralTypes = brandCompetitors.flatMap((c) =>
    c.topContentTypes
      .filter((t) => t.engagementLevel === 'viral' || t.engagementLevel === 'high')
      .map((t) => t.type)
  );
  const winningFormulas = brandCompetitors.flatMap((c) => c.winningFormulas);
  const imageKeywords = brandCompetitors.flatMap((c) => c.visualStyle.imageryType);
  return { viralTypes, winningFormulas, imageKeywords };
}

// Pick a random item from an array
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Cycle through image queries without repeating until all are used
const usedQueryIdx: Record<string, number> = {};
function pickFreshQuery(brand: string): string {
  const queries = suggestedQueries[brand as keyof typeof suggestedQueries];
  if (!queries || queries.length === 0) return 'social media content';
  if (!usedQueryIdx[brand]) usedQueryIdx[brand] = 0;
  const idx = usedQueryIdx[brand] % queries.length;
  usedQueryIdx[brand]++;
  return queries[idx];
}

export function PostGenerator() {
  // Core state
  const [brand, setBrand] = useState<Brand>('');
  const [contentType, setContentType] = useState<ContentType>('promo');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');

  // Pre-fill from URL params is done below after overlay state is declared

  // Image search state
  const [images, setImages] = useState<ImageResult[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageResult | null>(null);
  const [selectedCarouselImages, setSelectedCarouselImages] = useState<ImageResult[]>([]);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [processedCarouselUrls, setProcessedCarouselUrls] = useState<(string | null)[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const imageSelectorRef = useRef<ImageSourceSelectorHandle>(null);

  // Carousel state
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Text overlay state
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayText, setOverlayText] = useState('');
  const [textPosition, setTextPosition] = useState<TextPosition>('center');
  const fontSize = 80;
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('editorial');

  // Buffer scheduling state
  const [bufferOrgs, setBufferOrgs] = useState<BufferOrganization[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [bufferLoading, setBufferLoading] = useState(false);
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [bufferSuccess, setBufferSuccess] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  // Competitor insight tip (client-only to avoid hydration mismatch)
  const [competitorTip, setCompetitorTip] = useState('');

  // Track used image IDs to avoid repeating images across generations (persisted in sessionStorage)
  const usedImageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('gv_usedImageIds');
      if (stored) usedImageIdsRef.current = new Set<string>(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Saved posts
  const [savedPosts, setSavedPosts] = useState<GeneratedPost[]>([]);

  // Brands from DB (for persistence)
  const [apiBrands, setApiBrands] = useState<ApiBrand[]>([]);

  // Listen for "Use This" from content repurposer (sibling component)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.caption) setCaption(detail.caption);
      if (detail?.hashtags) setHashtags(detail.hashtags);
      if (detail?.hookText) {
        setOverlayText(detail.hookText);
        setOverlayEnabled(true);
      }
    };
    window.addEventListener('repurpose-use-post', handler);
    return () => window.removeEventListener('repurpose-use-post', handler);
  }, []);

  // Fetch brands + saved drafts on mount
  const brandsLoadedRef = useRef(false);
  useEffect(() => {
    if (brandsLoadedRef.current) return;
    brandsLoadedRef.current = true;

    // Fetch brands first, then use them to map draft posts
    fetch('/api/brands')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
      .then(data => {
        const fetchedBrands: ApiBrand[] = data.brands || [];
        setApiBrands(fetchedBrands);
        if (fetchedBrands.length > 0 && !brand) {
          setBrand(fetchedBrands[0].slug);
        }

        // Now fetch saved draft posts
        return fetch('/api/posts?status=draft&limit=20')
          .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed')))
          .then(postsData => {
            if (postsData.posts && Array.isArray(postsData.posts)) {
              const brandMap = new Map(fetchedBrands.map(b => [b.id, b.slug]));
              const drafts: GeneratedPost[] = postsData.posts.map((p: Record<string, unknown>) => ({
                dbId: p.id as string,
                caption: (p.caption as string) || '',
                hashtags: (p.hashtags as string) || '',
                imageUrl: (p.sourceImageUrl as string) || null,
                processedImageUrl: (p.processedImageUrl as string) || null,
                brand: (brandMap.get(p.brandId as string) || 'affectly') as Brand,
                contentType: ((p.contentType as string) || 'promo') as ContentType,
                scheduledTime: null,
              }));
              setSavedPosts(drafts);
            }
          });
      })
      .catch(() => {});
  }, []);

  const isCarousel = contentType === 'carousel';
  const activeImages = isCarousel ? selectedCarouselImages : (selectedImage ? [selectedImage] : []);
  const hasCompletePost = caption.trim().length > 0 && activeImages.length > 0;
  const allChannels = bufferOrgs.flatMap(org => org.channels);

  // Load Buffer channels on mount (cached to avoid rate limits)
  const [bufferLoadError, setBufferLoadError] = useState<string | null>(null);
  const loadBufferChannels = useCallback(async (bypassCache = false) => {
    setBufferLoadError(null);
    try {
      const { cachedBufferFetch, invalidateBufferCache } = await import('@/lib/buffer-cache');
      if (bypassCache) invalidateBufferCache();
      const data = await cachedBufferFetch<{ organizations: BufferOrganization[] } | { error: string }>('/api/buffer?action=channels');
      if (!data) {
        setBufferLoadError('Could not connect to Buffer. Check Settings.');
        return;
      }
      if ('error' in data) {
        setBufferLoadError(data.error);
        return;
      }
      const orgs: BufferOrganization[] = data.organizations || [];
      setBufferOrgs(orgs);
      const channels = orgs.flatMap(o => o.channels);
      const match = channels.find(c => c.name.toLowerCase().includes(brand));
      if (match) {
        setSelectedChannelId(match.id);
      } else if (channels.length > 0) {
        setSelectedChannelId(channels[0].id);
      }
    } catch {
      setBufferLoadError('Network error loading Buffer channels');
    }
  }, [brand]);

  const profilesLoadedRef = useRef(false);
  useEffect(() => {
    if (profilesLoadedRef.current) return;
    profilesLoadedRef.current = true;
    void loadBufferChannels();
  }, []);

  // Auto-switch Buffer channel when brand changes
  useEffect(() => {
    const channels = bufferOrgs.flatMap(o => o.channels);
    if (channels.length === 0) return;
    const match = channels.find(c => c.name.toLowerCase().includes(brand));
    if (match) setSelectedChannelId(match.id);
  }, [brand, bufferOrgs]);

  const generateCaption = useCallback(async () => {
    randomGeneratingRef.current = true; // Suppress reprocess timer during generation
    // Try AI generation first
    let newCaption = '';
    let newHashtags = '';
    let hook = '';

    try {
      const aiRes = await fetch('/api/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandSlug: brand, contentType, variationSeed: Date.now() % 10000 }),
      });
      const aiData = await aiRes.json();

      if (aiData.success && aiData.caption) {
        newCaption = sanitizeCaption(aiData.caption);
        newHashtags = sanitizeHashtags(aiData.hashtags || '');
        hook = sanitizeHook(aiData.hookText || '');
      }
    } catch {
      // AI failed, fall through to pool
    }

    // Fallback to pre-written caption pool (only works for known brands)
    if (!newCaption) {
      try {
        newCaption = sanitizeCaption(getCaption(brand as 'affectly' | 'pacebrain', contentType));
      } catch {
        newCaption = `Check out our latest ${contentType} content!`;
      }
      newHashtags = getHashtagsForPost(brand);
      hook = sanitizeHook(extractHookText(newCaption));
    }

    newCaption = stripDashes(newCaption);
    hook = stripDashes(hook);

    setCaption(newCaption);
    setHashtags(newHashtags);

    if (hook) {
      setOverlayText(hook);
      setOverlayEnabled(true);
    }

    // Use AI to pick the perfect search term based on caption
    let searchTerm = pickFreshQuery(brand);
    try {
      const pickRes = await fetch('/api/images/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: newCaption, brand, contentType }),
      });
      const pickData = await pickRes.json();
      if (pickData.searchTerm) searchTerm = pickData.searchTerm;
    } catch { /* fall back to default search term */ }

    // Trigger the ImageSourceSelector search so the UI stays in sync
    if (imageSelectorRef.current) {
      imageSelectorRef.current.triggerSearch(searchTerm);
    }

    try {
      const response = await fetch(`/api/images?source=all&q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      const hits: ImageResult[] = data.images || [];
      setImages(hits);
      if (hits.length > 0) {
        // Filter out previously used images, reset if all are used
        let available = hits.filter(img => !usedImageIdsRef.current.has(String(img.id)));
        if (available.length === 0) {
          usedImageIdsRef.current.clear();
          available = hits;
        }

        // Use AI to pick the best image from available results
        let bestImg = available[0];
        try {
          const pickRes = await fetch('/api/images/pick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caption: newCaption, brand, images: available.slice(0, 10) }),
          });
          const pickData = await pickRes.json();
          if (typeof pickData.pickedIndex === 'number' && available[pickData.pickedIndex]) {
            bestImg = available[pickData.pickedIndex];
          }
        } catch { /* fall back to first available image */ }

        if (isCarousel) {
          // Auto-pick 3 unique images for carousel
          const carouselPicks: ImageResult[] = [];
          const pool = [...available];
          const pickCount = Math.min(3, pool.length);
          for (let i = 0; i < pickCount; i++) {
            const picked = pool.shift()!;
            usedImageIdsRef.current.add(String(picked.id));
            carouselPicks.push(picked);
          }
          setSelectedCarouselImages(carouselPicks);
          setSelectedImage(null);
        } else {
          usedImageIdsRef.current.add(String(bestImg.id));
          setSelectedImage(bestImg);
          setSelectedCarouselImages([]);
        }
        saveUsedImageIds(usedImageIdsRef.current);

        // Process the lead image for preview
        const leadImage = isCarousel ? available[0] : bestImg;
        setIsProcessing(true);
        try {
          const body: Record<string, unknown> = {
            imageUrl: leadImage.largeImageURL,
            brand,
          };
          if (hook) {
            body.overlayText = hook;
            body.textPosition = textPosition;
            body.fontSize = fontSize;
            body.overlayStyle = overlayStyle;
          }
          const resp = await fetch('/api/logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (resp.ok) {
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            setProcessedImageUrl(url);
            if (isCarousel) setProcessedCarouselUrls([url]);
            // Mark this overlay state as already rendered so reprocess timer skips it
            generationTimestampRef.current = Date.now();
          }
        } finally {
          setIsProcessing(false);
        }
      }
    } catch {
      // Image search failed, user can manually search
    } finally {
      randomGeneratingRef.current = false;
    }
  }, [brand, contentType, textPosition, fontSize, overlayStyle]);

  const processImage = useCallback(async (image: ImageResult) => {
    setIsProcessing(true);
    try {
      const body: Record<string, unknown> = {
        imageUrl: image.largeImageURL,
        brand,
      };
      if (overlayEnabled && overlayText.trim()) {
        body.overlayText = overlayText;
        body.textPosition = textPosition;
        body.fontSize = fontSize;
        body.overlayStyle = overlayStyle;
      }
      const response = await fetch('/api/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
    } catch (error) {
      console.error('Image processing failed:', error);
    } finally {
      setIsProcessing(false);
    }
    return null;
  }, [brand, overlayEnabled, overlayText, textPosition, overlayStyle, fontSize]);

  const handleImageSelect = useCallback(async (image: ImageResult) => {
    if (isCarousel) {
      setProcessedCarouselUrls([]);
      setProcessedImageUrl(null);
      setSelectedCarouselImages((prev) => {
        const exists = prev.find((img) => img.id === image.id);
        if (exists) {
          return prev.filter((img) => img.id !== image.id);
        }
        if (prev.length >= 10) return prev;
        return [...prev, image];
      });
    } else {
      setSelectedImage(image);
      const url = await processImage(image);
      setProcessedImageUrl(url);
    }
  }, [isCarousel, processImage]);

  const handleProcessCarousel = useCallback(async () => {
    if (selectedCarouselImages.length === 0) return;
    setIsProcessing(true);
    const urls = await Promise.all(
      selectedCarouselImages.map(img => processImage(img))
    );
    setProcessedCarouselUrls(urls);
    // Set first for backward compat with single-image preview paths
    setProcessedImageUrl(urls[0]);
    setIsProcessing(false);
  }, [selectedCarouselImages, processImage]);

  const savePost = useCallback(async () => {
    const sourceImageUrl = selectedImage?.largeImageURL || selectedCarouselImages[0]?.largeImageURL || null;
    const post: GeneratedPost = {
      caption,
      hashtags,
      imageUrl: sourceImageUrl,
      processedImageUrl,
      brand,
      contentType,
      scheduledTime: null,
    };

    // Persist to database
    const matchedBrand = apiBrands.find(
      b => b.slug === brand || b.name.toLowerCase() === brand,
    );
    if (matchedBrand) {
      try {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: matchedBrand.id,
            caption,
            hashtags: hashtags || undefined,
            hookText: overlayText || undefined,
            contentType,
            overlayStyle: overlayEnabled ? overlayStyle : undefined,
            textPosition: overlayEnabled ? textPosition : undefined,
            fontSize: overlayEnabled ? fontSize : undefined,
            sourceImageUrl: sourceImageUrl || undefined,
            processedImageUrl: processedImageUrl || undefined,
            status: 'draft',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          post.dbId = data.post?.id;
        }
      } catch {
        // DB save failed — still keep in local state
      }
    }

    setSavedPosts((prev) => [...prev, post]);
  }, [caption, hashtags, selectedImage, selectedCarouselImages, processedImageUrl, brand, contentType, apiBrands, overlayText, overlayEnabled, overlayStyle, textPosition, fontSize]);

  const loadSavedPost = useCallback((post: GeneratedPost) => {
    setBrand(post.brand);
    setContentType(post.contentType);
    setCaption(post.caption);
    setHashtags(post.hashtags);
    setProcessedImageUrl(post.processedImageUrl);
  }, []);

  const scheduleToBuffer = useCallback(async (immediate: boolean) => {
    if (!selectedChannelId || !caption.trim()) return;
    setBufferLoading(true);
    setBufferError(null);
    setBufferSuccess(false);
    try {
      const body: Record<string, unknown> = {
        channelId: selectedChannelId,
        text: `${caption}\n\n${hashtags}`.trim(),
        mode: immediate ? 'addToQueue' : 'customScheduled',
      };
      // Send image processing params to API — it will process server-side and pass a public URL to Buffer
      const sourceImageUrl = selectedImage?.largeImageURL || selectedCarouselImages[0]?.largeImageURL;
      if (sourceImageUrl) {
        body.imageUrl = sourceImageUrl;
        body.brand = brand;
        if (overlayEnabled && overlayText.trim()) {
          body.overlayText = overlayText;
          body.textPosition = textPosition;
          body.fontSize = fontSize;
          body.overlayStyle = overlayStyle;
        }
      }
      if (!immediate && scheduleDateTime) {
        body.scheduledAt = new Date(scheduleDateTime).toISOString();
      }
      const response = await fetch('/api/buffer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to schedule post');
      }
      setBufferSuccess(true);
      setTimeout(() => setBufferSuccess(false), 3000);

      // Update status to 'scheduled' in DB if we have a matching saved post
      const matchingPost = savedPosts.find(
        p => p.dbId && p.caption === caption && p.brand === brand,
      );
      if (matchingPost?.dbId) {
        fetch('/api/posts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: matchingPost.dbId, status: 'scheduled' }),
        }).catch(() => {});
      }
    } catch (err) {
      setBufferError(err instanceof Error ? err.message : 'Scheduling failed');
    } finally {
      setBufferLoading(false);
    }
  }, [selectedChannelId, caption, hashtags, selectedImage, selectedCarouselImages, scheduleDateTime, savedPosts, brand]);

  // Update competitor tip when brand changes
  useEffect(() => {
    setCompetitorTip(pickRandom(getViralPatterns(brand).winningFormulas));
  }, [brand]);

  // Flag to suppress auto-reprocess while Random Generator is running
  const randomGeneratingRef = useRef(false);

  // Random Generator — randomize options weighted toward viral patterns
  const randomGenerate = useCallback(async () => {
    randomGeneratingRef.current = true;

    // Clear all old state first so nothing is stale
    setSelectedImage(null);
    setSelectedCarouselImages([]);
    setProcessedImageUrl(null);
    setImages([]);
    setCarouselIndex(0);

    const brandSlugs = apiBrands.length > 0 ? apiBrands.map(b => b.slug) : ['default'];
    const randomBrand = pickRandom(brandSlugs);
    const { viralTypes } = getViralPatterns(randomBrand);

    // Weight toward viral content types, fall back to all types
    const validTypes: ContentType[] = ['quote', 'tip', 'carousel', 'community', 'promo'];
    const viralValid = viralTypes.filter((t): t is ContentType => validTypes.includes(t as ContentType));
    const randomType = viralValid.length > 0 ? pickRandom(viralValid) : pickRandom(validTypes);

    const randomOverlayStyle: OverlayStyle = 'editorial';
    const randomTextPos: TextPosition = 'center';
    const randomFontSize = 80;

    setBrand(randomBrand);
    setContentType(randomType);
    setOverlayStyle(randomOverlayStyle);
    setTextPosition(randomTextPos);
    setOverlayEnabled(true);

    // Generate caption
    let newCaption = '';
    try {
      newCaption = sanitizeCaption(getCaption(randomBrand as 'affectly' | 'pacebrain', randomType));
    } catch {
      newCaption = `Check out our latest ${randomType} content!`;
    }
    setCaption(newCaption);
    setHashtags(getHashtagsForPost(randomBrand));

    const hook = sanitizeHook(extractHookText(newCaption));
    if (hook) setOverlayText(hook);

    // Auto-search for a topic-aligned image via the ImageSourceSelector
    const searchTerm = pickFreshQuery(randomBrand);
    if (imageSelectorRef.current) {
      imageSelectorRef.current.triggerSearch(searchTerm);
    }
    try {
      const response = await fetch(`/api/images?source=all&q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      const hits: ImageResult[] = data.images || [];
      setImages(hits);
      if (hits.length > 0) {
        // Filter out previously used images, reset if all are used
        let available = hits.filter(img => !usedImageIdsRef.current.has(String(img.id)));
        if (available.length === 0) {
          usedImageIdsRef.current.clear();
          available = hits;
        }
        const isRandomCarousel = randomType === 'carousel';
        if (isRandomCarousel) {
          // Auto-pick 3 unique images for carousel
          const carouselPicks: ImageResult[] = [];
          const pool = [...available];
          const pickCount = Math.min(3, pool.length);
          for (let i = 0; i < pickCount; i++) {
            const idx = Math.floor(Math.random() * Math.min(pool.length, 8));
            const picked = pool.splice(idx, 1)[0];
            usedImageIdsRef.current.add(String(picked.id));
            carouselPicks.push(picked);
          }
          saveUsedImageIds(usedImageIdsRef.current);
          setSelectedCarouselImages(carouselPicks);
          setSelectedImage(null);

          // Process ALL carousel images with the same overlay style
          try {
            const carouselUrls: (string | null)[] = [];
            for (const slide of carouselPicks) {
              const body: Record<string, unknown> = {
                imageUrl: slide.largeImageURL,
                brand: randomBrand,
              };
              if (hook) {
                body.overlayText = hook;
                body.textPosition = randomTextPos;
                body.fontSize = randomFontSize;
                body.overlayStyle = randomOverlayStyle;
              }
              const resp = await fetch('/api/logo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
              if (resp.ok) {
                const blob = await resp.blob();
                carouselUrls.push(URL.createObjectURL(blob));
              } else {
                carouselUrls.push(null);
              }
            }
            setProcessedCarouselUrls(carouselUrls);
            setProcessedImageUrl(carouselUrls[0]);
            generationTimestampRef.current = Date.now();
          } catch { /* preview still shows unprocessed */ }
        } else {
          const randomImg = available[Math.floor(Math.random() * Math.min(available.length, 8))];
          usedImageIdsRef.current.add(String(randomImg.id));
          saveUsedImageIds(usedImageIdsRef.current);
          setSelectedImage(randomImg);
          setSelectedCarouselImages([]);

          // Process image directly with local values (no setTimeout, no stale state)
          const body: Record<string, unknown> = {
            imageUrl: randomImg.largeImageURL,
            brand: randomBrand,
          };
          if (hook) {
            body.overlayText = hook;
            body.textPosition = randomTextPos;
            body.fontSize = randomFontSize;
            body.overlayStyle = randomOverlayStyle;
          }
          try {
            const resp = await fetch('/api/logo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (resp.ok) {
              const blob = await resp.blob();
              setProcessedImageUrl(URL.createObjectURL(blob));
              generationTimestampRef.current = Date.now();
            }
          } catch {
            // Processing failed, preview still shows unprocessed image
          }
        }
      }
    } catch {
      // Image search failed, user can manually search
    } finally {
      randomGeneratingRef.current = false;
    }
  }, [apiBrands]);

  // Auto-reprocess image ONLY when user manually changes overlay settings
  // Uses a generation timestamp to skip reprocessing for 3 seconds after any generation
  const generationTimestampRef = useRef(0);
  const reprocessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip during active generation
    if (randomGeneratingRef.current) return;
    // Skip for 3 seconds after generation completed (prevents overlay stripping)
    if (Date.now() - generationTimestampRef.current < 3000) return;

    const currentImage = isCarousel ? selectedCarouselImages[0] : selectedImage;
    if (!currentImage || !processedImageUrl) return;

    if (reprocessTimerRef.current) clearTimeout(reprocessTimerRef.current);
    reprocessTimerRef.current = setTimeout(async () => {
      if (randomGeneratingRef.current) return;
      if (Date.now() - generationTimestampRef.current < 3000) return;
      const url = await processImage(currentImage);
      if (url) setProcessedImageUrl(url);
    }, 1000);

    return () => {
      if (reprocessTimerRef.current) clearTimeout(reprocessTimerRef.current);
    };
  }, [brand, overlayEnabled, overlayText, textPosition, overlayStyle, fontSize]);

  const templates = contentTemplates[brand as keyof typeof contentTemplates] || contentTemplates[Object.keys(contentTemplates)[0] as keyof typeof contentTemplates];
  const suggestions = suggestedQueries[brand as keyof typeof suggestedQueries] || [];
  const times = optimalPostingTimes[brand as keyof typeof optimalPostingTimes] || optimalPostingTimes[Object.keys(optimalPostingTimes)[0] as keyof typeof optimalPostingTimes];

  // Preview image for display
  const previewImageSrc = isCarousel
    ? processedCarouselUrls[carouselIndex] || selectedCarouselImages[carouselIndex]?.previewURL || null
    : processedImageUrl || selectedImage?.previewURL || null;

  if (apiBrands.length === 0 && brandsLoadedRef.current) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">&#9997;</span>
        </div>
        <h3 className="text-lg font-medium text-white mb-1">No brands yet</h3>
        <p className="text-sm text-white max-w-md mx-auto mb-4">
          Create a brand in Settings before generating posts.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left Column - Controls */}
      <div className="w-full lg:w-[60%] space-y-5">

        {/* Random Generator */}
        <Button
          onClick={randomGenerate}
          className="w-full h-11 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white active:scale-[0.98] transition-all duration-200"
        >
          Random Generator — Viral Post
        </Button>

        {/* Brand, Content Type, Logo Position */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-white">Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-white">Brand</label>
              <Select value={brand} onValueChange={(v) => {
                  const newBrand = v as Brand;
                  setBrand(newBrand);
                  setCaption('');
                  setHashtags('');
                  setOverlayText('');
                  setOverlayEnabled(false);
                  setSelectedImage(null);
                  setSelectedCarouselImages([]);
                  setProcessedImageUrl(null);
                  setProcessedCarouselUrls([]);
                  setImages([]);
                                setCarouselIndex(0);
                }}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-900 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {apiBrands.map((b) => (
                    <SelectItem key={b.id} value={b.slug} className="text-white">{b.name}</SelectItem>
                  ))}
                  {apiBrands.length === 0 && (
                    <SelectItem value="" disabled className="text-zinc-400">No brands yet</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-white">Content Type</label>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-900 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="quote" className="text-white">Quote</SelectItem>
                  <SelectItem value="tip" className="text-white">Tips / How-to</SelectItem>
                  <SelectItem value="carousel" className="text-white">Carousel</SelectItem>
                  <SelectItem value="community" className="text-white">Community</SelectItem>
                  <SelectItem value="promo" className="text-white">Promo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Template hint */}
          <div className="bg-zinc-800/40 rounded-lg px-3 py-2">
            <p className="text-xs text-white">
              <span className="text-white font-medium">{templates.find((t) => t.type === contentType)?.title}:</span>{' '}
              {templates.find((t) => t.type === contentType)?.captionStructure}
            </p>
          </div>
          {/* Competitor insight tip */}
          {competitorTip && (
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3 py-2">
              <p className="text-xs text-emerald-400/80">
                <span className="font-medium">Competitor Insight:</span>{' '}
                {competitorTip}
              </p>
            </div>
          )}
        </div>

        {/* Caption */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wider text-white">Caption</h3>
            <Button
              onClick={generateCaption}
              size="sm"
              className="h-8 text-xs font-medium text-white active:scale-[0.98] transition-all duration-200 bg-teal-600 hover:bg-teal-700"
            >
              Generate
            </Button>
          </div>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Click Generate or write your own caption..."
            className="bg-white border-zinc-300 text-zinc-900 min-h-[160px] resize-y text-sm leading-relaxed"
          />
          <div className="space-y-1.5">
            <label className="text-xs text-white">Hashtags</label>
            <Textarea
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="Generated with caption..."
              className="bg-white border-zinc-300 text-zinc-900 min-h-[60px] resize-y text-xs"
            />
          </div>
          {caption && (
            <p className="text-xs text-zinc-600 font-mono">
              {caption.length} chars &middot; {hashtags.split('\n').filter(t => t.trim().startsWith('#')).length} tags
            </p>
          )}
        </div>

        {/* Text Overlay Controls */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-xs font-medium uppercase tracking-wider text-white">Image Hook Text</h3>
              <p className="text-[10px] text-zinc-600">Attention-grabbing text overlaid on your image</p>
            </div>
            <button
              onClick={() => setOverlayEnabled((prev) => !prev)}
              className={`relative w-10 h-5 rounded-full transition-colors ${overlayEnabled ? 'bg-teal-600' : 'bg-zinc-700'}`}
              type="button"
              aria-label="Toggle text overlay"
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${overlayEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          {overlayEnabled && (
            <div className="space-y-4">
              {/* Hook text input */}
              <div className="relative">
                <Textarea
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  placeholder="Hook text extracted from your caption..."
                  className="bg-white border-zinc-300 text-zinc-900 min-h-[70px] resize-y text-sm pr-24"
                />
                <button
                  type="button"
                  onClick={() => {
                    const hook = extractHookText(caption);
                    if (hook) setOverlayText(hook);
                  }}
                  disabled={!caption.trim()}
                  className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded bg-teal-500/15 border border-teal-500/30 text-teal-400 hover:bg-teal-500/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Extract Hook
                </button>
              </div>
              {overlayText && (
                <p className="text-[10px] text-zinc-600 font-mono">{overlayText.length}/60 chars</p>
              )}

              {/* Style selector — visual cards */}
              <div className="space-y-2">
                <label className="text-xs text-white">Overlay Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(OVERLAY_STYLE_META) as [OverlayStyle, { label: string; desc: string }][]).map(([key, meta]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOverlayStyle(key)}
                      className={`text-left p-2.5 rounded-lg border transition-all duration-200 ${
                        overlayStyle === key
                          ? 'border-teal-500/60 bg-teal-500/10'
                          : 'border-zinc-800/50 bg-zinc-800/30 hover:border-zinc-600'
                      }`}
                    >
                      <p className={`text-xs font-medium ${overlayStyle === key ? 'text-teal-300' : 'text-white'}`}>{meta.label}</p>
                      <p className="text-[10px] text-white mt-0.5 leading-snug">{meta.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Position & Size */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-white">Position</label>
                  <Select value={textPosition} onValueChange={(v) => setTextPosition(v as TextPosition)}>
                    <SelectTrigger className="bg-white border-zinc-300 text-zinc-900 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="top" className="text-white">Top</SelectItem>
                      <SelectItem value="center" className="text-white">Center</SelectItem>
                      <SelectItem value="bottom" className="text-white">Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Image Search */}
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-white">
            Find Images {isCarousel && <span className="text-teal-400 normal-case">(select up to 10 for carousel)</span>}
          </h3>
          <ImageSourceSelector
            ref={imageSelectorRef}
            onImagesLoaded={setImages}
            brand={brand}
          />

          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((query) => (
              <button
                key={query}
                onClick={() => imageSelectorRef.current?.triggerSearch(query)}
                className="text-xs px-2 py-1 rounded-md bg-zinc-800/60 text-white hover:text-teal-300 hover:bg-teal-500/10 hover:scale-105 transition-all duration-200"
                type="button"
              >
                {query}
              </button>
            ))}
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((img) => {
                const isSelected = isCarousel
                  ? selectedCarouselImages.some((s) => s.id === img.id)
                  : selectedImage?.id === img.id;
                const carouselNum = isCarousel
                  ? selectedCarouselImages.findIndex((s) => s.id === img.id) + 1
                  : 0;
                return (
                  <button
                    key={img.id}
                    onClick={() => handleImageSelect(img)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] ${
                      isSelected
                        ? 'border-teal-500 ring-2 ring-teal-500/30'
                        : 'border-zinc-800/50 hover:border-zinc-600'
                    }`}
                    type="button"
                  >
                    <Image src={img.previewURL} alt={img.tags} fill className="object-cover" sizes="150px" />
                    {isCarousel && carouselNum > 0 && (
                      <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">{carouselNum}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[10px] text-white truncate">{img.tags}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected carousel thumbnails */}
          {isCarousel && selectedCarouselImages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-white">{selectedCarouselImages.length} slides selected</p>
                <Button
                  onClick={handleProcessCarousel}
                  disabled={isProcessing}
                  size="sm"
                  className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {isProcessing ? 'Processing...' : 'Process Images'}
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedCarouselImages.map((img, i) => (
                  <div key={img.id} className="relative w-14 h-14 rounded-md overflow-hidden shrink-0 border border-zinc-700">
                    <Image src={img.previewURL} alt={img.tags} fill className="object-cover" sizes="56px" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center">
                      <span className="text-[9px] font-bold text-white">{i + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Preview */}
      <div className="w-full lg:w-[40%]">
        <div className="lg:sticky lg:top-20 space-y-5 bg-zinc-900/30 rounded-2xl p-4 -m-4">

          {/* Post Preview */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-white">Preview</h3>

            <div className="rounded-xl overflow-hidden border border-zinc-800/50 bg-black">
              {/* IG Header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="w-7 h-7 rounded-full bg-teal-600" />
                <span className="text-xs font-medium text-white">
                  {apiBrands.find(b => b.slug === brand)?.name || brand || 'Your Brand'}
                </span>
              </div>

              {/* Image */}
              <div className="relative aspect-square bg-zinc-900">
                {previewImageSrc ? (
                  <>
                    <Image
                      src={previewImageSrc || ''}
                      alt="Post preview"
                      fill
                      className="object-cover"
                      unoptimized={!!(isCarousel ? processedCarouselUrls[carouselIndex] : processedImageUrl)}
                      sizes="400px"
                    />
                    {/* Text overlay preview — always shown when overlay is enabled */}
                    {overlayEnabled && overlayText && (
                      <div className={`absolute inset-x-0 ${TEXT_POSITION_CLASSES[textPosition]} p-4`}>
                        <div className={`rounded-lg p-3 ${
                          overlayStyle === 'bold-card'
                            ? 'bg-teal-700/85'
                            : overlayStyle === 'full-tint'
                              ? 'bg-teal-800/75'
                              : 'bg-black/50 backdrop-blur-sm'
                        }`}>
                          <p
                            className={`text-center leading-tight ${
                              overlayStyle === 'editorial' || overlayStyle === 'full-tint'
                                ? 'font-serif'
                                : 'font-bold'
                            }`}
                            style={{ fontSize: `${fontSize / 4}px`, color: '#ffffff' }}
                          >
                            {overlayText}
                          </p>
                        </div>
                      </div>
                    )}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-zinc-600 text-xs">Select an image</p>
                  </div>
                )}

                {/* Carousel navigation */}
                {isCarousel && selectedCarouselImages.length > 1 && (
                  <>
                    <button
                      onClick={() => setCarouselIndex((prev) => Math.max(0, prev - 1))}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                      type="button"
                      disabled={carouselIndex === 0}
                    >
                      <span className="text-xs">&larr;</span>
                    </button>
                    <button
                      onClick={() => setCarouselIndex((prev) => Math.min(selectedCarouselImages.length - 1, prev + 1))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                      type="button"
                      disabled={carouselIndex === selectedCarouselImages.length - 1}
                    >
                      <span className="text-xs">&rarr;</span>
                    </button>
                    {/* Dot indicators */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {selectedCarouselImages.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCarouselIndex(i)}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${i === carouselIndex ? 'bg-white' : 'bg-white/40'}`}
                          type="button"
                          aria-label={`Go to slide ${i + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* IG Action bar */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-4">
                  <span className="text-white text-lg cursor-pointer hover:opacity-60 transition-opacity">&#9825;</span>
                  <svg className="w-5 h-5 text-white cursor-pointer hover:opacity-60 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" /></svg>
                  <svg className="w-5 h-5 text-white cursor-pointer hover:opacity-60 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                </div>
                <svg className="w-5 h-5 text-white cursor-pointer hover:opacity-60 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
              </div>

              {/* Caption preview */}
              <div className="px-3 pb-3 space-y-1.5">
                <p className="text-xs text-white whitespace-pre-line leading-relaxed line-clamp-6">
                  {caption || 'Caption will appear here...'}
                </p>
                {hashtags && (
                  <p className="text-[11px] text-blue-400">{hashtags}</p>
                )}
              </div>
            </div>

            {/* Actions removed — scheduling only */}
          </div>

          {/* Buffer Scheduling */}
          {hasCompletePost && (
            <div className="glass-card p-5 space-y-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-white">Schedule to Buffer</h3>

              {allChannels.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-white">Channel (auto selected for {brand})</label>
                    <Select value={selectedChannelId} onValueChange={(v) => { if (v) setSelectedChannelId(v); }}>
                      <SelectTrigger className="bg-white border-zinc-300 text-zinc-900 h-9 text-sm">
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        {allChannels.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-white">
                            {c.name} ({c.service})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Recommended time slots — one click to pick */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-white">Pick a recommended time</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(() => {
                        const slots: { label: string; dateStr: string }[] = [];
                        const allTimes = [...times.weekday, ...times.weekend];
                        const uniqueTimes = [...new Set(allTimes)];
                        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const bestDaySet = new Set(times.bestDays.map((d: string) => d.toLowerCase()));

                        // Generate next 7 days of recommended slots
                        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
                          const target = new Date();
                          target.setDate(target.getDate() + dayOffset);
                          const dow = target.getDay();
                          const isWeekend = dow === 0 || dow === 6;
                          const dayTimes = isWeekend ? times.weekend : times.weekday;
                          const dayNameFull = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dow];
                          const isBestDay = bestDaySet.has(dayNameFull);

                          for (const t of dayTimes) {
                            const [time, period] = t.split(' ');
                            const [hours, minutes] = time.split(':').map(Number);
                            let h = hours;
                            if (period === 'PM' && h !== 12) h += 12;
                            if (period === 'AM' && h === 12) h = 0;
                            const slot = new Date(target);
                            slot.setHours(h, minutes, 0, 0);
                            if (slot <= new Date()) continue; // Skip past times
                            const pad = (n: number) => String(n).padStart(2, '0');
                            const dateStr = `${slot.getFullYear()}-${pad(slot.getMonth() + 1)}-${pad(slot.getDate())}T${pad(slot.getHours())}:${pad(slot.getMinutes())}`;
                            const label = `${dayNames[dow]} ${monthNames[slot.getMonth()]} ${slot.getDate()} at ${t}${isBestDay ? ' ★' : ''}`;
                            slots.push({ label, dateStr });
                          }
                        }
                        return slots.slice(0, 10).map(slot => (
                          <button
                            key={slot.dateStr}
                            type="button"
                            onClick={() => setScheduleDateTime(slot.dateStr)}
                            className={`text-left text-xs px-3 py-2 rounded-lg transition-colors ${
                              scheduleDateTime === slot.dateStr
                                ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/30'
                                : 'bg-zinc-800/60 text-white hover:text-teal-400 hover:bg-teal-500/10'
                            }`}
                          >
                            {slot.label}
                          </button>
                        ));
                      })()}
                    </div>
                    <p className="text-[10px] text-zinc-600">★ = best day from competitor analysis</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-white">Or pick a custom date/time</label>
                    <Input
                      type="datetime-local"
                      value={scheduleDateTime}
                      onChange={(e) => setScheduleDateTime(e.target.value)}
                      className="bg-white border-zinc-300 text-zinc-900 h-9 text-sm"
                    />
                  </div>

                  <Button
                    onClick={() => scheduleToBuffer(false)}
                    disabled={bufferLoading || !scheduleDateTime}
                    size="sm"
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs h-9 disabled:opacity-40"
                  >
                    {bufferLoading ? 'Scheduling...' : scheduleDateTime ? `Schedule for ${new Date(scheduleDateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Select a date/time to schedule'}
                  </Button>

                  {bufferSuccess && (
                    <p className="text-xs text-emerald-400">Post scheduled successfully.</p>
                  )}
                  {bufferError && (
                    <p className="text-xs text-red-400">{bufferError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {bufferLoadError ? (
                    <p className="text-xs text-red-400">{bufferLoadError}</p>
                  ) : (
                    <p className="text-xs text-zinc-400">Loading Buffer channels...</p>
                  )}
                  <button
                    onClick={() => void loadBufferChannels(true)}
                    className="text-xs text-teal-400 hover:text-teal-300 underline"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
