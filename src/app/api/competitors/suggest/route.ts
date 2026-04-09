import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { competitors as hardcodedCompetitors } from '@/data/competitor-insights';

interface Suggestion {
  handle: string;
  reason: string;
}

const AFFECTLY_KEYWORDS = [
  'affectly',
  'mental health',
  'wellness',
  'calm',
  'meditation',
  'mindfulness',
  'therapy',
  'anxiety',
  'self-care',
  'selfcare',
  'emotional',
  'emotion',
  'learning',
  'education',
  'edtech',
  'study',
  'student',
  'ai tutor',
];

const PACEBRAIN_KEYWORDS = [
  'pacebrain',
  'running',
  'fitness',
  'training',
  'sport',
  'marathon',
  'athlete',
  'exercise',
  'workout',
  'pace',
  'endurance',
  'run',
  'runner',
  'cycling',
  'triathlon',
];

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// Curated competitor lists per niche — mix of large and small accounts
const NICHE_COMPETITORS: Record<string, Suggestion[]> = {
  wellness: [
    { handle: 'calm', reason: 'Leading meditation and sleep app — 5M+ followers' },
    { handle: 'headspace', reason: 'Major mindfulness app competitor — 2M+ followers' },
    { handle: 'betterhelp', reason: 'Online therapy platform with strong social presence' },
    { handle: 'talkspace', reason: 'Therapy app with similar target audience' },
    { handle: 'mindbodygreen', reason: 'Wellness media brand — content strategy to study' },
    { handle: 'theholisticpsychologist', reason: 'Mental health influencer — high engagement' },
    { handle: 'nedratawwab', reason: 'Therapist and author — boundary/self-care content' },
    { handle: 'therapyforblackgirls', reason: 'Niche mental health community — strong engagement' },
    { handle: 'woebot', reason: 'AI therapy chatbot — direct competitor in AI mental health' },
    { handle: 'wysa_buddy', reason: 'AI mental health app — similar product category' },
  ],
  fitness: [
    { handle: 'strava', reason: 'Leading running/cycling app — direct competitor' },
    { handle: 'nikerunning', reason: 'Major running brand with training content' },
    { handle: 'garmin', reason: 'GPS/fitness watches — running tech competitor' },
    { handle: 'coros', reason: 'GPS watch brand popular with runners' },
    { handle: 'tracksmith', reason: 'Premium running brand — aspirational content' },
    { handle: 'maurten_official', reason: 'Running nutrition brand — running community' },
    { handle: 'runkeeper', reason: 'Running tracking app — direct competitor' },
    { handle: 'therunexperience', reason: 'Running coaching content — engagement strategies to study' },
    { handle: 'runwithhal', reason: 'Running training plans — similar audience' },
    { handle: 'runnersworld', reason: 'Running media brand — content strategy to study' },
  ],
};

function getFallbackSuggestions(
  brandDescription: string,
  niche: string,
): Suggestion[] {
  const combined = `${brandDescription} ${niche}`.toLowerCase();

  const isWellness = matchesKeywords(combined, AFFECTLY_KEYWORDS);
  const isFitness = matchesKeywords(combined, PACEBRAIN_KEYWORDS);

  // Extract handles to exclude (own accounts + already tracked)
  const excludePattern = combined.match(/@[\w.]+/g) ?? [];
  const excludeHandles = new Set(excludePattern.map(h => h.replace('@', '').toLowerCase()));

  let suggestions: Suggestion[] = [];

  if (isWellness) {
    suggestions = [...NICHE_COMPETITORS.wellness];
  } else if (isFitness) {
    suggestions = [...NICHE_COMPETITORS.fitness];
  } else {
    // Mix of both
    suggestions = [...NICHE_COMPETITORS.wellness.slice(0, 5), ...NICHE_COMPETITORS.fitness.slice(0, 5)];
  }

  // Filter out excluded handles
  return suggestions.filter(s => !excludeHandles.has(s.handle.toLowerCase()));
}

const SUGGESTION_HANDLE_REGEX = /^[a-zA-Z0-9._]{1,100}$/;

// ---------------------------------------------------------------------------
// Web search-based competitor discovery (no API key needed)
// ---------------------------------------------------------------------------

