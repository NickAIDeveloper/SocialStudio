import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { encrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const userId = await getUserId();

    const rows = await db
      .select({
        id: linkedAccounts.id,
        provider: linkedAccounts.provider,
        metadata: linkedAccounts.metadata,
        connectedAt: linkedAccounts.connectedAt,
      })
      .from(linkedAccounts)
      .where(eq(linkedAccounts.userId, userId));

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch linked accounts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { provider, accessToken } = await request.json();

    if (!provider || !accessToken) {
      return NextResponse.json(
        { error: 'Provider and accessToken are required' },
        { status: 400 }
      );
    }

    const VALID_PROVIDERS = ['buffer', 'pixabay', 'unsplash', 'pexels', 'openai_images'];

    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate the token against the provider API
    let metadata: Record<string, unknown> = {};

    if (provider === 'buffer') {
      const res = await fetch('https://api.buffer.com/user.json', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Invalid Buffer access token. Please check and try again.' },
          { status: 400 }
        );
      }

      const bufferUser = await res.json();
      metadata = { name: bufferUser.name, plan: bufferUser.plan };
    }

    if (provider === 'pixabay') {
      const res = await fetch(
        `https://pixabay.com/api/?key=${encodeURIComponent(accessToken)}&q=test&per_page=3`
      );

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Invalid Pixabay API key. Please check and try again.' },
          { status: 400 }
        );
      }

      const data = await res.json();
      if (!data.hits || !Array.isArray(data.hits)) {
        return NextResponse.json(
          { error: 'Invalid Pixabay API key. No results returned.' },
          { status: 400 }
        );
      }

      metadata = { totalHits: data.totalHits };
    }

    if (provider === 'unsplash') {
      const res = await fetch('https://api.unsplash.com/photos/random?count=1', {
        headers: { Authorization: `Client-ID ${accessToken}` },
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Invalid Unsplash access key. Please check and try again.' },
          { status: 400 }
        );
      }

      metadata = { validated: true };
    }

    if (provider === 'pexels') {
      const res = await fetch('https://api.pexels.com/v1/search?query=test&per_page=1', {
        headers: { Authorization: accessToken },
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Invalid Pexels API key. Please check and try again.' },
          { status: 400 }
        );
      }

      metadata = { validated: true };
    }

    if (provider === 'openai_images') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Invalid OpenAI API key. Please check and try again.' },
          { status: 400 }
        );
      }

      metadata = { validated: true };
    }

    const encryptedToken = encrypt(accessToken);
    const now = new Date();

    await db
      .insert(linkedAccounts)
      .values({
        userId,
        provider,
        accessToken: encryptedToken,
        metadata,
        connectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [linkedAccounts.userId, linkedAccounts.provider],
        set: {
          accessToken: encryptedToken,
          metadata,
          updatedAt: now,
        },
      });

    return NextResponse.json({
      success: true,
      data: { provider, metadata, connectedAt: now },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to link account' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { provider } = await request.json();

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      );
    }

    const VALID_PROVIDERS = ['buffer', 'pixabay', 'unsplash', 'pexels', 'openai_images'];
    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider' },
        { status: 400 }
      );
    }

    await db
      .delete(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.provider, provider)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to unlink account' },
      { status: 500 }
    );
  }
}
