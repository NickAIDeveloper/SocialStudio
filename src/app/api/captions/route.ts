import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedAccounts, scrapedPosts, insightsCache } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { brandSlug, contentType } = body;

    if (!brandSlug || !contentType) {
      return NextResponse.json({ error: 'brandSlug and contentType required' }, { status: 400 });
    }

    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'no_ai_key', message: 'AI not configured' }, { status: 503 });
    }

    // Get brand info
    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.userId, userId), eq(brands.slug, brandSlug)))
      .limit(1);

    const brandName = brand?.name ?? brandSlug;
    const handle = brand?.instagramHandle ? `@${brand.instagramHandle}` : '';

    // Pull competitor intel for context
    let competitorContext = '';
    try {
      const conditions = [
        eq(scrapedAccounts.userId, userId),
        eq(scrapedAccounts.isCompetitor, true),
      ];
      if (brand) conditions.push(eq(scrapedAccounts.brandId, brand.id));

      const competitorAccounts = await db
        .select()
        .from(scrapedAccounts)
        .where(and(...conditions))
        .limit(5);

      if (competitorAccounts.length > 0) {
        // Get top performing competitor posts
        const topPosts = [];
        for (const comp of competitorAccounts.slice(0, 3)) {
          const posts = await db
            .select()
            .from(scrapedPosts)
            .where(and(eq(scrapedPosts.userId, userId), eq(scrapedPosts.accountId, comp.id)))
            .orderBy(desc(scrapedPosts.likes))
            .limit(2);

          for (const p of posts) {
            if (p.likes > 0) {
              topPosts.push({
                handle: comp.handle,
                likes: p.likes,
                comments: p.comments,
                caption: (p.caption ?? '').slice(0, 150),
                hashtags: p.hashtags ?? '',
              });
            }
          }
        }

        if (topPosts.length > 0) {
          competitorContext = `\n\nCOMPETITOR INTELLIGENCE — learn from what works for competitors:\n${JSON.stringify(topPosts.slice(0, 5), null, 1)}`;
        }
      }
    } catch (err) {
      console.error('[Captions] Non-critical error:', err instanceof Error ? err.message : err);
    }

    // Pull own top posts for context
    let ownPostContext = '';
    try {
      const ownAccount = brand?.instagramHandle
        ? await db.select().from(scrapedAccounts).where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.handle, brand.instagramHandle))).limit(1)
        : [];

      if (ownAccount.length > 0) {
        const topOwn = await db
          .select()
          .from(scrapedPosts)
          .where(and(eq(scrapedPosts.userId, userId), eq(scrapedPosts.accountId, ownAccount[0].id)))
          .orderBy(desc(scrapedPosts.likes))
          .limit(3);

        if (topOwn.length > 0 && topOwn[0].likes > 0) {
          ownPostContext = `\n\nYOUR TOP PERFORMING POSTS — replicate what works:\n${topOwn.map(p => `- ${p.likes} likes, ${p.comments} comments: "${(p.caption ?? '').slice(0, 100)}"`).join('\n')}`;
        }
      }
    } catch (err) {
      console.error('[Captions] Non-critical error:', err instanceof Error ? err.message : err);
    }

    // Pull cached insights for additional context
    let insightContext = '';
    try {
      const [cached] = await db
        .select()
        .from(insightsCache)
        .where(and(eq(insightsCache.userId, userId), eq(insightsCache.type, 'analytics')));

      if (cached?.data) {
        const data = cached.data as { summary?: string };
        if (data.summary) {
          insightContext = `\n\nACCOUNT INSIGHTS: ${data.summary}`;
        }
      }
    } catch (err) {
      console.error('[Captions] Non-critical error:', err instanceof Error ? err.message : err);
    }

    // Fetch brand voice from the brand record itself (per-brand voice settings)
    let brandVoiceContext = '';
    try {
      if (brand) {
        const parts: string[] = [];
        if (brand.brandVoiceTone && brand.brandVoiceTone !== 'neutral') {
          parts.push(`Tone: ${brand.brandVoiceTone}`);
        }
        if (brand.brandVoiceStyle && brand.brandVoiceStyle !== 'balanced') {
          parts.push(`Style: ${brand.brandVoiceStyle}`);
        }
        if (brand.brandVoiceDos) {
          parts.push(`Always include: ${brand.brandVoiceDos}`);
        }
        if (brand.brandVoiceDonts) {
          parts.push(`Never include: ${brand.brandVoiceDonts}`);
        }
        if (parts.length > 0) {
          brandVoiceContext = `\n\nBRAND VOICE GUIDELINES:\n${parts.join('. ')}.`;
        }
      }
    } catch (err) {
      console.error('[Captions] Non-critical error:', err instanceof Error ? err.message : err);
    }

    const prompt = `You are an expert Instagram content creator for "${brandName}" ${handle}.

Content type: ${contentType}
${competitorContext}
${ownPostContext}
${insightContext}
${brandVoiceContext}

REQUIREMENTS:
- Write a compelling caption (150-250 words) that BEATS the competition
- Strong scroll-stopping hook in the first line
- Use line breaks for readability
- End with a call-to-action or engaging question
- Use 2-3 emojis naturally
- Do NOT include hashtags in the caption
- NEVER use dashes, em-dashes, en-dashes, or hyphens as separators. Use commas or periods instead
- If competitor data is provided, write content that outperforms their style
- If own top posts data is provided, replicate the patterns that worked

Also generate:
- 15-20 relevant hashtags (mix of branded, niche, and reach hashtags)
- A short punchy hook text (3-6 words MAX) for image overlay. This appears on the image so it MUST be short, impactful, and make sense on its own. Examples: "Your mood shapes learning", "Race day secrets revealed", "Stop guessing your pace"

Return ONLY valid JSON. Hashtags separated by newlines:
{"caption":"full caption","hashtags":"#tag1\\n#tag2\\n#tag3","hookText":"3-6 word hook"}`;

    const content = await cerebrasChatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.85, maxTokens: 1200 },
    );

    // Strip markdown fences and clean AI response
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: try to extract caption from raw text
      return NextResponse.json({
        success: true,
        caption: cleaned.slice(0, 500),
        hashtags: '',
        hookText: '',
        source: 'cerebras-raw',
      });
    }

    let parsed;
    try {
      // Fix common JSON issues from AI: trailing commas, unescaped newlines
      const fixedJson = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      parsed = JSON.parse(fixedJson);
    } catch {
      // Still return the raw caption text rather than failing
      return NextResponse.json({
        success: true,
        caption: cleaned.replace(/[{}"]/g, '').slice(0, 500),
        hashtags: '',
        hookText: '',
        source: 'cerebras-raw',
      });
    }

    // Normalize hashtags to one per line
    let hashtagStr = String(parsed.hashtags ?? '')
      .replace(/\\n/g, '\n')  // Fix escaped \n from AI
      .replace(/,\s*/g, '\n');  // Fix comma-separated
    // If still no newlines, split by spaces
    if (!hashtagStr.includes('\n') && hashtagStr.includes(' #')) {
      hashtagStr = hashtagStr.split(/\s+/).filter((t: string) => t.startsWith('#')).join('\n');
    }
    // Final cleanup: only keep lines starting with #
    hashtagStr = hashtagStr.split('\n').map((t: string) => t.trim()).filter((t: string) => t.startsWith('#')).join('\n');

    // Clean up AI output
    const cleanText = (s: string, isCaption = false) => {
      let cleaned = s
        .replace(/\s*[—–]{1,3}\s*/g, ' ')    // strip em/en dashes (not hyphens in words)
        .replace(/\s{2,}/g, ' ')               // collapse whitespace
        .replace(/^(caption|hook|hookText)\s*:\s*/i, '')  // strip "caption:" prefix
        .trim();
      // For captions, strip trailing hashtag content that leaked in
      if (isCaption) {
        cleaned = cleaned.replace(/,?\s*hashtags?\s*:[\s\S]*$/i, '').trim();
        cleaned = cleaned.replace(/,\s*$/, '');
      }
      return cleaned;
    };

    return NextResponse.json({
      success: true,
      caption: cleanText(String(parsed.caption ?? ''), true),
      hashtags: hashtagStr,
      hookText: cleanText(String(parsed.hookText ?? '')),
      source: 'cerebras',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Captions] Error:', error);
    return NextResponse.json({ error: 'Failed to generate caption' }, { status: 500 });
  }
}
