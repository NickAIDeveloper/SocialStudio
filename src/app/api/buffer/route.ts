import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationsAndChannels, createPost, createIdea, getSentPosts, getQueuedPosts, getSentPostsWithAnalytics } from '@/lib/buffer';
import { analyzeBufferPosts } from '@/lib/buffer-analyzer';
import { createInstagramImage, createInstagramImageWithText } from '@/lib/image-processing';
import type { TextPosition, OverlayStyle } from '@/lib/image-processing';
import { uploadImageToGitHub } from '@/lib/github-images';
import { assertAllowedImageUrl } from '@/lib/url-validation';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { db } from '@/lib/db';
import { linkedAccounts, brands } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function getBufferApiKey(): Promise<{ apiKey: string } | NextResponse> {
  const userId = await getUserId();

  const [bufferAccount] = await db
    .select()
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.userId, userId),
        eq(linkedAccounts.provider, 'buffer')
      )
    )
    .limit(1);

  if (!bufferAccount?.accessToken) {
    return NextResponse.json(
      { error: 'Buffer not connected. Go to Settings to link your account.' },
      { status: 403 }
    );
  }

  let apiKey: string;
  try {
    apiKey = decrypt(bufferAccount.accessToken);
  } catch {
    return NextResponse.json(
      { error: 'Your Buffer connection needs to be refreshed. Please disconnect and reconnect in Settings.' },
      { status: 400 }
    );
  }
  return { apiKey };
}

export async function GET(request: NextRequest) {
  try {
    const result = await getBufferApiKey();
    if (result instanceof NextResponse) return result;
    const { apiKey } = result;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'profiles' || action === 'channels') {
      const orgs = await getOrganizationsAndChannels(apiKey);
      return NextResponse.json({ organizations: orgs });
    }

    if (action === 'posts') {
      const [sent, queued] = await Promise.all([getSentPosts(apiKey), getQueuedPosts(apiKey)]);
      // Merge all posts into one array so the command center can filter by status
      const seen = new Set<string>();
      const allPosts = [...sent, ...queued].filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      return NextResponse.json({ posts: allPosts });
    }

    if (action === 'analyze') {
      const posts = await getSentPostsWithAnalytics(apiKey);
      const brandParam = searchParams.get('brand');
      const daysParam = parseInt(searchParams.get('days') || '90');

      let filtered = posts;
      if (brandParam === 'affectly' || brandParam === 'pacebrain') {
        filtered = posts.filter(p => p.brand === brandParam);
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysParam);
      filtered = filtered.filter(p => new Date(p.createdAt) >= cutoff);

      const analysis = analyzeBufferPosts(filtered);
      return NextResponse.json({ posts: filtered, analysis });
    }

    return NextResponse.json({ error: 'Invalid action. Use: profiles, channels, posts, analyze' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Buffer API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    let hint: string;
    let status = 502;
    if (message.includes('401') || message.includes('403')) {
      hint = 'Buffer API key is invalid or expired. Generate a new token at https://buffer.com/developers/apps';
      status = 401;
    } else if (message.toLowerCase().includes('rate') || message.toLowerCase().includes('too many') || message.includes('429')) {
      hint = 'Buffer rate limit exceeded. Please wait 15 minutes and try again.';
      status = 429;
    } else if (message.includes('GraphQL')) {
      hint = message;
    } else {
      hint = "Buffer's API is temporarily unavailable. Try again later.";
    }
    console.error('Buffer API error detail:', message);
    return NextResponse.json({ error: hint, detail: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await getBufferApiKey();
    if (result instanceof NextResponse) return result;
    const { apiKey } = result;

    const body = await request.json();
    const { action } = body;

    if (action === 'createIdea') {
      const { organizationId, title, text } = body;
      if (!organizationId || !text) {
        return NextResponse.json({ error: 'organizationId and text are required' }, { status: 400 });
      }
      const ideaResult = await createIdea(apiKey, organizationId, title || '', text);
      return NextResponse.json({ success: true, idea: ideaResult });
    }

    // Default: createPost (schedule to channel)
    const { channelId, organizationId, text, imageUrl, brand, brandId, overlayText, textPosition, fontSize, overlayStyle, scheduledAt, mode } = body;
    if (!channelId || !text) {
      return NextResponse.json({ error: 'channelId and text are required' }, { status: 400 });
    }

    // Look up the brand's custom logo URL if a brandId was provided
    const userId = await getUserId();
    let logoUrl: string | null = null;
    if (brandId) {
      const [brandRecord] = await db
        .select({ logoUrl: brands.logoUrl })
        .from(brands)
        .where(and(eq(brands.id, brandId as string), eq(brands.userId, userId)))
        .limit(1);
      logoUrl = brandRecord?.logoUrl ?? null;
    }

    // Process image and upload to GitHub for a public URL Buffer can fetch
    let imageUrls: string[] | undefined;
    if (imageUrl && brand) {
      assertAllowedImageUrl(imageUrl);
      try {
        let processedBuffer: Buffer;
        if (overlayText) {
          processedBuffer = await createInstagramImageWithText(
            imageUrl, brand,
            overlayText, (textPosition || 'center') as TextPosition,
            '#FFFFFF', fontSize || 64, (overlayStyle || 'editorial') as OverlayStyle,
            logoUrl
          );
        } else {
          processedBuffer = await createInstagramImage(imageUrl, brand, logoUrl);
        }
        const fileName = `buffer-${Date.now()}.jpg`;
        const upload = await uploadImageToGitHub(processedBuffer, fileName);
        imageUrls = [upload.url];
      } catch (imgErr) {
        console.error('Image processing failed:', imgErr instanceof Error ? imgErr.message : imgErr);
        return NextResponse.json(
          { error: 'Image processing failed. Please try again or use a different image.' },
          { status: 422 }
        );
      }
    } else if (imageUrl) {
      imageUrls = [imageUrl];
    }

    const postResult = await createPost(apiKey, {
      channelId,
      organizationId: organizationId || '',
      text,
      imageUrls,
      scheduledAt,
      mode: mode || 'addToQueue',
    });

    return NextResponse.json({ success: true, post: postResult });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Buffer create error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
