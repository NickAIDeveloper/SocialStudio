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
  { provider: 'gemini_images', label: 'AI Generate' },
] as const;

type SourceValue = 'pixabay' | 'unsplash' | 'pexels' | 'gemini' | 'all';

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
  // Search and generate failures used to reach console.error only, so a broken
  // provider key looked exactly like "no results". Its siblings (ask-panel,
  // candidate-strip) already render an error string; this now matches them.
  const [error, setError] = useState<string | null>(null);
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
          ['pixabay', 'unsplash', 'pexels', 'gemini_images'].includes(p)
        );
        setConnectedProviders(imageProviders);

        // Auto-select first connected stock source
        const firstStock = imageProviders.find((p) => p !== 'gemini_images');
        if (firstStock) {
          setSelectedSource(firstStock as SourceValue);
        } else if (imageProviders.includes('gemini_images')) {
          setSelectedSource('gemini');
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
    (p) => p !== 'gemini_images'
  ).length;
  const isAISource = selectedSource === 'gemini';

  const handleSearch = useCallback(async (query?: string) => {
    const q = query ?? searchQuery;
    if (!q.trim() || !selectedSource || isAISource) return;
    setIsLoading(true);
    setError(null);
    try {
      const url = `/api/images?source=${encodeURIComponent(selectedSource)}&q=${encodeURIComponent(q.trim())}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(`Could not search for images: ${err.error || `error ${response.status}`}`);
        return;
      }
      const data = await response.json();
      onImagesLoaded(data.images || []);
    } catch {
      setError('Could not search for images. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedSource, isAISource, onImagesLoaded]);

  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'gemini', prompt: aiPrompt.trim() }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(`Could not generate an image: ${err.error || `error ${response.status}`}`);
        return;
      }
      const data = await response.json();
      onImagesLoaded(data.images || []);
    } catch {
      setError('Could not generate an image. Check your connection and try again.');
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
    setError(null);
    const url = `/api/images?source=${encodeURIComponent(selectedSource)}&q=${encodeURIComponent(query.trim())}`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Search failed');
        return res.json();
      })
      .then((data) => onImagesLoaded(data.images || []))
      .catch(() => setError('Could not search for images. Try again in a moment.'))
      .finally(() => setIsLoading(false));
  }, [selectedSource, isAISource, onImagesLoaded]);

  useImperativeHandle(ref, () => ({ triggerSearch }), [triggerSearch]);

  if (loadingAccounts) {
    return (
      <div className="flex items-center gap-2 text-sm text-white">
        <div className="h-4 w-4 border-2 border-(--line-strong) border-t-(--violet-bright) rounded-full animate-spin" />
        Loading image sources...
      </div>
    );
  }

  if (connectedProviders.length === 0) {
    return (
      <div className="text-sm text-white">
        No image sources connected.{' '}
        <a href="/settings" className="text-(--violet-bright) hover:underline">
          Connect an image source in Settings
        </a>
      </div>
    );
  }

  const sourceOptions: Array<{ value: SourceValue; label: string }> = [];
  for (const { provider, label } of IMAGE_PROVIDERS) {
    if (!connectedProviders.includes(provider)) continue;
    const value: SourceValue = provider === 'gemini_images' ? 'gemini' : provider as SourceValue;
    sourceOptions.push({ value, label });
  }
  if (connectedStockCount >= 2) {
    sourceOptions.push({ value: 'all', label: 'All Stock Photos' });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-(--line) bg-(--surface-2)/60 px-3 py-2 text-sm text-rose-400">
          {error}
        </div>
      )}
      <Select
        value={selectedSource}
        onValueChange={(val) => setSelectedSource(val as SourceValue)}
      >
        <SelectTrigger className="bg-(--surface-2)/60 border-(--line-strong)/50 text-white h-9 text-sm w-full">
          <SelectValue placeholder="Select image source" />
        </SelectTrigger>
        <SelectContent className="bg-(--surface-2) border-(--line-strong)">
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
            className="bg-(--surface-2)/60 border-(--line-strong)/50 text-white text-sm min-h-[72px] resize-none"
          />
          <Button
            onClick={handleGenerate}
            disabled={isLoading || !aiPrompt.trim()}
            size="sm"
            className="bg-(--violet) hover:bg-(--violet-deep) text-white h-9 px-4 text-sm"
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
            className="bg-(--surface-2)/60 border-(--line-strong)/50 text-white h-9 text-sm"
          />
          <Button
            onClick={() => handleSearch()}
            disabled={isLoading || !searchQuery.trim()}
            size="sm"
            className="bg-(--violet) hover:bg-(--violet-deep) text-white h-9 px-4 shrink-0 text-sm"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </Button>
        </div>
      )}

      {connectedProviders.length < 2 && (
        <p className="text-xs text-white">
          <a href="/settings" className="text-(--violet-bright) hover:underline">
            Connect more sources in Settings
          </a>
        </p>
      )}
    </div>
  );
});
