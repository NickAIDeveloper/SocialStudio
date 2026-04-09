import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

function extractShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    await getUserId();
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!url.includes('instagram.com/')) {
      return NextResponse.json({ error: 'Only Instagram post URLs are supported' }, { status: 400 });
    }

    const shortcode = extractShortcode(url);
    if (!shortcode) {
      return NextResponse.json(
        { error: 'Invalid Instagram post URL. Use a link like https://instagram.com/p/ABC123/' },
        { status: 400 },
      );
    }

    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'no_ai_key', message: 'AI not configured' }, { status: 503 });
    }

    // Fetch the post page HTML to extract og metadata
    let caption = '';
    let imageUrl = '';
    let likes = 0;
    let comments = 0;

    try {
      const pageRes = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (pageRes.ok) {
        const html = await pageRes.text();

        // Extract og:description (contains likes, comments, caption)
        const descMatch = html.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]*)"/i)
          ?? html.match(/content="([^"]*)"[^>]*property="og:description"/i);
        if (descMatch) {
          const desc = descMatch[1];
          // Format: "X likes, Y comments - Username on Instagram: "caption""
          const likesMatch = desc.match(/([\d,.]+)\s*likes?/i);
          const commentsMatch = desc.match(/([\d,.]+)\s*comments?/i);
          if (likesMatch) likes = parseInt(likesMatch[1].replace(/[,.\s]/g, ''), 10) || 0;
          if (commentsMatch) comments = parseInt(commentsMatch[1].replace(/[,.\s]/g, ''), 10) || 0;

          // Extract caption after the colon and quote
          const captionMatch = desc.match(/:\s*["\u201C](.+)/);
          if (captionMatch) {
            caption = captionMatch[1].replace(/["\u201D]$/, '');
          } else {
            caption = desc;
          }
        }

        // Extract og:image
        const imgMatch = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]*)"/i)
          ?? html.match(/content="([^"]*)"[^>]*property="og:image"/i);
        if (imgMatch) {
          imageUrl = imgMatch[1];
        }
      }
    } catch {
      // Continue without scraped data — AI will still analyze the URL
    }

    const analysisPrompt = `Analyze this Instagram post. Here's the data:

URL: ${url}
Caption: ${caption || '(could not extract)'}
Likes: ${likes}
Comments: ${comments}

Provide a detailed analysis covering:
1. What makes this post work (or not work)?
2. What hook technique is used in the opening line?
3. What CTA (call-to-action) strategy is used?
4. What can we learn and replicate?
5. Engagement rate assessment based on likes/comments ratio
6. Suggestions for improvement

Be specific and actionable. Format as clear paragraphs.`;

    const analysis = await cerebrasChatCompletion(
      [{ role: 'user', content: analysisPrompt }],
      { temperature: 0.7, maxTokens: 1500 },
    );

    return NextResponse.json({
      success: true,
      likes,
      comments,
      caption,
      imageUrl,
      analysis,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Analyze Post] Error:', error);
    return NextResponse.json({ error: 'Failed to analyze post' }, { status: 500 });
  }
}
