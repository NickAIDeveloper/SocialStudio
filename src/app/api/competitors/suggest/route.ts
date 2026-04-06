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
];

const PACEBRAIN_KEYWORDS = [
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
];

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function getFallbackSuggestions(
  brandDescription: string,
  niche: string,
): Suggestion[] {
  const combined = `${brandDescription} ${niche}`;

  const isAffectly = matchesKeywords(combined, AFFECTLY_KEYWORDS);
  const isPacebrain = matchesKeywords(combined, PACEBRAIN_KEYWORDS);

  let filtered = hardcodedCompetitors;

  if (isAffectly && !isPacebrain) {
    filtered = hardcodedCompetitors.filter((c) => c.brand === 'affectly');
  } else if (isPacebrain && !isAffectly) {
    filtered = hardcodedCompetitors.filter((c) => c.brand === 'pacebrain');
  }

  return filtered.map((c) => ({
    handle: c.handle.replace(/^@/, ''),
    reason: 'Popular account in your niche',
  }));
}

async function callOpenAI(
  apiKey: string,
  brandDescription: string,
  niche: string,
): Promise<Suggestion[]> {
  const prompt = `You are an Instagram marketing expert. Given a brand that is: ${brandDescription} in the ${niche} niche, suggest 8 Instagram accounts that would be direct competitors. Return ONLY a JSON array of objects with 'handle' (without @) and 'reason' (one sentence why they compete). No other text.`;

  const response = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
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

  return parsed.map((item: Record<string, unknown>) => ({
    handle: String(item.handle ?? '').replace(/^@/, ''),
    reason: String(item.reason ?? ''),
  }));
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

    // Check if user has an OpenAI key linked
    const openaiAccounts = await db
      .select({ accessToken: linkedAccounts.accessToken })
      .from(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.provider, 'openai_images'),
        ),
      );

    const hasOpenAIKey =
      openaiAccounts.length > 0 && openaiAccounts[0].accessToken;

    if (hasOpenAIKey) {
      try {
        const decryptedKey = decrypt(openaiAccounts[0].accessToken!);
        const suggestions = await callOpenAI(
          decryptedKey,
          brandDescription.trim(),
          niche.trim(),
        );
        return NextResponse.json({ suggestions });
      } catch {
        // If OpenAI fails, fall back to hardcoded list
        const suggestions = getFallbackSuggestions(
          brandDescription.trim(),
          niche.trim(),
        );
        return NextResponse.json({ suggestions, fallback: true });
      }
    }

    // No OpenAI key — use fallback
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
