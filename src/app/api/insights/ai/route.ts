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

      const prompt = `You are an Instagram analytics advisor. Analyze ONLY the real data below. Do NOT fabricate, estimate, or invent any numbers. Only reference data that is explicitly provided.

Account: @${brand.instagramHandle ?? brand.name}
Followers: ${ownAccount?.followerCount ?? 'no data'}
Following: ${ownAccount?.followingCount ?? 'no data'}
Total Posts: ${ownAccount?.postCount ?? 'no data'}

Recent ${postSummary.length} posts with REAL engagement data:
${JSON.stringify(postSummary, null, 1)}

RULES:
- ONLY reference numbers from the data above
- If data is missing or zero, say "not enough data" — do NOT make up numbers
- Do NOT fabricate engagement rates, percentages, or statistics
- Each insight must be grounded in the actual post data provided

Provide exactly 5 insights as a JSON array. Each insight:
- "title": short headline (under 10 words)
- "insight": 2-3 sentences referencing ONLY the real data above
- "action": one specific thing to do next
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

      const prompt = `You are an Instagram competitive intelligence advisor. Analyze ONLY the real data below. Do NOT fabricate any numbers.

Your account: @${brand.instagramHandle ?? brand.name} (${ownAccount?.followerCount ?? 'unknown'} followers)

Competitor REAL data:
${JSON.stringify(competitorData, null, 1)}

RULES:
- ONLY reference numbers from the data above
- If a competitor has 0 posts scraped, say "no post data available" — do NOT make up engagement stats
- Do NOT fabricate engagement rates or percentages that aren't calculable from the data
- Compare follower counts, post counts, and any available engagement data ONLY

Provide exactly 5 competitive insights as a JSON array. Each:
- "title": short headline (under 10 words)
- "insight": 2-3 sentences using ONLY the real data above
- "action": one specific thing to do
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
