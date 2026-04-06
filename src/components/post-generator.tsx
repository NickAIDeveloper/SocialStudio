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
import { suggestedQueries, brandCategories } from '@/lib/pixabay';
import type { PixabayImage } from '@/lib/pixabay';
import { generateCaption as getCaption, extractHookText } from '@/lib/caption-engine';

type Brand = 'affectly' | 'pacebrain';
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


function getHashtagsForPost(brand: Brand): string {
  const tags = hashtagSets[brand];
  const branded = tags.branded.slice(0, 1);
  const reach = [...tags.tier1_reach].sort(() => Math.random() - 0.5).slice(0, 2);
  const niche = [...tags.tier3_niche].sort(() => Math.random() - 0.5).slice(0, 2);
  return [...branded, ...reach, ...niche].join(' ');
}

// Get viral content patterns from competitor data for a given brand
function getViralPatterns(brand: Brand) {
  const brandCompetitors = competitors.filter((c) => c.brand === brand);
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
  if (!usedQueryIdx[brand]) usedQueryIdx[brand] = 0;
  const idx = usedQueryIdx[brand] % queries.length;
  usedQueryIdx[brand]++;
  return queries[idx];
}

export function PostGenerator() {
  // Core state
  const [brand, setBrand] = useState<Brand>('affectly');
  const [contentType, setContentType] = useState<ContentType>('promo');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');

  // Image search state
  const [imageQuery, setImageQuery] = useState('');
  const [images, setImages] = useState<PixabayImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<PixabayImage | null>(null);
  const [selectedCarouselImages, setSelectedCarouselImages] = useState<PixabayImage[]>([]);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [processedCarouselUrls, setProcessedCarouselUrls] = useState<(string | null)[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Carousel state
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Text overlay state
  const [overlayEnabled, setOverlayEnabled] = useState(false);
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

  // Saved posts
  const [savedPosts, setSavedPosts] = useState<GeneratedPost[]>([]);

  // Brands from DB (for persistence)
  const [apiBrands, setApiBrands] = useState<ApiBrand[]>([]);

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

  // Load Buffer channels on mount
  const profilesLoadedRef = useRef(false);
  useEffect(() => {
    if (profilesLoadedRef.current) return;
    profilesLoadedRef.current = true;
    fetch('/api/buffer?action=channels')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed'))))
      .then((data) => {
        const orgs: BufferOrganization[] = data.organizations || [];
        setBufferOrgs(orgs);
        const channels = orgs.flatMap(o => o.channels);
        const match = channels.find(c => c.name.toLowerCase().includes(brand));
        if (match) {
          setSelectedChannelId(match.id);
        } else if (channels.length > 0) {
          setSelectedChannelId(channels[0].id);
        }
      })
      .catch(() => {
        // Buffer not configured - that's fine
      });
  }, []);

  // Auto-switch Buffer channel when brand changes
  useEffect(() => {
    const channels = bufferOrgs.flatMap(o => o.channels);
    if (channels.length === 0) return;
    const match = channels.find(c => c.name.toLowerCase().includes(brand));
    if (match) setSelectedChannelId(match.id);
  }, [brand, bufferOrgs]);

  const generateCaption = useCallback(async () => {
    const newCaption = getCaption(brand, contentType);
    setCaption(newCaption);
    setHashtags(getHashtagsForPost(brand));

    // Auto-populate hook text from the generated caption
    const hook = extractHookText(newCaption);
    if (hook) {
      setOverlayText(hook);
      setOverlayEnabled(true);
    }

    // Search for a fresh image aligned to the brand
    const searchTerm = pickFreshQuery(brand);
    setImageQuery(searchTerm);
    try {
      const response = await fetch(`/api/pixabay?q=${encodeURIComponent(searchTerm)}&orientation=all&category=${brandCategories[brand] || ''}`);
      const data = await response.json();
      const hits: PixabayImage[] = data.hits || [];
      setImages(hits);
      if (hits.length > 0) {
        const randomImg = hits[Math.floor(Math.random() * Math.min(hits.length, 8))];
        setSelectedImage(randomImg);
        setSelectedCarouselImages([]);
        // Process inline to avoid dependency on processImage (declared later)
        setIsProcessing(true);
        try {
          const body: Record<string, unknown> = {
            imageUrl: randomImg.largeImageURL,
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
            setProcessedImageUrl(URL.createObjectURL(blob));
          }
        } finally {
          setIsProcessing(false);
        }
      }
    } catch {
      // Image search failed, user can manually search
    }
  }, [brand, contentType, textPosition, fontSize, overlayStyle]);

  const searchImages = useCallback(async () => {
    if (!imageQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/pixabay?q=${encodeURIComponent(imageQuery)}&orientation=all&category=${brandCategories[brand] || ''}`);
      const data = await response.json();
      setImages(data.hits || []);
    } catch (error) {
      console.error('Image search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [imageQuery]);

  const processImage = useCallback(async (image: PixabayImage) => {
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

  const handleImageSelect = useCallback(async (image: PixabayImage) => {
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
    setImageQuery('');
    setCarouselIndex(0);

    const randomBrand = pickRandom<Brand>(['affectly', 'pacebrain']);
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
    const newCaption = getCaption(randomBrand, randomType);
    setCaption(newCaption);
    setHashtags(getHashtagsForPost(randomBrand));

    const hook = extractHookText(newCaption);
    if (hook) setOverlayText(hook);

    // Auto-search for a topic-aligned image
    const searchTerm = pickFreshQuery(randomBrand);
    setImageQuery(searchTerm);
    try {
      const response = await fetch(`/api/pixabay?q=${encodeURIComponent(searchTerm)}&orientation=all&category=${brandCategories[brand] || ''}`);
      const data = await response.json();
      const hits: PixabayImage[] = data.hits || [];
      setImages(hits);
      if (hits.length > 0) {
        const randomImg = hits[Math.floor(Math.random() * Math.min(hits.length, 8))];
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
          }
        } catch {
          // Processing failed, preview still shows unprocessed image
        }
      }
    } catch {
      // Image search failed, user can manually search
    } finally {
      randomGeneratingRef.current = false;
    }
  }, []);

  // Auto-reprocess image when settings change (skipped during random generation)
  const reprocessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (randomGeneratingRef.current) return;
    const currentImage = isCarousel ? selectedCarouselImages[0] : selectedImage;
    if (!currentImage || !processedImageUrl) return;

    if (reprocessTimerRef.current) clearTimeout(reprocessTimerRef.current);
    reprocessTimerRef.current = setTimeout(async () => {
      const url = await processImage(currentImage);
      if (url) setProcessedImageUrl(url);
    }, 500);

    return () => {
      if (reprocessTimerRef.current) clearTimeout(reprocessTimerRef.current);
    };
  }, [brand, overlayEnabled, overlayText, textPosition, overlayStyle, fontSize]);

  const templates = contentTemplates[brand];
  const suggestions = suggestedQueries[brand];
  const times = optimalPostingTimes[brand];

  // Preview image for display
  const previewImageSrc = isCarousel
    ? processedCarouselUrls[carouselIndex] || selectedCarouselImages[carouselIndex]?.previewURL || null
    : processedImageUrl || selectedImage?.previewURL || null;

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
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Configuration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Brand</label>
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
                  setImageQuery('');
                  setCarouselIndex(0);
                }}>
                <SelectTrigger className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="affectly" className="text-white">Affectly</SelectItem>
                  <SelectItem value="pacebrain" className="text-white">PaceBrain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Content Type</label>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm">
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
            <p className="text-xs text-zinc-500">
              <span className="text-zinc-400 font-medium">{templates.find((t) => t.type === contentType)?.title}:</span>{' '}
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
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Caption</h3>
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
            className="bg-zinc-800/60 border-zinc-700/50 text-white min-h-[160px] resize-y text-sm leading-relaxed"
          />
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500">Hashtags</label>
            <Textarea
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="Generated with caption..."
              className="bg-zinc-800/60 border-zinc-700/50 text-white min-h-[60px] resize-y text-xs"
            />
          </div>
          {caption && (
            <p className="text-xs text-zinc-600 font-mono">
              {caption.length} chars &middot; {hashtags.split('#').filter(Boolean).length} tags
            </p>
          )}
        </div>

        {/* Text Overlay Controls */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Image Hook Text</h3>
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
                  className="bg-zinc-800/60 border-zinc-700/50 text-white min-h-[70px] resize-y text-sm pr-24"
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
                <label className="text-xs text-zinc-500">Overlay Style</label>
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
                      <p className={`text-xs font-medium ${overlayStyle === key ? 'text-teal-300' : 'text-zinc-300'}`}>{meta.label}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">{meta.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Position & Size */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-500">Position</label>
                  <Select value={textPosition} onValueChange={(v) => setTextPosition(v as TextPosition)}>
                    <SelectTrigger className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm">
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
          <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Find Images {isCarousel && <span className="text-teal-400 normal-case">(select up to 10 for carousel)</span>}
          </h3>
          <div className="flex gap-2">
            <Input
              value={imageQuery}
              onChange={(e) => setImageQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchImages()}
              placeholder="Search for images..."
              className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm"
            />
            <Button
              onClick={searchImages}
              disabled={isSearching}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 shrink-0 text-sm"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 6).map((query) => (
              <button
                key={query}
                onClick={() => setImageQuery(query)}
                className="text-xs px-2 py-1 rounded-md bg-zinc-800/60 text-zinc-500 hover:text-teal-300 hover:bg-teal-500/10 hover:scale-105 transition-all duration-200"
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
                      <p className="text-[10px] text-zinc-300 truncate">{img.tags}</p>
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
                <p className="text-xs text-zinc-500">{selectedCarouselImages.length} slides selected</p>
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
            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Preview</h3>

            <div className="rounded-xl overflow-hidden border border-zinc-800/50 bg-black">
              {/* IG Header */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div className={`w-7 h-7 rounded-full ${brand === 'affectly' ? 'bg-teal-600' : 'bg-blue-600'}`} />
                <span className="text-xs font-medium text-white">
                  {brand === 'affectly' ? 'affectly.app' : 'pacebrain.app'}
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
                    {/* Text overlay preview — shows style hint before processing */}
                    {overlayEnabled && overlayText && !(isCarousel ? processedCarouselUrls[carouselIndex] : processedImageUrl) && (
                      <div className={`absolute inset-x-0 ${TEXT_POSITION_CLASSES[textPosition]} p-4`}>
                        <div className={`rounded-lg p-3 ${
                          overlayStyle === 'bold-card'
                            ? brand === 'affectly' ? 'bg-teal-700/85' : 'bg-blue-700/85'
                            : overlayStyle === 'full-tint'
                              ? brand === 'affectly' ? 'bg-teal-800/75' : 'bg-blue-800/75'
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
              <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Schedule to Buffer</h3>

              {allChannels.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-500">Channel (auto selected for {brand})</label>
                    <Select value={selectedChannelId} onValueChange={(v) => { if (v) setSelectedChannelId(v); }}>
                      <SelectTrigger className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm">
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
                    <label className="text-xs text-zinc-500">Pick a recommended time</label>
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
                                : 'bg-zinc-800/60 text-zinc-400 hover:text-teal-400 hover:bg-teal-500/10'
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
                    <label className="text-xs text-zinc-500">Or pick a custom date/time</label>
                    <Input
                      type="datetime-local"
                      value={scheduleDateTime}
                      onChange={(e) => setScheduleDateTime(e.target.value)}
                      className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm"
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
                <p className="text-xs text-zinc-600">
                  Buffer not connected. Set your Buffer API key to enable scheduling.
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
