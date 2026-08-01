import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedAccounts, scrapedPosts, insightsCache, posts, postAnalytics } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import { sanitizeCaption, sanitizeHook, sanitizeHashtags, reconcileCountClaim } from '@/lib/caption-engine';
import { resolveHook } from '@/lib/smart-posts/hook-fallback';
import { pickLruAngle, buildCreativeBrief, aggregateAngleScores, type CreativeAngle, type AngleId } from '@/lib/smart-posts/creative-angles';
import { classifyHookPattern } from '@/lib/brain/creative-stats';
import { pickUnderusedPattern, buildVarietyDirective } from '@/lib/brain/hook-shape';
import {
  classifyHookAngle,
  dominantHookSkeleton,
  hookTechniques,
  hookMatchesSkeleton,
  skeletonToHuman,
} from '@/lib/smart-posts/hook-variety';

// This route can make a SECOND Cerebras call (the hard variety guard regenerates
// the hook when it still matches the banned skeleton). Give the function an
// explicit budget so the guard's extra round-trip has headroom instead of racing
// the platform default. god-mode (the caller) is 90s; captions is a separate
// function invocation with its own timeout.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    let userId: string | null = null;
    let rawBody: string;
    if (request.headers.get('x-brain-signature')) {
      rawBody = await request.text();
      if (await verifyBrainSignature(request, rawBody)) {
        try {
          const parsed = JSON.parse(rawBody) as { userId?: string };
          if (parsed.userId && typeof parsed.userId === 'string') userId = parsed.userId;
        } catch { /* ignore */ }
      }
    } else {
      rawBody = await request.text();
    }
    if (!userId) {
      userId = await getUserId();
    }
    const body = JSON.parse(rawBody) as {
      brandSlug?: string;
      contentType?: string;
      avoidTopics?: string[];
      variationSeed?: number;
      hookPattern?: string;
      captionLengthHint?: string;
      captionPatternHint?: { type?: string; label?: string };
      toneHint?: string;
      brainBriefMd?: string;
      userId?: string;
    };
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
    const brainBriefMd: string | null =
      typeof body.brainBriefMd === 'string' && body.brainBriefMd.length > 0
        ? body.brainBriefMd.slice(0, 4000) // hard cap for prompt safety
        : null;

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

    // Anti-repetition memory: pull this brand's recent hooks so the model is
    // forced to produce a STRUCTURALLY different one. Without this, every run
    // echoed the same top pattern — the user saw "Your pace is hiding" 8 of 12
    // posts. Images already enforce all-time no-reuse; text had none.
    let recentHooksBlock = '';
    let recentHooks: string[] = []; // de-duped — for the display block
    let recentHooksRaw: string[] = []; // WITH repeats — for collapse detection (an exact
    // 8× repeat must not dedup down to count 1 and escape the skeleton ban)
    let recentAngleIds: AngleId[] = []; // stored angle per recent post (newest first)
    if (brand) {
      try {
        const recent = await db
          .select({ hookText: posts.hookText, angle: posts.angle })
          .from(posts)
          .where(eq(posts.brandId, brand.id))
          .orderBy(desc(posts.createdAt))
          .limit(15);
        recentHooksRaw = recent.map((r) => (r.hookText ?? '').trim()).filter(Boolean);
        recentHooks = Array.from(new Set(recentHooksRaw));
        // Prefer the EXACT angle stored on each post; fall back to inferring it
        // from the hook text only for legacy rows that predate the angle column.
        recentAngleIds = recent
          .map((r) => (r.angle as AngleId | null) ?? (r.hookText ? classifyHookAngle(r.hookText) : null))
          .filter((a): a is AngleId => a !== null);
        if (recentHooks.length > 0) {
          recentHooksBlock = `\n\nRECENTLY USED HOOKS — do NOT reuse any of these or a close variant. Your hook must be a clearly different opening structure (if these are dominated by one shape like "Your X is Y", pick a different shape entirely):\n${recentHooks
            .map((h) => `- "${h}"`)
            .join('\n')}`;
        }
      } catch (err) {
        console.error('[Captions] recent-hooks fetch failed:', err instanceof Error ? err.message : err);
      }
    }

    // Angle performance leaderboard: real reach/saves attributed to each angle
    // (postAnalytics, filled by the daily attribution writer from IG insights).
    // Feeds pickLruAngle's tie-break so proven angles win the coin-flip among
    // equally-stale candidates. Empty until data exists — then the loop compounds.
    let angleScores: Partial<Record<AngleId, number>> = {};
    if (brand) {
      try {
        const perfRows = await db
          .select({ angle: posts.angle, reach: postAnalytics.reach, saves: postAnalytics.saves })
          .from(posts)
          .innerJoin(postAnalytics, eq(postAnalytics.postId, posts.id))
          .where(and(eq(posts.brandId, brand.id), eq(posts.source, 'autopilot')));
        angleScores = aggregateAngleScores(perfRows);
      } catch (err) {
        console.error('[Captions] angle-performance fetch failed:', err instanceof Error ? err.message : err);
      }
    }

    // Creative-angle engine: instead of cloning the brand's top-performing hook
    // (which caused the "Your pace is hiding" mode collapse — see
    // creative-angles.ts), rotate to a least-recently-used angle. We infer the
    // angles the recent posts already used from their hook text, pick the
    // stalest one (performance breaks ties toward proven winners), carry the
    // winning hook's *techniques* forward (never its words), and ban the overused
    // sentence skeleton outright.
    const chosenAngle: CreativeAngle = pickLruAngle(recentAngleIds, variationSeed, { scores: angleScores });
    const bannedSkeleton = dominantHookSkeleton(recentHooksRaw);
    const bannedSkeletonHuman = bannedSkeleton ? skeletonToHuman(bannedSkeleton) : null;
    const winningTechniques = hookPattern ? hookTechniques(hookPattern) : [];
    const creativeBrief = buildCreativeBrief({
      angle: chosenAngle,
      winningTechniques,
      bannedSkeletonHuman,
    });

    // Hook SHAPE variety, orthogonal to the angle rotation above: the angle
    // decides the subject, this decides the sentence form. Both are needed --
    // the creative loop measured ~75% of every hook ever published using the
    // same shape ('statement'), which the angle rotation cannot see because a
    // question and a flat claim about the same subject share an angle.
    const recentPatterns = recentHooksRaw.map((h) => classifyHookPattern(h));
    const varietyDirective = buildVarietyDirective(
      pickUnderusedPattern(recentPatterns),
      recentPatterns,
    );

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

    const brainContext = brainBriefMd
      ? `\nBRAND BRAIN (latest daily brief — use as strategic guidance):\n${brainBriefMd}\n`
      : '';

    const prompt = `You are a world-class Instagram copywriter for "${brandName}" (${handle || brandName}). Your captions consistently go viral.

THIS POST IS FOR: ${brandName}
RULE: Never mention any other brand name. Only refer to "${brandName}"${handle ? ` or its handle ${handle}` : ''}. If you need a product example, use ${brandName}'s own. If you reference an app or product, it MUST be ${brandName} — never a competitor or sibling brand.
${brandContext}

${contentTypeGuide[contentType] || contentTypeGuide.promo}

${competitorContext}
${ownPostContext}
${insightContext}
${brainContext}
${brandVoiceContext}

VARIATION SEED: ${variationSeed}. ${avoidTopics.length > 0 ? `AVOID these already-used themes: ${avoidTopics.slice(0, 5).join(', ')}.` : ''} Write from a completely fresh angle.
${recentHooksBlock}
${creativeBrief}
${varietyDirective}
${captionLengthHint ? `\nTARGET CAPTION LENGTH: ${captionLengthHint === 'short' ? 'SHORT (40-80 words). Punchy, dense, no fluff.' : captionLengthHint === 'long' ? 'LONG (120-200 words). Expand with texture, examples, or narrative while staying scannable.' : 'MEDIUM (80-120 words). Balanced depth.'} This is driven by what has historically performed best for this account.\n` : ''}${captionPatternHint?.label ? `\nCAPTION PATTERN: Structure this caption using the "${captionPatternHint.label}" pattern — this pattern statistically outperforms on this account. ${captionPatternHint.type === 'lists' ? 'Use a numbered or bulleted list of concrete tips.' : captionPatternHint.type === 'questions' ? 'Open with a provocative question and weave more questions throughout.' : captionPatternHint.type === 'emotional' ? 'Lead with a raw emotional confession or feeling.' : captionPatternHint.type === 'stats' ? 'Anchor the hook around a concrete number or comparison (real numbers only — no fabrication).' : captionPatternHint.type === 'story' ? 'Use a micro-story arc: setup → turn → lesson.' : ''}\n` : ''}${toneHint === 'community' ? `\nTONE NUDGE: Engagement has been dipping — lean into COMMUNITY / relatable mode. Be vulnerable, specific, and invite a response in the CTA.\n` : ''}

SPECIFICITY — THE ANTI-SLOP RULE (as important as the hook):
- The post MUST contain at least ONE concrete, specific, verifiable element: a real number, a named ${brandName} feature, a concrete step, or a specific micro-moment or example. Generic motivation with no specifics is a hard reject.
- It must say something only ${brandName} (or someone who genuinely knows this niche) could say. If any other brand in this space could post it verbatim, rewrite it.
- BANNED generic filler (never use these): "in today's world", "let's dive in", "game changer", "take it to the next level", "unlock your potential", "the secret to success", "elevate your", "we've got you covered", "level up", "that's where we come in", "in a world where".
- Choose the concrete over the abstract every time: "log a 42 minute 10K" beats "improve your times"; "reshapes the lesson the moment you get stressed" beats "personalized learning".

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

CAPTION FORMATTING (CRITICAL — Instagram strips squashed text):
- Output the caption as MULTIPLE PARAGRAPHS separated by blank lines (\\n\\n).
- The HOOK LINE must be the first paragraph on its own (one line, then a blank line).
- The BODY must be split into 2-4 short paragraphs, each separated by a blank line.
- Numbered lists ("1. ...", "2. ...") must each be on their own line.
- The CTA must be the final paragraph on its own, preceded by a blank line.
- NEVER concatenate the whole caption into one wall of text. A dense paragraph is a hard reject.
- Example of correct shape (note the blank lines between paragraphs):
  Your study method is broken.\\n\\nMost people read until they forget, then read again. That is not learning. That is procrastination dressed up.\\n\\n${brandName} adapts every session to your mood and pace. Stressed brain gets simpler material. Energized brain goes deeper.\\n\\nTry it free. Link in bio.

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
        // Guard against an empty extracted hook crashing the renderer. Falls
        // back to the fresh caption, never the stale top-post opener.
        hookText: resolveHook({
          hookText: fallbackReconciled.hookText,
          caption: fallbackReconciled.caption,
        }),
        angle: chosenAngle.id,
        source: 'cerebras-extracted',
      });
    }

    // Normalize hashtags: extract all #tags regardless of separator format
    const rawHashtags = String(parsed.hashtags ?? '').replace(/\\n/g, ' ');
    const hashtagStr = (rawHashtags.match(/#\w+/g) || [])
      .slice(0, 5)
      .join('\n');

    // Final sanitization pass using universal sanitizers
    let finalCaption = sanitizeCaption(String(parsed.caption ?? ''));
    let finalHook = sanitizeHook(String(parsed.hookText ?? ''));
    const finalHashtags = sanitizeHashtags(String(parsed.hashtags ?? ''));

    // NOTE: a second Cerebras "polish" pass used to run here. It was dropped
    // because each autopilot run fans out 4-5 Cerebras calls and the polish
    // round-trip pushed totals over Cerebras's per-minute rate limit AND over
    // god-mode's 60s function-timeout when retries stacked. The main caption
    // call already runs through sanitizeCaption + reconcileCountClaim, which
    // catches the vast majority of what polish was correcting. Re-add behind
    // an opt-in flag if smart-posts UI quality regresses.

    // Reconcile any number-promise/list-count mismatch ("5 hacks" hook with 3
    // items in the caption).
    const reconciled = reconcileCountClaim(finalHook, finalCaption);
    finalHook = reconciled.hookText;
    finalCaption = reconciled.caption;

    // Hard variety guard: if the model STILL returned a hook matching the
    // overused skeleton (rare once the angle brief is in place), regenerate just
    // the hook — one short extra call, fired ONLY on collapse — with the banned
    // shape spelled out. This is the belt to the prompt's suspenders, the text
    // analogue of the image pHash guard.
    if (bannedSkeleton && hookMatchesSkeleton(finalHook, bannedSkeleton)) {
      try {
        const regen = await cerebrasChatCompletion(
          [
            {
              role: 'system',
              content:
                'You write 3-6 word scroll-stopping Instagram overlay hooks. Reply with ONLY the hook text — no quotes, no JSON, no trailing punctuation.',
            },
            {
              role: 'user',
              content: `Caption:\n${finalCaption}\n\nWrite a NEW 3-6 word overlay hook for this caption using the "${chosenAngle.label}" angle (${chosenAngle.hookGuidance}). It MUST NOT match the shape "${bannedSkeletonHuman}" and must be structurally different from these recent hooks: ${recentHooks
                .slice(0, 8)
                .map((h) => `"${h}"`)
                .join(', ')}. Return only the hook.`,
            },
          ],
          { temperature: 1.0, maxTokens: 40 },
        );
        const candidate = sanitizeHook((regen.split('\n').find(Boolean) ?? '').replace(/^["'\s]+|["'\s]+$/g, ''));
        if (candidate && !hookMatchesSkeleton(candidate, bannedSkeleton)) {
          finalHook = candidate;
        }
      } catch (err) {
        console.error('[Captions] hook regeneration failed:', err instanceof Error ? err.message : err);
      }
    }

    // Never return an empty hookText: the model occasionally omits it, and an
    // empty overlay crashes the downstream image renderer. Derive one from the
    // FRESH caption as a last resort — NOT from hookPattern, which is the stale
    // top-post opener that used to make the fallback repeat "Your pace is
    // hiding". See hook-fallback.ts.
    finalHook = resolveHook({ hookText: finalHook, caption: finalCaption });

    return NextResponse.json({
      success: true,
      caption: finalCaption,
      hashtags: finalHashtags,
      hookText: finalHook,
      angle: chosenAngle.id,
      source: 'cerebras',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Captions] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    // Surface the underlying error so the autopilot UI can show "Cerebras
    // rate-limited after 3 retries" instead of a generic "Failed to generate".
    const isRateLimit = /\((429|503)\)/.test(msg) || /rate.?limit/i.test(msg);
    return NextResponse.json(
      {
        error: 'Failed to generate caption',
        message: isRateLimit
          ? 'AI provider is rate-limited right now. Try again in a minute.'
          : msg.slice(0, 200),
      },
      { status: 500 },
    );
  }
}
