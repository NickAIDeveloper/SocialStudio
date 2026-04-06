'use client';

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ImageResult } from '@/lib/image-sources';

const IMAGE_PROVIDERS = [
  { provider: 'pixabay', label: 'Pixabay' },
  { provider: 'unsplash', label: 'Unsplash' },
  { provider: 'pexels', label: 'Pexels' },
  { provider: 'openai_images', label: 'AI Generate' },
] as const;

type SourceValue = 'pixabay' | 'unsplash' | 'pexels' | 'openai' | 'all';

export interface ImageSourceSelectorHandle {
  triggerSearch: (query: string) => void;
}

interface ImageSourceSelectorProps {
  onImagesLoaded: (images: ImageResult[]) => void;
  brand: string;
}

export const ImageSourceSelector = forwardRef<ImageSourceSelectorHandle, ImageSourceSelectorProps>(function ImageSourceSelector({ onImagesLoaded, brand }, ref) {
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceValue | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function loadConnectedAccounts() {
      try {
        const response = await fetch('/api/linked-accounts');
        if (!response.ok) return;
        const data = await response.json();
        const providers: string[] = (data.data || []).map(
          (a: { provider: string }) => a.provider
        );
        const imageProviders = providers.filter((p) =>
          ['pixabay', 'unsplash', 'pexels', 'openai_images'].includes(p)
        );
        setConnectedProviders(imageProviders);

        // Auto-select first connected stock source
        const firstStock = imageProviders.find((p) => p !== 'openai_images');
        if (firstStock) {
          setSelectedSource(firstStock as SourceValue);
        } else if (imageProviders.includes('openai_images')) {
          setSelectedSource('openai');
        }
      } catch {
        // Failed to load accounts
      } finally {
        setLoadingAccounts(false);
      }
    }

    loadConnectedAccounts();
  }, []);

  const connectedStockCount = connectedProviders.filter(
    (p) => p !== 'openai_images'
  ).length;
  const isAISource = selectedSource === 'openai';

  const handleSearch = useCallback(async (query?: string) => {
    const q = query ?? searchQuery;
    if (!q.trim() || !selectedSource || isAISource) return;
    setIsLoading(true);
    try {
      const url = `/api/images?source=${encodeURIComponent(selectedSource)}&q=${encodeURIComponent(q.trim())}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Image search error:', err.error || response.status);
        return;
      }
      const data = await response.json();
      onImagesLoaded(data.images || []);
    } catch (error) {
      console.error('Image search failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedSource, isAISource, onImagesLoaded]);

  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'openai', prompt: aiPrompt.trim() }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Image generation error:', err.error || response.status);
        return;
      }
      const data = await response.json();
      onImagesLoaded(data.images || []);
    } catch (error) {
      console.error('Image generation failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [aiPrompt, onImagesLoaded]);

  // Expose search trigger for external suggested queries
  const triggerSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (isAISource) return;
    // Need to call handleSearch with the query directly since state won't update yet
    if (!selectedSource) return;
    setIsLoading(true);
    const url = `/api/images?source=${encodeURIComponent(selectedSource)}&q=${encodeURIComponent(query.trim())}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Search failed');
        return res.json();
      })
      .then((data) => onImagesLoaded(data.images || []))
      .catch((err) => console.error('Image search failed:', err))
      .finally(() => setIsLoading(false));
  }, [selectedSource, isAISource, onImagesLoaded]);

  useImperativeHandle(ref, () => ({ triggerSearch }), [triggerSearch]);

  if (loadingAccounts) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <div className="h-4 w-4 border-2 border-zinc-600 border-t-teal-400 rounded-full animate-spin" />
        Loading image sources...
      </div>
    );
  }

  if (connectedProviders.length === 0) {
    return (
      <div className="text-sm text-zinc-500">
        No image sources connected.{' '}
        <a href="/settings" className="text-teal-400 hover:underline">
          Connect an image source in Settings
        </a>
      </div>
    );
  }

  const sourceOptions: Array<{ value: SourceValue; label: string }> = [];
  for (const { provider, label } of IMAGE_PROVIDERS) {
    if (!connectedProviders.includes(provider)) continue;
    const value: SourceValue = provider === 'openai_images' ? 'openai' : provider as SourceValue;
    sourceOptions.push({ value, label });
  }
  if (connectedStockCount >= 2) {
    sourceOptions.push({ value: 'all', label: 'All Stock Photos' });
  }

  return (
    <div className="space-y-3">
      <Select
        value={selectedSource}
        onValueChange={(val) => setSelectedSource(val as SourceValue)}
      >
        <SelectTrigger className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm w-full">
          <SelectValue placeholder="Select image source" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border-zinc-700">
          {sourceOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-white">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isAISource ? (
        <div className="space-y-2">
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={`Describe the image to generate for ${brand}...`}
            className="bg-zinc-800/60 border-zinc-700/50 text-white text-sm min-h-[72px] resize-none"
          />
          <Button
            onClick={handleGenerate}
            disabled={isLoading || !aiPrompt.trim()}
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 text-sm"
          >
            {isLoading ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="Search for images..."
            className="bg-zinc-800/60 border-zinc-700/50 text-white h-9 text-sm"
          />
          <Button
            onClick={() => handleSearch()}
            disabled={isLoading || !searchQuery.trim()}
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 shrink-0 text-sm"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </Button>
        </div>
      )}

      {connectedProviders.length < 2 && (
        <p className="text-xs text-zinc-500">
          <a href="/settings" className="text-teal-400 hover:underline">
            Connect more sources in Settings
          </a>
        </p>
      )}
    </div>
  );
});
