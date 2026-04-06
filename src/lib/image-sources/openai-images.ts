import type { ImageResult, ImageGenerationSource } from './index';

export const openaiSource: ImageGenerationSource = {
  async generate(prompt: string, apiKey: string): Promise<ImageResult[]> {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url',
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Images error: ${err?.error?.message || response.status}`);
    }
    const data = await response.json();
    return (data.data || []).map((img: { url: string }, i: number) => ({
      id: `openai-${Date.now()}-${i}`,
      previewURL: img.url,
      largeImageURL: img.url,
      tags: prompt.slice(0, 100),
      source: 'openai' as const,
    }));
  },
};
