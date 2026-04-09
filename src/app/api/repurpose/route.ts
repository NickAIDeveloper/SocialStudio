import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

function extractTextFromHtml(html: string): string {
  // Remove script and style tags with content
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

export async function POST(request: NextRequest) {
  try {
    await getUserId();
    const body = await request.json();
    const { url, brandSlug } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'no_ai_key', message: 'AI not configured' }, { status: 503 });
    }

    // Validate URL — prevent SSRF
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'Only HTTP/HTTPS URLs are allowed' }, { status: 400 });
      }
      // Block private/internal IPs
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
          hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.') ||
          hostname === '169.254.169.254' || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
        return NextResponse.json({ error: 'Internal URLs are not allowed' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Fetch and extract text content from the URL
    let content = '';
    try {
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
      });

      if (!pageRes.ok) {
        return NextResponse.json(
          { error: `Could not fetch URL (HTTP ${pageRes.status})` },
          { status: 400 },
        );
      }

      const html = await pageRes.text();
      content = extractTextFromHtml(html);
    } catch {
      return NextResponse.json(
        { error: 'Failed to fetch the URL. Make sure it is publicly accessible.' },
        { status: 400 },
      );
    }

    if (content.length < 100) {
      return NextResponse.json(
        { error: 'Could not extract enough text from this URL. Try a different page.' },
        { status: 400 },
      );
    }

    // Limit content to ~3000 chars to fit in context
    const truncatedContent = content.slice(0, 3000);
    const brandContext = brandSlug ? ` for the brand "${brandSlug}"` : '';

    const prompt = `Turn this blog/article content into 5 unique Instagram posts${brandContext}. Each post should take a different angle or hook from the content.

BLOG CONTENT:
${truncatedContent}

REQUIREMENTS:
- Each post should have a scroll-stopping hook
- Use line breaks for readability
- Include a call-to-action
- Generate relevant hashtags for each
- Each post should feel unique, not repetitive

Return ONLY valid JSON array with exactly 5 objects:
[{"caption":"full caption text","hashtags":"#tag1 #tag2 #tag3","hookText":"short 5-8 word hook for overlay"}]`;

    const response = await cerebrasChatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.9, maxTokens: 2000 },
    );

    // Clean markdown code fences if present
    const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let posts;
    // Try extracting a JSON array first
    const jsonMatch = cleanedResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        posts = JSON.parse(jsonMatch[0]);
      } catch {
        // Array parse failed, try individual objects below
      }
    }

    // Fallback: extract individual JSON objects
    if (!posts) {
      try {
        const objectMatches = cleanedResponse.match(/\{[\s\S]*?\}/g);
        if (objectMatches && objectMatches.length > 0) {
          posts = objectMatches
            .map((m) => { try { return JSON.parse(m); } catch { return null; } })
            .filter(Boolean);
        }
      } catch {
        // Final fallback below
      }
    }

    if (!posts || (Array.isArray(posts) && posts.length === 0)) {
      return NextResponse.json({ error: 'AI returned invalid format. Please try again.' }, { status: 502 });
    }

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: 'AI returned invalid format' }, { status: 500 });
    }

    // Normalize each post
    const normalizedPosts = posts.slice(0, 5).map((post: { caption?: string; hashtags?: string; hookText?: string }) => ({
      caption: String(post.caption ?? ''),
      hashtags: String(post.hashtags ?? ''),
      hookText: String(post.hookText ?? ''),
    }));

    return NextResponse.json({
      success: true,
      posts: normalizedPosts,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Repurpose] Error:', error);
    return NextResponse.json({ error: 'Failed to repurpose content' }, { status: 500 });
  }
}
