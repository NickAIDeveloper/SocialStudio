import type { ImageResult, ImageSource } from './index';
import { searchImages as pixabaySearch } from '@/lib/pixabay';

export const pixabaySource: ImageSource = {
  async search(query: string, apiKey: string): Promise<ImageResult[]> {
    const data = await pixabaySearch(apiKey, query);
    return (data.hits || []).map(img => ({
      id: String(img.id),
      previewURL: img.previewURL,
      largeImageURL: img.largeImageURL,
      tags: img.tags,
      source: 'pixabay' as const,
    }));
  },
};
