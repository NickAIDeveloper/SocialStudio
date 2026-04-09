import type { ImageResult, ImageGenerationSource } from './index';

const GEMINI_MODEL = 'gemini-2.5-flash-preview-image-generation';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const geminiSource: ImageGenerationSource = {
  async generate(prompt: string, apiKey: string): Promise<ImageResult[]> {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: '1:1',
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini image generation error: ${msg}`);
    }

    const data = await response.json();
    const candidates = data.candidates || [];
    const images: ImageResult[] = [];

    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          const dataUri = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          images.push({
            id: `gemini-${Date.now()}-${images.length}`,
            previewURL: dataUri,
            largeImageURL: dataUri,
            tags: prompt.slice(0, 100),
            source: 'gemini',
          });
        }
      }
    }

    if (images.length === 0) {
      throw new Error('Gemini returned no images. Try a different prompt.');
    }

    return images;
  },
};
