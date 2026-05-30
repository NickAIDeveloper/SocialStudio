import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { db } from '@/lib/db';
import { brands, linkedAccounts, posts, users } from '@/lib/db/schema';
import { decrypt } from '@/lib/encryption';
import { searchImages as pixabaySearch, brandCategories, suggestedQueries } from '@/lib/pixabay';

// One-shot diagnostic for "no_images" autopilot failures.
// Walks the exact same path /api/images uses and reports where it dies for
// every brand belonging to the target user. Dual auth: session (browser) OR
// HMAC with userId in body (server-side debugging without cookie handoff).
export async function GET(req: NextRequest) {
  let targetUserId: string | null = null;

  const sigHeader = req.headers.get('x-brain-signature');
  if (sigHeader) {
    if (!(await verifyBrainSignature(req, ''))) {
      return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
    }
    const uidParam = req.nextUrl.searchParams.get('userId');
    const emailParam = req.nextUrl.searchParams.get('email');
    if (uidParam) {
      targetUserId = uidParam;
    } else if (emailParam) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, emailParam)).limit(1);
      if (!u) {
        return NextResponse.json(
          { error: 'user_not_found_for_email', email: emailParam },
          { status: 404 },
        );
      }
      targetUserId = u.id;
    } else {
      return NextResponse.json(
        { error: 'userId_or_email_required', message: 'userId or email query param required with HMAC.' },
        { status: 400 },
      );
    }
  } else {
    const session = await auth();
    targetUserId = session?.user?.id ?? null;
    if (!targetUserId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const sessionUserId = targetUserId;

  const ownedBrands = await db.select().from(brands).where(eq(brands.userId, sessionUserId));
  if (ownedBrands.length === 0) {
    return NextResponse.json({ error: 'no_brands_for_user', userId: sessionUserId }, { status: 404 });
  }

  type ProviderReport = {
    provider: string;
    row_exists: boolean;
    has_access_token: boolean;
    decrypt: 'success' | 'failed' | 'skipped';
    decrypt_error?: string;
    pixabay_search_status?: 'ok' | 'failed';
    pixabay_search_error?: string;
    pixabay_total_hits?: number;
    pixabay_returned?: number;
    pixabay_unused_after_no_reuse?: number;
  };

  const providers = ['pixabay', 'unsplash', 'pexels'] as const;

  // Provider lookups are user-scoped, so we only do them once and reuse the
  // result for every brand the user owns.
  const userProviderState = await Promise.all(
    providers.map(async (provider) => {
      const [account] = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.userId, sessionUserId), eq(linkedAccounts.provider, provider)))
        .limit(1);

      let decryptedKey: string | null = null;
      let decryptStatus: 'success' | 'failed' | 'skipped' = 'skipped';
      let decryptError: string | undefined;
      if (account?.accessToken) {
        try {
          decryptedKey = decrypt(account.accessToken);
          decryptStatus = 'success';
        } catch (err) {
          decryptStatus = 'failed';
          decryptError = err instanceof Error ? err.message : String(err);
        }
      }

      return {
        provider,
        rowExists: Boolean(account),
        hasAccessToken: Boolean(account?.accessToken),
        decryptStatus,
        decryptError,
        decryptedKey,
      };
    }),
  );

  const brandReports = [];
  for (const brand of ownedBrands) {
    // Build the brand's all-time used-image set (same logic as generate.ts:447-459).
    const allImageRows = await db
      .select({
        src: posts.sourceImageUrl,
        processed: posts.processedImageUrl,
      })
      .from(posts)
      .where(eq(posts.brandId, brand.id));

    const usedUrls = new Set<string>();
    for (const r of allImageRows) {
      if (r.src) usedUrls.add(r.src);
      if (r.processed) usedUrls.add(r.processed);
    }

    const report: ProviderReport[] = [];
    for (const state of userProviderState) {
      const entry: ProviderReport = {
        provider: state.provider,
        row_exists: state.rowExists,
        has_access_token: state.hasAccessToken,
        decrypt: state.decryptStatus,
        decrypt_error: state.decryptError,
      };

      // Only Pixabay is wired into the live search probe — Unsplash/Pexels
      // would need their own SDK calls and aren't typically the failing path.
      if (state.provider === 'pixabay' && state.decryptedKey) {
        const brandQueries = suggestedQueries[brand.slug as keyof typeof suggestedQueries] ?? [];
        const category = brandCategories[brand.slug] ?? 'lifestyle';
        const probeQuery = brandQueries[0] ?? category;

        try {
          const data = await pixabaySearch(state.decryptedKey, probeQuery, { perPage: 50 });
          const returnedUrls = (data.hits || [])
            .map((h) => h.largeImageURL)
            .filter((u): u is string => Boolean(u));
          const unused = returnedUrls.filter((u) => !usedUrls.has(u));
          entry.pixabay_search_status = 'ok';
          entry.pixabay_total_hits = data.totalHits;
          entry.pixabay_returned = returnedUrls.length;
          entry.pixabay_unused_after_no_reuse = unused.length;
        } catch (err) {
          entry.pixabay_search_status = 'failed';
          entry.pixabay_search_error = err instanceof Error ? err.message : String(err);
        }
      }

      report.push(entry);
    }

    brandReports.push({
      brand: { id: brand.id, slug: brand.slug, name: brand.name },
      no_reuse_pool_size: usedUrls.size,
      providers: report,
    });
  }

  return NextResponse.json({
    user_id: sessionUserId,
    brands: brandReports,
    hint: {
      decrypt_failed_anywhere:
        'ENCRYPTION_KEY env var was likely rotated since the key was stored — reconnect that provider in Settings.',
      pixabay_search_failed:
        'Pixabay API rejected the key (revoked / rate-limited / invalid). Disconnect and reconnect in Settings.',
      pixabay_unused_zero:
        'Pool exhausted — every popular Pixabay result for this brand is already used. Need broader queries OR a 2nd provider OR a rolling-window reset.',
    },
  });
}
