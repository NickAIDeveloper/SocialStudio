import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';

export async function POST(request: NextRequest) {
  try {
    await getUserId();
    if (!isCerebrasAvailable()) return NextResponse.json({ error: 'AI not available' }, { status: 503 });
    const { text } = await request.json();
    if (!text || typeof text !== 'string' || text.trim().length < 5) return NextResponse.json({ error: 'Enter a brief description first' }, { status: 400 });
    const result = await cerebrasChatCompletion([{ role: 'user', content: `Rewrite this brand description to be professional and compelling for an Instagram brand. Keep it to 2-3 sentences. Return ONLY the rewritten text.\n\nOriginal: ${text.trim().slice(0, 500)}` }], { temperature: 0.7, maxTokens: 200 });
    return NextResponse.json({ text: result.trim() });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[Rewrite] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Rewrite failed' }, { status: 500 });
  }
}
