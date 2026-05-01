import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { encrypt } from '@/lib/encryption';
import { getOrganizationsAndChannels } from '@/lib/buffer';

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

    const VALID_PROVIDERS = ['buffer', 'pixabay', 'unsplash', 'pexels', 'gemini_images'];

    if (!VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate the token against the provider API
    let metadata: Record<string, unknown> = {};

    if (provider === 'buffer') {
      // Buffer's legacy v1 REST endpoints (e.g. /user.json) reject modern OAuth
      // tokens that work fine against the GraphQL API — they 400 with
      // "Unsupported Content-Type", causing valid tokens to be flagged invalid.
      // Validate via the same GraphQL probe the rest of the app uses.
      try {
        const orgs = await getOrganizationsAndChannels(accessToken);
        metadata = {
          organizations: orgs.length,
          channelCount: orgs.reduce((sum, o) => sum + (o.channels?.length ?? 0), 0),
          organizationNames: orgs.map((o) => o.name),
        };
      } catch {
        return NextResponse.json(
          { error: 'Invalid Buffer access token. Please check and try again.' },
          { status: 400 }
        );
      }
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

    if (provider === 'gemini_images') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(accessToken)}`);

      if (!res.ok) {
        return NextResponse.json(
          { error: 'Invalid Gemini API key. Please check and try again.' },
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

    const VALID_PROVIDERS = ['buffer', 'pixabay', 'unsplash', 'pexels', 'gemini_images'];
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
