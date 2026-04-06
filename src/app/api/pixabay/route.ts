import { NextRequest, NextResponse } from 'next/server';
import { searchImages } from '@/lib/pixabay';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { db } from '@/lib/db';
import { linkedAccounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();

    const [pixabayAccount] = await db
      .select()
      .from(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.provider, 'pixabay')
        )
      )
      .limit(1);

    if (!pixabayAccount?.accessToken) {
      return NextResponse.json(
        { error: 'Pixabay not connected. Go to Settings to link your account.' },
        { status: 403 }
      );
    }

    let pixabayApiKey: string;
    try {
      pixabayApiKey = decrypt(pixabayAccount.accessToken);
    } catch {
      return NextResponse.json(
        { error: 'Your Pixabay connection needs to be refreshed. Please disconnect and reconnect in Settings.' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1');
    const orientation = (searchParams.get('orientation') || 'all') as 'all' | 'horizontal' | 'vertical';
    const category = searchParams.get('category') || undefined;

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const results = await searchImages(pixabayApiKey, query, {
      page,
      orientation,
      category: category || undefined,
      perPage: 30,
      minWidth: 800,
      minHeight: 800,
      order: 'popular',
    });

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Pixabay search error:', error);
    return NextResponse.json(
      { error: 'Failed to search images' },
      { status: 500 }
    );
  }
}
