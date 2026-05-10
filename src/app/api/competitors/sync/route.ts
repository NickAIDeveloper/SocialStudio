// src/app/api/competitors/sync/route.ts
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  metaAccounts,
  scrapedAccounts,
  scrapedPosts,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { syncCompetitors } from '@/lib/competitors/sync-competitors';
import { decrypt } from '@/lib/encryption';
import type { ParsedScrapedPost } from '@/lib/competitors/business-discovery';

export const dynamic = 'force-dynamic';

interface MetaAssets {
  igAccounts?: { id: string; username?: string }[];
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });
  if (!brand.instagramHandle) {
    return NextResponse.json({ status: 'skipped', reason: 'no_ig_handle' });
  }

  // Business Discovery requires the FB-linked IG Business Account path:
  // - Token: FB user access token (from metaAccounts) with instagram_basic
  // - IG ID: the FB-Page-linked IG Business Account ID (from assets.igAccounts)
  // The Instagram Login for Business path (instagramAccounts table) does NOT
  // support business_discovery — Meta only exposes it via the FB Graph API.
  const [meta] = await db
    .select()
    .from(metaAccounts)
    .where(eq(metaAccounts.userId, brand.userId));
  if (!meta) {
    return NextResponse.json({ status: 'skipped', reason: 'no_fb_token' });
  }
  const assets = (meta.assets ?? {}) as MetaAssets;
  const igAccounts = assets.igAccounts ?? [];
  // Match by username if possible, otherwise take the first IG account.
  const igMatch =
    igAccounts.find(
      (a) => a.username?.toLowerCase() === brand.instagramHandle?.toLowerCase()
    ) ?? igAccounts[0];
  if (!igMatch) {
    return NextResponse.json({ status: 'skipped', reason: 'no_fb_linked_ig' });
  }

  const competitors = await db
    .select({ id: scrapedAccounts.id, handle: scrapedAccounts.handle })
    .from(scrapedAccounts)
    .where(
      and(
        eq(scrapedAccounts.brandId, brandId),
        eq(scrapedAccounts.isCompetitor, true)
      )
    );

  const result = await syncCompetitors({
    brandId,
    igUserId: igMatch.id,
    accessToken: decrypt(meta.accessToken),
    competitors,
    upsertPosts: async (accountId, _handle, posts: ParsedScrapedPost[]) => {
      for (const p of posts) {
        await db
          .insert(scrapedPosts)
          .values({
            userId: brand.userId,
            accountId,
            shortcode: p.shortcode,
            caption: p.caption,
            likes: p.likes,
            comments: p.comments,
            imageUrl: p.imageUrl,
            isVideo: p.isVideo,
            hashtags: p.hashtags,
            postedAt: p.postedAt,
            mediaType: p.mediaType,
            permalink: p.permalink,
          })
          .onConflictDoUpdate({
            target: [scrapedPosts.userId, scrapedPosts.shortcode],
            set: {
              likes: p.likes,
              comments: p.comments,
              caption: p.caption,
              hashtags: p.hashtags,
              scrapedAt: new Date(),
            },
          });
      }
    },
    updateAccountMeta: async (accountId, meta) => {
      await db
        .update(scrapedAccounts)
        .set({
          followerCount: meta.followerCount,
          postCount: meta.postCount,
          lastScrapedAt: new Date(),
        })
        .where(eq(scrapedAccounts.id, accountId));
    },
  });

  return NextResponse.json(result);
}
