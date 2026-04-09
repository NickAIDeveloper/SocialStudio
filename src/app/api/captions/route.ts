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

    const contentTypeGuide: Record<string, string> = {
      promo: 'PROMO POST: Create urgency. Highlight the product benefit, explain why now, and tell them how to get it. Use a direct CTA like "Download now" or "Link in bio".',
      quote: 'QUOTE POST: Share a powerful, original thought or insight related to the brand. Make it quotable and shareable. The hook itself should BE the quote.',
      tip: 'TIP/HOW-TO POST: Share actionable advice. Use numbered steps (1. 2. 3.). Each step should be one clear sentence. End with "Save this for later" or "Share with someone who needs this".',
      community: 'COMMUNITY POST: Ask a genuine question to spark conversation. Share a relatable experience. The goal is comments and shares, not clicks.',
      carousel: 'CAROUSEL POST: Tease what the carousel contains. Use "Swipe for..." or "Save this guide". Keep caption short since the value is in the slides.',
    };

    const prompt = `You are an expert Instagram content creator for "${brandName}" ${handle}.

CONTENT TYPE: ${contentType}
${contentTypeGuide[contentType] || ''}

${competitorContext}
${ownPostContext}
${insightContext}
${brandVoiceContext}

INSTAGRAM CAPTION FORMAT (research-backed for maximum engagement):

1. HOOK (first line): A scroll-stopping statement or question. This is what people see BEFORE tapping "more". Make it irresistible. Under 10 words.

2. BODY (2-4 short paragraphs): Deliver value. Use line breaks between paragraphs. Keep total caption under 150 words (shorter captions = higher engagement). NEVER use dashes or hyphens as separators.

3. CTA (last line): End with ONE clear call-to-action. Either a question ("What's yours?"), action ("Save this"), or engagement prompt ("Tag someone who needs this").

RULES:
- NO hashtags in the caption text
- NO dashes, em-dashes, en-dashes, or hyphens
- 1-2 emojis maximum, placed naturally
- Every sentence must be TRUE and relevant to ${brandName}
- Do not fabricate features or make claims that aren't real
- If competitor data is provided, write content that outperforms their style

ALSO GENERATE:
- hookText: A punchy 3-6 word hook for image overlay. Must make complete sense alone. NEVER include newlines, the word "caption", or meta-commentary. Examples: "Your mood shapes learning", "Race day secrets", "Stop guessing your pace"
- hashtags: 5 highly relevant hashtags (mix of branded + niche). Quality over quantity.

Return ONLY valid JSON:
{"caption":"hook line\\n\\nbody paragraphs\\n\\nCTA line","hashtags":"#tag1\\n#tag2\\n#tag3\\n#tag4\\n#tag5","hookText":"3-6 word hook"}`;

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
        .replace(/\\n/g, '\n')                  // fix escaped newlines
        .replace(/\s*[—–]{1,3}\s*/g, ' ')      // strip em/en dashes
        .replace(/^(caption|hook|hookText)\s*:\s*/i, '')  // strip prefixes
        .trim();
      // For captions, strip trailing hashtag content that leaked in
      if (isCaption) {
        cleaned = cleaned.replace(/,?\s*hashtags?\s*:[\s\S]*$/i, '').trim();
        cleaned = cleaned.replace(/,\s*$/, '');
        // Normalize multiple newlines to max double
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      } else {
        // For hooks: single line only, no newlines
        cleaned = cleaned.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
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
