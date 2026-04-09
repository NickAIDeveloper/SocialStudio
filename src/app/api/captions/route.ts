import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedAccounts, scrapedPosts, insightsCache } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import { sanitizeCaption, sanitizeHook, sanitizeHashtags } from '@/lib/caption-engine';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { brandSlug, contentType } = body;

    const avoidTopics: string[] = body.avoidTopics || [];
    const variationSeed = body.variationSeed || Math.floor(Math.random() * 1000);

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

    // Build brand context from website and description
    let brandContext = '';
    if (brand) {
      const parts: string[] = [];
      if (brand.description) {
        parts.push(`ABOUT ${brandName.toUpperCase()}: ${brand.description}`);
      }
      if (brand.websiteUrl) {
        parts.push(`Website: ${brand.websiteUrl}`);
      }
      if (parts.length > 0) {
        brandContext = `\n\n${parts.join('\n')}`;
      } else {
        brandContext = `\n\nNote: No description provided for ${brandName}. Write general content appropriate for this brand name.`;
      }
    }

    const contentTypeExamples: Record<string, string> = {
      promo: `CONTENT TYPE: Promotional
Write a promo post. Create urgency, highlight the key benefit, tell them how to get it.
Example caption style:
"Your focus is about to change.

Affectly adapts every lesson to how you're feeling right now. Stressed? Slower pace. Energized? Deeper content.

No more one size fits all learning.

Download free today. Link in bio."`,
      quote: `CONTENT TYPE: Quote
Write a quote post. Share a powerful, original insight. The first line IS the quote. Make it shareable.
Example caption style:
"The best learning happens when you feel safe to fail.

Most apps push you harder when you struggle. Affectly does the opposite. It meets you where you are.

Double tap if you agree."`,
      tip: `CONTENT TYPE: Tips / How-to
Write a tips post. Use numbered steps. Each step is one clear sentence.
Example caption style:
"3 ways to study smarter, not harder.

1. Check your mood before you start. Your emotional state affects retention.
2. Match your material to your energy. Complex topics when you're sharp, reviews when you're tired.
3. Take a 2 minute reflection break between topics.

Save this for later."`,
      community: `CONTENT TYPE: Community
Write a community post. Ask a genuine question. Share a relatable experience. Goal is comments.
Example caption style:
"What subject do you always avoid studying?

For me it was statistics. Until I realized my brain just needed a different approach on low energy days.

Tell me yours in the comments."`,
      carousel: `CONTENT TYPE: Carousel
Write a carousel teaser. Keep it short since the value is in the slides.
Example caption style:
"5 signs your study routine needs an upgrade. Swipe to find out.

Save this guide for your next study session."`,
    };

    const prompt = `Write an Instagram caption for "${brandName}" (@${handle || brandName}).
${brandContext}

${contentTypeExamples[contentType] || contentTypeExamples.promo}

${competitorContext}
${ownPostContext}
${insightContext}
${brandVoiceContext}

Write a UNIQUE post (variation ${variationSeed}). ${avoidTopics.length > 0 ? `Avoid these already-used themes: ${avoidTopics.slice(0, 5).join(', ')}.` : ''} Use a completely fresh angle.

Rules: Under 80 words. No hashtags in caption. No dashes or hyphens. No markdown. Natural English. End with a call to action.

Return valid JSON only:
{"caption":"the full caption text","hashtags":"#${brandName} #tag2 #tag3 #tag4 #tag5","hookText":"3 to 5 word hook"}`;

    const content = await cerebrasChatCompletion(
      [
        { role: 'system', content: 'You write Instagram captions. Reply with only a JSON object. No other text.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.85, maxTokens: 600 },
    );

    // Strip markdown fences and clean AI response
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/^[^{]*/, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    let parsed: { caption?: string; hashtags?: string; hookText?: string } | null = null;

    if (jsonMatch) {
      // Try multiple JSON repair strategies
      const repairs = [
        jsonMatch[0],
        jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'),
        // Replace unescaped newlines inside JSON strings
        jsonMatch[0].replace(/(?<=:\s*"[^"]*)\n/g, '\\n'),
      ];
      for (const attempt of repairs) {
        try {
          parsed = JSON.parse(attempt);
          break;
        } catch { /* try next repair */ }
      }
    }

    // Manual extraction fallback if JSON parsing completely fails
    if (!parsed || !parsed.caption) {
      const raw = cleaned.replace(/[{}]/g, '');
      // Extract fields manually using key: "value" pattern
      const captionMatch = raw.match(/["']?caption["']?\s*:\s*["']([^"']+)["']/i)
        || raw.match(/caption["']?\s*:\s*(.+?)(?:,\s*["']?hashtags|,\s*["']?hookText|$)/i);
      const hashtagsMatch = raw.match(/#\w+/g);
      const hookMatch = raw.match(/["']?hookText["']?\s*:\s*["']([^"']+)["']/i);

      const captionText = captionMatch
        ? captionMatch[1].replace(/\\n/g, '\n').replace(/["']/g, '').trim()
        : raw.replace(/#\w+/g, '').replace(/["':{}]/g, '').replace(/\s{2,}/g, ' ').slice(0, 500).trim();

      return NextResponse.json({
        success: true,
        caption: sanitizeCaption(captionText),
        hashtags: sanitizeHashtags((hashtagsMatch || []).join(' ')),
        hookText: sanitizeHook(hookMatch ? hookMatch[1] : captionText.split(/[.\n]/)[0] || ''),
        source: 'cerebras-extracted',
      });
    }

    // Normalize hashtags: extract all #tags regardless of separator format
    const rawHashtags = String(parsed.hashtags ?? '').replace(/\\n/g, ' ');
    const hashtagStr = (rawHashtags.match(/#\w+/g) || [])
      .slice(0, 5)
      .join('\n');

    // Aggressively clean all AI output artifacts
    const cleanText = (s: string, isCaption = false) => {
      let cleaned = String(s)
        .replace(/\\n/g, '\n')                    // fix escaped newlines
        .replace(/\s*[—–]{1,3}\s*/g, ' ')        // strip em/en dashes
        .replace(/\*\*/g, '')                     // strip markdown bold
        .replace(/^["']+|["']+$/g, '')            // strip wrapping quotes
        .replace(/^(caption|hook|hookText)\s*:\s*/i, '')  // strip key prefixes
        .trim();
      if (isCaption) {
        // Strip ALL trailing JSON-like content
        cleaned = cleaned.replace(/,?\s*["']?hashtags?["']?\s*:[\s\S]*$/i, '').trim();
        cleaned = cleaned.replace(/,?\s*["']?hookText["']?\s*:[\s\S]*$/i, '').trim();
        cleaned = cleaned.replace(/,\s*$/, '');
        // Strip any remaining hashtags from caption body
        cleaned = cleaned.replace(/#\w+/g, '').trim();
        // Insert line breaks before numbered steps
        cleaned = cleaned.replace(/([.!?])\s*(\d+)\.\s/g, '$1\n$2. ');
        cleaned = cleaned.replace(/([a-z])\s+(\d+)\.\s/g, '$1\n\n$2. ');
        // Normalize whitespace
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        cleaned = cleaned.replace(/  +/g, ' ');
      } else {
        // For hooks: single line, no artifacts
        cleaned = cleaned.replace(/\n/g, ' ');
        cleaned = cleaned.replace(/\s+\d+\.?\s*$/, '');  // strip trailing "1." or "1"
        cleaned = cleaned.replace(/,?\s*hashtags?.*$/i, '');  // strip hashtags leak
        cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
        // Max 45 chars
        if (cleaned.length > 45) {
          const space = cleaned.lastIndexOf(' ', 45);
          cleaned = space > 10 ? cleaned.substring(0, space) : cleaned.substring(0, 45);
        }
      }
      return cleaned;
    };

    // Final sanitization pass using universal sanitizers
    return NextResponse.json({
      success: true,
      caption: sanitizeCaption(String(parsed.caption ?? '')),
      hashtags: sanitizeHashtags(String(parsed.hashtags ?? '')),
      hookText: sanitizeHook(String(parsed.hookText ?? '')),
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
