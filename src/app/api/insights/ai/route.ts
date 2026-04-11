import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, scrapedAccounts, scrapedPosts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

/**
 * POST /api/insights/ai
 * Generate AI-powered insights for a specific brand's Instagram account.
 * Body: { brandId: string, type: 'analytics' | 'competitors' }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { brandId, type } = body;

    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
    }

    // Get brand info
    const [brand] = brandId
      ? await db.select().from(brands).where(and(eq(brands.userId, userId), eq(brands.id, brandId))).limit(1)
      : await db.select().from(brands).where(eq(brands.userId, userId)).limit(1);

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    // Get own account data
    const ownAccounts = await db
      .select()
      .from(scrapedAccounts)
      .where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, false)));

    const ownAccount = ownAccounts.find(a => a.handle === brand.instagramHandle) ?? ownAccounts[0];

    // Get own posts
    const ownPosts = ownAccount
      ? await db
          .select()
          .from(scrapedPosts)
          .where(and(eq(scrapedPosts.userId, userId), eq(scrapedPosts.accountId, ownAccount.id)))
          .orderBy(desc(scrapedPosts.scrapedAt))
          .limit(20)
      : [];

    if (type === 'analytics') {
      // Build data summary for AI
      const postSummary = ownPosts.map(p => ({
        likes: p.likes,
        comments: p.comments,
        isVideo: p.isVideo,
        caption: (p.caption ?? '').slice(0, 100),
        hashtags: p.hashtags ?? '',
        postedAt: p.postedAt?.toISOString() ?? '',
      }));

      const followers = ownAccount?.followerCount ?? 0;
      const avgLikes = postSummary.length > 0 ? Math.round(postSummary.reduce((s, p) => s + p.likes, 0) / postSummary.length) : 0;
      const avgComments = postSummary.length > 0 ? Math.round(postSummary.reduce((s, p) => s + p.comments, 0) / postSummary.length) : 0;
      const engRate = followers > 0 ? (((avgLikes + avgComments) / followers) * 100).toFixed(2) : 'unknown';

      const prompt = `You are an Instagram growth advisor for @${brand.instagramHandle ?? brand.name}.

REAL DATA (do NOT fabricate any numbers):
- Followers: ${followers || 'no data'} | Following: ${ownAccount?.followingCount ?? 'no data'} | Posts: ${ownAccount?.postCount ?? 'no data'}
- Engagement rate: ${engRate}% (avg ${avgLikes} likes + ${avgComments} comments per post)
- Recent ${postSummary.length} posts: ${JSON.stringify(postSummary, null, 1)}

Generate exactly 5 insights as a JSON array. Structure them as:
1. A "Weekly Action" — one specific thing to do THIS WEEK (type: "opportunity")
2. A "Content Insight" — what content patterns are working/failing based on the data (type: "positive" or "warning")
3. A "Timing Insight" — when to post based on their posting patterns (type: "opportunity")
4. A "Caption Insight" — what caption styles drive engagement in their posts (type: "positive" or "warning")
5. A "Growth Tip" — one specific tactic to grow faster based on their current performance (type: "opportunity")

Each insight:
- "title": short headline, max 8 words, be SPECIFIC not generic
- "insight": 2 sentences referencing REAL numbers from the data
- "action": ONE concrete action step (not vague advice like "post more")
- "type": "positive", "warning", or "opportunity"

BAD example: "Post more consistently" — too vague
GOOD example: "Post a carousel about [topic from their captions] on Wednesday at 11am using #hashtag"

Return ONLY the JSON array.`;

      const aiResponse = await cerebrasChatCompletion([
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
      }

      let insights;
      try {
        insights = JSON.parse(jsonMatch[0]);
      } catch {
        return NextResponse.json({ error: 'AI returned invalid format. Please try again.' }, { status: 502 });
      }
      return NextResponse.json({ insights, source: 'cerebras' });
    }

    if (type === 'competitors') {
      // Get competitor data
      const competitorAccounts = brandId
        ? await db.select().from(scrapedAccounts).where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, true), eq(scrapedAccounts.brandId, brandId)))
        : await db.select().from(scrapedAccounts).where(and(eq(scrapedAccounts.userId, userId), eq(scrapedAccounts.isCompetitor, true)));

      // Get competitor posts
      const competitorData = [];
      for (const comp of competitorAccounts.slice(0, 10)) {
        const posts = await db
          .select()
          .from(scrapedPosts)
          .where(and(eq(scrapedPosts.userId, userId), eq(scrapedPosts.accountId, comp.id)))
          .orderBy(desc(scrapedPosts.scrapedAt))
          .limit(12);

        competitorData.push({
          handle: comp.handle,
          followers: comp.followerCount ?? 0,
          following: comp.followingCount ?? 0,
          postCount: comp.postCount ?? 0,
          recentPosts: posts.map(p => ({
            likes: p.likes,
            comments: p.comments,
            isVideo: p.isVideo,
            caption: (p.caption ?? '').slice(0, 80),
          })),
        });
      }

      const prompt = `You are an Instagram competitive intelligence advisor for @${brand.instagramHandle ?? brand.name} (${ownAccount?.followerCount ?? 'unknown'} followers).

REAL competitor data:
${JSON.stringify(competitorData, null, 1)}

Generate exactly 5 competitive insights as a JSON array. Structure them as:
1. "Steal Their Formula" — analyze the TOP competitor's best post and explain exactly what makes it work: hook technique, caption structure, hashtag strategy. Give the user a template to copy. (type: "opportunity")
2. "Content Gap" — find a topic or format that competitors do well but the user doesn't cover, or that NO competitor covers well. Be specific about the opportunity. (type: "opportunity")
3. "Competitive Advantage" — identify something the user does better than competitors (even small wins). (type: "positive")
4. "Threat Alert" — what's the biggest competitive threat? A competitor growing fast, dominating engagement, or covering their niche better? (type: "warning")
5. "Quick Win" — one specific, actionable tactic the user can do THIS WEEK to close the gap. Reference specific competitor data. (type: "opportunity")

Each insight:
- "title": short headline, max 8 words, be SPECIFIC
- "insight": 2-3 sentences referencing REAL numbers from the data. Name specific competitor handles.
- "action": ONE concrete, specific step (not vague like "study competitors")
- "type": "positive", "warning", or "opportunity"

Return ONLY the JSON array.`;

      const aiResponse = await cerebrasChatCompletion([
        { role: 'user', content: prompt },
      ]);

      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
      }

      let insights;
      try {
        insights = JSON.parse(jsonMatch[0]);
      } catch {
        return NextResponse.json({ error: 'AI returned invalid format. Please try again.' }, { status: 502 });
      }
      return NextResponse.json({ insights, source: 'cerebras' });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[AI Insights] Error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
