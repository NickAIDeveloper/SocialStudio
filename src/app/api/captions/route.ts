import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedAccounts, scrapedPosts, insightsCache } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import { sanitizeCaption, sanitizeHook, sanitizeHashtags, reconcileCountClaim } from '@/lib/caption-engine';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { brandSlug, contentType } = body;

    const avoidTopics: string[] = body.avoidTopics || [];
    const variationSeed = body.variationSeed || Math.floor(Math.random() * 1000);
    const hookPattern: string = typeof body.hookPattern === 'string' ? body.hookPattern.slice(0, 120) : '';
    // Learning-driven directives from Smart Posts merge layer. All optional —
    // when omitted the caption generator behaves as before.
    const captionLengthHint: 'short' | 'medium' | 'long' | undefined =
      body.captionLengthHint === 'short' || body.captionLengthHint === 'medium' || body.captionLengthHint === 'long'
        ? body.captionLengthHint
        : undefined;
    const captionPatternHint: { type?: string; label?: string } | undefined =
      body.captionPatternHint && typeof body.captionPatternHint === 'object' ? body.captionPatternHint : undefined;
    const toneHint: string | undefined = typeof body.toneHint === 'string' ? body.toneHint : undefined;

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

    // Pull cached insights for additional context.
    // The insightsCache table is keyed (userId, type) only — no brandId — so a
    // user with multiple brands would otherwise read whichever brand's summary
    // was cached last. Skip the read entirely when generating for a specific
    // brand: brandContext / ownPostContext / brandVoiceContext below already
    // give the LLM enough brand-specific signal.
    let insightContext = '';
    if (!brand) {
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

    const contentTypeGuide: Record<string, string> = {
      promo: `CONTENT TYPE: Promotional
GOAL: Make them NEED to try the product RIGHT NOW.
FRAMEWORK: PAS (Pain → Agitate → Solution). Open with a pain point they feel daily, twist the knife, then reveal the product as the answer.
HOOK STYLE: Bold claim or "what if" that challenges their current reality.
CTA: "Try it free" or "Link in bio" (NEVER say download, this is a web app).
EXAMPLE:
"You're studying the same way you did 10 years ago.

Meanwhile your brain is begging for something different. It wants to learn at YOUR pace. In YOUR emotional state. On YOUR terms.

${brandName} adapts every session to how you actually feel right now. Not how a textbook thinks you should feel.

Try it free. Link in bio."`,

      quote: `CONTENT TYPE: Quote / Insight
GOAL: Create a screenshot-worthy moment. The first line should be so good people save it.
FRAMEWORK: Contrarian truth — say something true that most people haven't articulated yet. Challenge conventional wisdom.
HOOK STYLE: A truth bomb. Short. Punchy. Makes them stop and think "damn, that's true."
CTA: "Save this" or "Tag someone who needs this."
EXAMPLE:
"Nobody taught you how to learn. They just told you to study harder.

That's like telling someone to run faster without fixing their form. More effort, worse results.

The missing piece was never discipline. It was self awareness.

Save this if you've ever blamed yourself for not studying enough."`,

      tip: `CONTENT TYPE: Tips / How-to
GOAL: Deliver immediate value. Each tip should feel like a small revelation, not obvious advice.
FRAMEWORK: Open with a counterintuitive claim, then prove it with actionable steps. Each step should feel surprising or fresh.
HOOK STYLE: Number + surprising benefit. "3 ways" is boring. "3 study tricks your professor never told you" creates curiosity.
CTA: "Save this for your next session" or "Which one are you trying first?"
EXAMPLE:
"3 ways to remember anything after reading it once.

1. Read it out loud in a weird accent. Your brain flags unusual experiences as important.

2. Teach it to an empty chair. If you can't explain it simply, you don't know it yet.

3. Check your mood first. A stressed brain literally uses different pathways than a calm one.

Save this. You'll need it."`,

      community: `CONTENT TYPE: Community / Engagement
GOAL: Get comments. Create a post so relatable that people MUST respond.
FRAMEWORK: Share a specific, vulnerable experience. Then ask a question that's easy to answer but feels personal.
HOOK STYLE: "Be honest:" or "Unpopular opinion:" or a relatable confession.
CTA: "Tell me yours" or "Drop your answer below."
EXAMPLE:
"Be honest. How many times have you re-read the same page because your mind was somewhere else?

I used to think I was bad at studying. Turns out I was just ignoring how I was feeling before I started.

Stressed brain + complex material = zero retention. Every time.

When does this happen to you most? Tell me below."`,

      carousel: `CONTENT TYPE: Carousel Teaser
GOAL: Create irresistible curiosity to swipe. The caption teases, the slides deliver.
FRAMEWORK: Promise a specific transformation or reveal. Use "swipe" naturally.
HOOK STYLE: Specific claim + "Swipe to see how."
CTA: "Save this guide" or "Share with someone who needs this."
EXAMPLE:
"The difference between studying for 4 hours and actually remembering it? One simple change.

Swipe to see the method that changed everything.

Save this for exam season."`,
    };

    const prompt = `You are a world-class Instagram copywriter for "${brandName}" (${handle || brandName}). Your captions consistently go viral.
${brandContext}

${contentTypeGuide[contentType] || contentTypeGuide.promo}

${competitorContext}
${ownPostContext}
${insightContext}
${brandVoiceContext}

VARIATION SEED: ${variationSeed}. ${avoidTopics.length > 0 ? `AVOID these already-used themes: ${avoidTopics.slice(0, 5).join(', ')}.` : ''} Write from a completely fresh angle.
${hookPattern ? `\nWINNING HOOK PATTERN (this brand's past top-performer): "${hookPattern}"\nYour hookText MUST echo the rhythm/structure of that winning hook — same emotional register, same sentence shape, same curiosity trigger. Do NOT copy it verbatim; riff on it with a fresh angle.\n` : ''}${captionLengthHint ? `\nTARGET CAPTION LENGTH: ${captionLengthHint === 'short' ? 'SHORT (40-80 words). Punchy, dense, no fluff.' : captionLengthHint === 'long' ? 'LONG (120-200 words). Expand with texture, examples, or narrative while staying scannable.' : 'MEDIUM (80-120 words). Balanced depth.'} This is driven by what has historically performed best for this account.\n` : ''}${captionPatternHint?.label ? `\nCAPTION PATTERN: Structure this caption using the "${captionPatternHint.label}" pattern — this pattern statistically outperforms on this account. ${captionPatternHint.type === 'lists' ? 'Use a numbered or bulleted list of concrete tips.' : captionPatternHint.type === 'questions' ? 'Open with a provocative question and weave more questions throughout.' : captionPatternHint.type === 'emotional' ? 'Lead with a raw emotional confession or feeling.' : captionPatternHint.type === 'stats' ? 'Anchor the hook around a concrete number or comparison (real numbers only — no fabrication).' : captionPatternHint.type === 'story' ? 'Use a micro-story arc: setup → turn → lesson.' : ''}\n` : ''}${toneHint === 'community' ? `\nTONE NUDGE: Engagement has been dipping — lean into COMMUNITY / relatable mode. Be vulnerable, specific, and invite a response in the CTA.\n` : ''}

SCROLL-STOPPING HOOK RULES (this is the most important part):
- The hookText appears as large text overlaid on the image. It MUST be 3-6 words max.
- It must create an irresistible curiosity gap, a bold contrarian claim, or a pattern interrupt.
- GREAT hooks: "Your study method is broken" / "Nobody talks about this" / "Stop doing this today" / "This changes everything"
- BAD hooks: "Imperfect mastery" / "Learning matters" / "Study tips" (too vague, no emotion)

CAPTION RULES:
- ${captionLengthHint === 'long' ? 'Target 120-200 words. Multi-paragraph with texture, examples, or narrative.' : captionLengthHint === 'short' ? 'Target 40-80 words. Punchy, dense, no fluff.' : captionLengthHint === 'medium' ? 'Target 80-120 words. Balanced depth.' : 'Target 60-120 words. Dense with value. Every sentence earns the next.'}
- MINIMUM CONTENT: caption MUST have a hook line AND a body with at least 2 more sentences or list items. A single-line title is NOT a caption — it will be rejected.
- First line must hook HARD. Create a "wait, what?" reaction.
- End with a specific CTA. Never say "download" (this is a web app). Say "try it free", "link in bio", "save this", etc.
- COUNT CONSISTENCY: If your hookText contains a number ("5 ways", "3 hacks", "5 science hacks") OR your caption opens with a count promise ("Try these 5 ways"), the caption body MUST contain EXACTLY that many numbered list items (1., 2., 3., ...). Count them before you finalize. A hook that says "5 hacks" with only 3 items in the caption is a hard reject.
- No hashtags in caption body. No dashes or hyphens. No markdown. No emojis.
- Write like a human who actually cares, not a marketing robot.

HASHTAG RULES:
- Return EXACTLY 5 hashtags in the "hashtags" field. Not fewer. Not more.
- All 5 must be relevant to the post topic and brand niche.
- Do NOT use any hashtag from the AVOID list above.
- Mix tier 1 (broad reach, e.g. #running), tier 2 (mid-niche, e.g. #runnerscommunity), and tier 3 (specific, e.g. #trackworkout).

ABSOLUTE RULE — NO FABRICATIONS:
- NEVER invent statistics, percentages, or study results (e.g. "200% more retention" is BANNED).
- NEVER claim "research shows" or "studies prove" unless the claim is common knowledge (e.g. "stress affects focus").
- NEVER fabricate testimonials, user counts, or social proof.
- If referencing a general concept, use soft language: "many people find that..." or "you might notice that..."
- Only state product features that actually exist in the app. Do not invent features.
- Stick to relatable truths and personal experiences, not fake science.

Return ONLY valid JSON:
{"caption":"full multi-line caption with hook line plus body plus CTA","hashtags":"#tag1 #tag2 #tag3 #tag4 #tag5","hookText":"3-6 word scroll-stopping hook"}`;

    const content = await cerebrasChatCompletion(
      [
        { role: 'system', content: `You are an elite Instagram growth strategist and copywriter. You write captions that stop the scroll, create emotional resonance, and drive action. You use frameworks like PAS (Pain-Agitate-Solution), AIDA (Attention-Interest-Desire-Action), and contrarian hooks. Every word earns its place. You NEVER use generic marketing language. You write like someone who genuinely understands the audience's daily struggles. CRITICAL: You NEVER fabricate statistics, study results, or percentages. You NEVER claim "research shows X%" unless it is widely known common knowledge. You use relatable truths, not fake science. Reply with ONLY a JSON object. No other text.` },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.9, maxTokens: 600 },
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
      // Match content between outer JSON double-quotes, NOT apostrophes — the
      // previous [^"'] class truncated captions at contractions like "You'll".
      const captionMatch = raw.match(/["']?caption["']?\s*:\s*"([^"]+)"/i)
        || raw.match(/caption["']?\s*:\s*(.+?)(?:,\s*["']?hashtags|,\s*["']?hookText|$)/i);
      const hashtagsMatch = raw.match(/#\w+/g);
      const hookMatch = raw.match(/["']?hookText["']?\s*:\s*"([^"]+)"/i);

      const captionText = captionMatch
        ? captionMatch[1].replace(/\\n/g, '\n').replace(/["']/g, '').trim()
        : raw.replace(/#\w+/g, '').replace(/["':{}]/g, '').replace(/\s{2,}/g, ' ').slice(0, 500).trim();

      const fallbackReconciled = reconcileCountClaim(
        sanitizeHook(hookMatch ? hookMatch[1] : captionText.split(/[.\n]/)[0] || ''),
        sanitizeCaption(captionText),
      );
      return NextResponse.json({
        success: true,
        caption: fallbackReconciled.caption,
        hashtags: sanitizeHashtags((hashtagsMatch || []).join(' ')),
        hookText: fallbackReconciled.hookText,
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
        // Insert line breaks before numbered steps ONLY after sentence-ending punctuation
        // (the old lowercase-letter variant mangled sentences like "zone 3. Most runners").
        cleaned = cleaned.replace(/([.!?])\s*(\d+)\.\s/g, '$1\n$2. ');
        // Normalize whitespace
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        cleaned = cleaned.replace(/  +/g, ' ');
      } else {
        // For hooks: single line, no artifacts
        cleaned = cleaned.replace(/\n/g, ' ');
        cleaned = cleaned.replace(/\s+\d+\.?\s*$/, '');  // strip trailing "1." or "1"
        cleaned = cleaned.replace(/,?\s*hashtags?.*$/i, '');  // strip hashtags leak
        cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
        // Max 60 chars
        if (cleaned.length > 60) {
          const space = cleaned.lastIndexOf(' ', 60);
          cleaned = space > 10 ? cleaned.substring(0, space) : cleaned.substring(0, 60);
        }
      }
      return cleaned;
    };

    // Final sanitization pass using universal sanitizers
    let finalCaption = sanitizeCaption(String(parsed.caption ?? ''));
    let finalHook = sanitizeHook(String(parsed.hookText ?? ''));
    const finalHashtags = sanitizeHashtags(String(parsed.hashtags ?? ''));

    // ── Polish pass — grammar, spelling, and structure check ──────────
    try {
      const polishResult = await cerebrasChatCompletion(
        [
          {
            role: 'system',
            content: `You are a proofreader. Fix spelling, grammar, and awkward phrasing. Keep the same tone and meaning. Do NOT add new content, hashtags, or change the style. Return ONLY valid JSON with the corrected text. If the text is already correct, return it unchanged.`,
          },
          {
            role: 'user',
            content: `Proofread and fix any errors in this Instagram caption and hook text. Keep them natural and engaging.

CAPTION:
${finalCaption}

HOOK (short overlay text for image, must stay under 60 chars):
${finalHook}

Return ONLY: {"caption":"corrected caption","hookText":"corrected hook"}`,
          },
        ],
        { temperature: 0.1, maxTokens: 700 },
      );

      const polishCleaned = polishResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const polishMatch = polishCleaned.match(/\{[\s\S]*\}/);
      if (polishMatch) {
        const polished = JSON.parse(polishMatch[0]);
        if (polished.caption && polished.caption.length > 10) {
          finalCaption = sanitizeCaption(polished.caption);
        }
        if (polished.hookText && polished.hookText.length > 3) {
          finalHook = sanitizeHook(polished.hookText);
        }
      }
    } catch (polishErr) {
      // Polish is best-effort — use unpolished content if it fails
      console.error('[Captions] Polish pass failed (non-critical):', polishErr instanceof Error ? polishErr.message : polishErr);
    }

    // Reconcile any number-promise/list-count mismatch ("5 hacks" hook with 3
    // items in the caption). Runs AFTER polish so polish can't undo the fix.
    const reconciled = reconcileCountClaim(finalHook, finalCaption);
    finalHook = reconciled.hookText;
    finalCaption = reconciled.caption;

    return NextResponse.json({
      success: true,
      caption: finalCaption,
      hashtags: finalHashtags,
      hookText: finalHook,
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
