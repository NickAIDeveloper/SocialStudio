// src/app/api/ads/list/route.ts
// GET /api/ads/list — returns the user's queued Meta ads (up to 50, newest
// first) enriched with best-effort live effective_status and an Ads Manager
// deep-link. Never 500s because of a Meta API failure.
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { getAdStatuses, buildAdsManagerUrl } from '@/lib/meta/ads';

export const dynamic = 'force-dynamic';

interface AdDraftShape {
  headline?: string;
  primaryText?: string;
  mediaType?: string;
  [key: string]: unknown;
}

export async function GET() {
  try {
    const userId = await getUserId();

    // Load the user's ad rows (newest first, capped at 50).
    const rows = await db
      .select({
        id: metaAds.id,
        brandId: metaAds.brandId,
        adAccountId: metaAds.adAccountId,
        campaignId: metaAds.campaignId,
        adId: metaAds.adId,
        objective: metaAds.objective,
        status: metaAds.status,
        draft: metaAds.draft,
        lastError: metaAds.lastError,
        createdAt: metaAds.createdAt,
      })
      .from(metaAds)
      .where(eq(metaAds.userId, userId))
      .orderBy(desc(metaAds.createdAt))
      .limit(50);

    // Best-effort live status enrichment.
    let statuses: Record<string, string | null> = {};
    try {
      const [account] = await db
        .select({
          accessToken: metaAccounts.accessToken,
          tokenExpiresAt: metaAccounts.tokenExpiresAt,
        })
        .from(metaAccounts)
        .where(eq(metaAccounts.userId, userId))
        .limit(1);

      if (account && !(account.tokenExpiresAt && account.tokenExpiresAt <= new Date())) {
        const token = decrypt(account.accessToken);
        // Only query ads that have a real adId; cap at 25 to stay within rate limits.
        const adIds = rows
          .filter((r) => r.adId != null)
          .slice(0, 25)
          .map((r) => r.adId as string);

        if (adIds.length > 0) {
          statuses = await getAdStatuses(token, adIds);
        }
      }
    } catch {
      // Best-effort — never 500 the list because of a Meta failure.
      statuses = {};
    }

    const ads = rows.map((row) => {
      const draft = (row.draft ?? null) as AdDraftShape | null;
      return {
        id: row.id,
        objective: row.objective,
        status: row.status,
        liveStatus: row.adId != null ? (statuses[row.adId] ?? null) : null,
        createdAt: row.createdAt,
        adsManagerUrl:
          row.campaignId != null
            ? buildAdsManagerUrl(row.adAccountId, row.campaignId)
            : null,
        headline: draft?.headline ?? null,
        primaryText: (draft?.primaryText ?? '').slice(0, 160),
        mediaType: draft?.mediaType ?? 'image',
        lastError: row.lastError,
      };
    });

    return NextResponse.json({ success: true, ads });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch ads' }, { status: 500 });
  }
}
