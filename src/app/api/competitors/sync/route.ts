// src/app/api/competitors/sync/route.ts
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  instagramAccounts,
  scrapedAccounts,
  scrapedPosts,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { syncCompetitors } from '@/lib/competitors/sync-competitors';
import { decrypt } from '@/lib/encryption';
import type { ParsedScrapedPost } from '@/lib/competitors/business-discovery';

export const dynamic = 'force-dynamic';

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

  const [igAcct] = await db
    .select()
    .from(instagramAccounts)
    .where(
      and(
        eq(instagramAccounts.userId, brand.userId),
        eq(instagramAccounts.igUsername, brand.instagramHandle)
      )
    );
  if (!igAcct) return NextResponse.json({ status: 'skipped', reason: 'no_ig_token' });

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
    igUserId: igAcct.igUserId,
    accessToken: decrypt(igAcct.accessToken),
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
