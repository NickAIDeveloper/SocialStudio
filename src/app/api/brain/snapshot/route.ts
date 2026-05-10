import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  instagramAccounts,
  metaAccounts,
  scrapedAccounts,
  brainSnapshots,
  metaInsightsCache,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { snapshotIg } from '@/lib/brain/snapshot-ig';
import { snapshotAds } from '@/lib/brain/snapshot-ads';
import { snapshotCompetitor } from '@/lib/brain/snapshot-competitor';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

interface Body {
  runId: string;
  day: string;
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  const source = searchParams.get('source');
  if (!brandId || !source) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as Body;
  const dayDate = new Date(`${body.day}T00:00:00Z`);

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  // --- IG ---
  if (source === 'ig') {
    if (!brand.instagramHandle) {
      return NextResponse.json({ status: 'skipped', reason: 'no_ig_handle' });
    }
    const [igAcct] = await db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.userId, brand.userId),
          eq(instagramAccounts.igUsername, brand.instagramHandle)
        )
      );
    if (!igAcct) {
      return NextResponse.json({ status: 'skipped', reason: 'no_connection' });
    }

    const result = await snapshotIg({
      brandId,
      userId: brand.userId,
      igUserId: igAcct.igUserId,
      accessToken: decrypt(igAcct.accessToken),
      day: body.day,
      cacheRead: async (key) => {
        const [row] = await db
          .select()
          .from(metaInsightsCache)
          .where(
            and(
              eq(metaInsightsCache.userId, brand.userId),
              eq(metaInsightsCache.cacheKey, key)
            )
          );
        if (!row) return null;
        if (row.expiresAt.getTime() < Date.now()) return null;
        return row.data as { media: unknown[]; insightsByMediaId: Record<string, unknown> };
      },
      cacheWrite: async (key, value) => {
        await db
          .insert(metaInsightsCache)
          .values({
            userId: brand.userId,
            adAccountId: 'ig',
            cacheKey: key,
            data: value as Record<string, unknown>,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          })
          .onConflictDoUpdate({
            target: [
              metaInsightsCache.userId,
              metaInsightsCache.adAccountId,
              metaInsightsCache.cacheKey,
            ],
            set: { data: value as Record<string, unknown>, fetchedAt: new Date() },
          });
      },
      persist: async (payload) => {
        await db
          .insert(brainSnapshots)
          .values({
            brandId,
            source: 'ig',
            capturedAt: dayDate,
            payload: payload as Record<string, unknown>,
            metricsSummary: { sampleSize: payload.media.length },
          })
          .onConflictDoNothing();
      },
    });

    return NextResponse.json(result);
  }

  // --- ADS ---
  if (source === 'ads') {
    const [meta] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, brand.userId));
    if (!meta) return NextResponse.json({ status: 'skipped', reason: 'no_connection' });

    const result = await snapshotAds({
      brandId,
      adAccountId: meta.selectedAdAccountId,
      accessToken: decrypt(meta.accessToken),
      day: body.day,
      persist: async (payload) => {
        await db
          .insert(brainSnapshots)
          .values({
            brandId,
            source: 'ads',
            capturedAt: dayDate,
            payload: payload as Record<string, unknown>,
            metricsSummary: { hasCampaigns: payload.hasCampaigns },
          })
          .onConflictDoNothing();
      },
    });
    return NextResponse.json(result);
  }

  // --- COMPETITOR_ACCOUNT ---
  if (source === 'competitor_account') {
    const competitors = await db
      .select({
        id: scrapedAccounts.id,
        handle: scrapedAccounts.handle,
        followerCount: scrapedAccounts.followerCount,
        postCount: scrapedAccounts.postCount,
      })
      .from(scrapedAccounts)
      .where(
        and(
          eq(scrapedAccounts.brandId, brandId),
          eq(scrapedAccounts.isCompetitor, true)
        )
      );

    const result = await snapshotCompetitor({
      brandId,
      competitors,
      persist: async (payload) => {
        await db
          .insert(brainSnapshots)
          .values({
            brandId,
            source: 'competitor_account',
            capturedAt: dayDate,
            payload: payload as Record<string, unknown>,
            metricsSummary: { count: payload.competitors.length },
          })
          .onConflictDoNothing();
      },
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'unknown_source' }, { status: 400 });
}
