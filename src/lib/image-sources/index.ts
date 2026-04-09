export interface ImageResult {
  id: string;
  previewURL: string;
  largeImageURL: string;
  tags: string;
  source: 'pixabay' | 'unsplash' | 'pexels' | 'gemini';
}

export interface ImageSource {
  search(query: string, apiKey: string): Promise<ImageResult[]>;
}

export interface ImageGenerationSource {
  generate(prompt: string, apiKey: string): Promise<ImageResult[]>;
}

export type ImageSourceType = 'pixabay' | 'unsplash' | 'pexels' | 'gemini';

export function isGenerationSource(type: ImageSourceType): boolean {
  return type === 'gemini';
}
