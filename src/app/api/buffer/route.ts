import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationsAndChannels, createPost, createIdea, getSentPosts, getQueuedPosts, getSentPostsWithAnalytics } from '@/lib/buffer';
import { analyzeBufferPosts } from '@/lib/buffer-analyzer';
import { createInstagramImage, createInstagramImageWithText } from '@/lib/image-processing';
import type { TextPosition, OverlayStyle } from '@/lib/image-processing';
import { uploadImageToGitHub } from '@/lib/github-images';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    if (action === 'profiles' || action === 'channels') {
      const orgs = await getOrganizationsAndChannels();
      return NextResponse.json({ organizations: orgs });
    }

    if (action === 'posts') {
      const [sent, queued] = await Promise.all([getSentPosts(), getQueuedPosts()]);
      return NextResponse.json({ posts: sent, queued });
    }

    if (action === 'analyze') {
      const posts = await getSentPostsWithAnalytics();
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
    console.error('Buffer API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const hint = message.includes('401') || message.includes('403')
      ? 'Buffer API key is invalid or expired. Generate a new token at https://buffer.com/developers/apps'
      : message.includes('GraphQL')
        ? message
        : "Buffer's API is temporarily unavailable. Try again later.";
    return NextResponse.json({ error: hint, detail: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'createIdea') {
      const { organizationId, title, text } = body;
      if (!organizationId || !text) {
        return NextResponse.json({ error: 'organizationId and text are required' }, { status: 400 });
      }
      const result = await createIdea(organizationId, title || '', text);
      return NextResponse.json({ success: true, idea: result });
    }

    // Default: createPost (schedule to channel)
    const { channelId, organizationId, text, imageUrl, brand, logoPosition, overlayText, textPosition, fontSize, overlayStyle, scheduledAt, mode } = body;
    if (!channelId || !text) {
      return NextResponse.json({ error: 'channelId and text are required' }, { status: 400 });
    }

    // Process image and upload to GitHub for a public URL Buffer can fetch
    let imageUrls: string[] | undefined;
    if (imageUrl && brand) {
      try {
        let processedBuffer: Buffer;
        if (overlayText) {
          processedBuffer = await createInstagramImageWithText(
            imageUrl, brand, logoPosition || 'bottom-right',
            overlayText, (textPosition || 'center') as TextPosition,
            '#FFFFFF', fontSize || 64, (overlayStyle || 'editorial') as OverlayStyle
          );
        } else {
          processedBuffer = await createInstagramImage(imageUrl, brand, logoPosition || 'bottom-right');
        }
        const fileName = `buffer-${Date.now()}.jpg`;
        const upload = await uploadImageToGitHub(processedBuffer, fileName);
        imageUrls = [upload.url];
      } catch (imgErr) {
        console.error('Image processing failed, using original:', imgErr);
        imageUrls = [imageUrl];
      }
    } else if (imageUrl) {
      imageUrls = [imageUrl];
    }

    const result = await createPost({
      channelId,
      organizationId: organizationId || '',
      text,
      imageUrls,
      scheduledAt,
      mode: mode || 'addToQueue',
    });

    return NextResponse.json({ success: true, post: result });
  } catch (error) {
    console.error('Buffer create error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