async function searchForCompetitors(
  brandDescription: string,
  niche: string,
  excludeHandles: Set<string>,
): Promise<Suggestion[]> {
  const queries = [
    `site:instagram.com ${niche} app competitors`,
    `site:instagram.com ${niche} brand`,
    `site:instagram.com best ${niche} accounts to follow`,
  ];

  const allHandles = new Map<string, string>(); // handle → reason

  for (const query of queries) {
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        },
      );

      if (!res.ok) continue;

      const html = await res.text();

      // Extract instagram.com/handle patterns
      const matches = html.match(/instagram\.com\/([\w.]{2,50})/g) ?? [];
      for (const match of matches) {
        const handle = match.replace('instagram.com/', '').toLowerCase();
        // Skip common non-account pages
        if (['popular', 'explore', 'accounts', 'about', 'p', 'reel', 'stories', 'direct', 'developer'].includes(handle)) continue;
        if (excludeHandles.has(handle)) continue;
        if (!SUGGESTION_HANDLE_REGEX.test(handle)) continue;
        if (!allHandles.has(handle)) {
          allHandles.set(handle, `Found via search for "${niche}" accounts on Instagram`);
        }
      }
    } catch {
      // Search failed, continue with next query
    }

    // Small delay between searches
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return Array.from(allHandles.entries())
    .map(([handle, reason]) => ({ handle, reason }))
    .slice(0, 15);
}

async function callCerebras(
  brandDescription: string,
  niche: string,
): Promise<Suggestion[]> {
  const apiKey = process.env.CEREBUS;
  if (!apiKey) throw new Error('No Cerebras key');

  const safeBrand = brandDescription.trim().slice(0, 500).replace(/[`${}]/g, '');
  const safeNiche = niche.trim().slice(0, 100).replace(/[`${}]/g, '');
  const prompt = `You are an Instagram marketing expert. Given a brand that is: ${safeBrand} in the ${safeNiche} niche, suggest 10 real Instagram accounts that would be direct competitors. Mix of large and small accounts. Return ONLY a JSON array of objects with 'handle' (without @) and 'reason' (one sentence why they compete). No other text.`;

  const response = await fetch(
    'https://api.cerebras.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama3.1-8b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse OpenAI response as JSON array');
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed)) {
    throw new Error('OpenAI response is not an array');
  }

  return parsed
    .map((item: Record<string, unknown>) => ({
      handle: String(item.handle ?? '').replace(/^@/, ''),
      reason: String(item.reason ?? ''),
    }))
    .filter((item) => SUGGESTION_HANDLE_REGEX.test(item.handle));
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { brandDescription, niche } = body;

    if (
      typeof brandDescription !== 'string' ||
      !brandDescription.trim() ||
      typeof niche !== 'string' ||
      !niche.trim()
    ) {
      return NextResponse.json(
        { error: 'brandDescription and niche are required strings' },
        { status: 400 },
      );
    }

    // Build exclude list from the description (own handles + already tracked)
    const excludePattern = brandDescription.match(/@[\w.]+/g) ?? [];
    const excludeHandles = new Set(excludePattern.map(h => h.replace('@', '').toLowerCase()));

    // Step 1: Try Cerebras AI (platform key, no user key needed)
    if (process.env.CEREBUS) {
      try {
        console.log(`[Suggest] Using Cerebras AI for competitor discovery`);
        const aiSuggestions = await callCerebras(brandDescription.trim(), niche.trim());
        const filtered = aiSuggestions.filter(s => !excludeHandles.has(s.handle.toLowerCase()));
        if (filtered.length >= 3) {
          return NextResponse.json({ suggestions: filtered.slice(0, 10), source: 'ai' });
        }
      } catch (err) {
        console.error('[Suggest] Cerebras failed:', err instanceof Error ? err.message : err);
      }
    }

    // Step 2: Try web search
    console.log(`[Suggest] Falling back to web search`);
    const webResults = await searchForCompetitors(
      brandDescription.trim(),
      niche.trim(),
      excludeHandles,
    );

    if (webResults.length >= 5) {
      return NextResponse.json({ suggestions: webResults.slice(0, 10), source: 'web' });
    }

    // Step 3: Merge web + curated fallback
    const fallback = getFallbackSuggestions(brandDescription.trim(), niche.trim());
    const merged = [...webResults, ...fallback.filter(f => !webResults.find(w => w.handle === f.handle))];

    if (merged.length > 0) {
      return NextResponse.json({ suggestions: merged.slice(0, 10), source: 'web+curated' });
    }

    // Step 4: Pure fallback
    const suggestions = getFallbackSuggestions(
      brandDescription.trim(),
      niche.trim(),
    );
    return NextResponse.json({ suggestions, fallback: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to suggest competitors' },
      { status: 500 },
    );
  }
}
