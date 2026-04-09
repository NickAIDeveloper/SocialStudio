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
import { geminiSource } from '@/lib/image-sources/gemini-images';

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

async function getDecryptedKey(userId: string, provider: string): Promise<{ key: string | null; reason: 'not_connected' | 'decrypt_failed' | 'success' }> {
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

  if (!account?.accessToken) {
    return { key: null, reason: 'not_connected' };
  }

  try {
    return { key: decrypt(account.accessToken), reason: 'success' };
  } catch (err) {
    console.error(`Failed to decrypt ${provider} key:`, err instanceof Error ? err.message : err);
    return { key: null, reason: 'decrypt_failed' };
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
      const searches: Array<{ type: ImageSourceType; promise: Promise<ImageResult[]> }> = [];

      for (const { provider, type } of STOCK_SOURCES) {
        const result = await getDecryptedKey(userId, provider);
        if (!result.key) continue;
        const apiKey = result.key;

        const sourceModule = SOURCE_MAP[type];
        if (!sourceModule) continue;

        searches.push({ type, promise: sourceModule.source.search(query, apiKey) });
      }

      const settled = await Promise.allSettled(searches.map((s) => s.promise));
      const images: ImageResult[] = [];
      const failedSources: string[] = [];

      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          images.push(...result.value);
        } else {
          const failedType = searches[index].type;
          console.error(`Image search failed for ${failedType}:`, result.reason instanceof Error ? result.reason.message : result.reason);
          failedSources.push(failedType);
        }
      });

      return NextResponse.json({ images, failedSources });
    }

    // Single source search
    const mapping = SOURCE_MAP[source];
    if (!mapping) {
      return NextResponse.json(
        { error: `Invalid source "${source}". Must be pixabay, unsplash, pexels, or all.` },
        { status: 400 }
      );
    }

    const result = await getDecryptedKey(userId, mapping.provider);
    if (!result.key) {
      const message = result.reason === 'not_connected'
        ? `${source} is not connected. Go to Settings to link your account.`
        : `${source} API key could not be read. Please disconnect and reconnect in Settings.`;
      const status = result.reason === 'not_connected' ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    const images = await mapping.source.search(query, result.key);
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

    if (source !== 'gemini') {
      return NextResponse.json(
        { error: 'POST only supports source "gemini". Use GET for stock photo search.' },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'A non-empty "prompt" is required for AI generation.' },
        { status: 400 }
      );
    }

    const result = await getDecryptedKey(userId, 'gemini_images');
    if (!result.key) {
      const message = result.reason === 'not_connected'
        ? 'Gemini AI Images is not connected. Go to Settings to link your API key.'
        : 'Gemini API key could not be read. Please disconnect and reconnect in Settings.';
      const status = result.reason === 'not_connected' ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    const images = await geminiSource.generate(prompt.trim(), result.key);
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
