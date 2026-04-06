import type { ImageResult, ImageSource } from './index';

export const unsplashSource: ImageSource = {
  async search(query: string, apiKey: string): Promise<ImageResult[]> {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=20&orientation=squarish`;
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Unsplash API error: ${response.status}`);
    const data = await response.json();
    return (data.results || []).map((img: { id: string; urls: Record<string, string>; tags?: Array<{ title: string }> }) => ({
      id: String(img.id),
      previewURL: img.urls.small,
      largeImageURL: img.urls.regular,
      tags: (img.tags || []).map(t => t.title).join(', '),
      source: 'unsplash' as const,
    }));
  },
};
