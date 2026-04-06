import type { ImageResult, ImageSource } from './index';

export const pexelsSource: ImageSource = {
  async search(query: string, apiKey: string): Promise<ImageResult[]> {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) throw new Error(`Pexels API error: ${response.status}`);
    const data = await response.json();
    return (data.photos || []).map((img: { id: number; src: Record<string, string>; alt?: string }) => ({
      id: String(img.id),
      previewURL: img.src.medium,
      largeImageURL: img.src.large2x,
      tags: img.alt || '',
      source: 'pexels' as const,
    }));
  },
};
