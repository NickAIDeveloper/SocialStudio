import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { db } from '@/lib/db';
import { linkedAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ImageResult, ImageSourceType } from '@/lib/image-sources';
import { pixabaySource } from '@/lib/image-sources/pixabay';
import { unsplashSource } from '@/lib/image-sources/unsplash';
import { pexelsSource } from '@/lib/image-sources/pexels';
import { openaiSource } from '@/lib/image-sources/openai-images';

const STOCK_SOURCES: Array<{ type: ImageSourceType; provider: string }> = [
  { type: 'pixabay', provider: 'pixabay' },
  { type: 'unsplash', provider: 'unsplash' },
  { type: 'pexels', provider: 'pexels' },
];

const SOURCE_MAP: Record<string, { provider: string; source: { search(query: string, apiKey: string): Promise<ImageResult[]> } }> = {
  pixabay: { provider: 'pixabay', source: pixabaySource },
  unsplash: { provider: 'unsplash', source: unsplashSource },
  pexels: { provider: 'pexels', source: pexelsSource },
};

async function getDecryptedKey(userId: string, provider: string): Promise<string | null> {
  const [account] = await db
    .select()
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.provider, provider)
      )
    )
    .limit(1);

  if (!account?.accessToken) return null;

  try {
    return decrypt(account.accessToken);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const query = searchParams.get('q');

    if (!source) {
      return NextResponse.json(
        { error: 'Query parameter "source" is required' },
        { status: 400 }
      );
    }

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    // Search across all connected stock sources
    if (source === 'all') {
      const results: ImageResult[] = [];
      const searches: Promise<void>[] = [];

      for (const { provider, type } of STOCK_SOURCES) {
        const apiKey = await getDecryptedKey(userId, provider);
        if (!apiKey) continue;

        const sourceModule = SOURCE_MAP[type];
        if (!sourceModule) continue;

        searches.push(
          sourceModule.source
            .search(query, apiKey)
            .then((imgs) => {
              results.push(...imgs);
            })
            .catch((err) => {
              console.error(`${type} search failed:`, err);
            })
        );
      }

      await Promise.all(searches);
      return NextResponse.json({ images: results });
    }

    // Single source search
    const mapping = SOURCE_MAP[source];
    if (!mapping) {
      return NextResponse.json(
        { error: `Invalid source "${source}". Must be pixabay, unsplash, pexels, or all.` },
        { status: 400 }
      );
    }

    const apiKey = await getDecryptedKey(userId, mapping.provider);
    if (!apiKey) {
      return NextResponse.json(
        { error: `${source} not connected. Go to Settings to link your account.` },
        { status: 403 }
      );
    }

    const images = await mapping.source.search(query, apiKey);
    return NextResponse.json({ images });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Image search error:', error);
    return NextResponse.json(
      { error: 'Failed to search images' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { source, prompt } = body;

    if (source !== 'openai') {
      return NextResponse.json(
        { error: 'POST only supports source "openai". Use GET for stock photo search.' },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'A non-empty "prompt" is required for AI generation.' },
        { status: 400 }
      );
    }

    const apiKey = await getDecryptedKey(userId, 'openai_images');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI Images not connected. Go to Settings to link your API key.' },
        { status: 403 }
      );
    }

    const images = await openaiSource.generate(prompt.trim(), apiKey);
    return NextResponse.json({ images });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Image generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
}
