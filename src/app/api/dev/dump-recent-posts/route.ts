import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { brands, posts } from '@/lib/db/schema';
import { normalizeImageUrlForDedup } from '@/lib/smart-posts/url-dedup';

// One-shot dev diagnostic: dump recent posts per brand for the logged-in
// user, including raw + normalised image URLs. Used to debug "same photo
// keeps being picked" by surfacing whether the duplicate is URL-identical,
// path-identical (signed-URL variation), or truly cross-source same-photo.
//
// Hit /api/dev/dump-recent-posts in your browser while logged in.
export async function GET(_req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ownedBrands = await db.select().from(brands).where(eq(brands.userId, userId));

  const result = [];
  for (const brand of ownedBrands) {
    const rows = await db
      .select({
        id: posts.id,
        createdAt: posts.createdAt,
        source: posts.source,
        status: posts.status,
        sourceImageUrl: posts.sourceImageUrl,
        processedImageUrl: posts.processedImageUrl,
        hookText: posts.hookText,
      })
      .from(posts)
      .where(eq(posts.brandId, brand.id))
      .orderBy(desc(posts.createdAt))
      .limit(20);

    // Group by normalised source URL so we can spot exact-path repeats.
    const byPath = new Map<string, number>();
    for (const r of rows) {
      if (r.sourceImageUrl) {
        const p = normalizeImageUrlForDedup(r.sourceImageUrl);
        byPath.set(p, (byPath.get(p) ?? 0) + 1);
      }
    }
    const pathCollisions = Array.from(byPath.entries())
      .filter(([, n]) => n > 1)
      .map(([path, n]) => ({ path, count: n }));

    result.push({
      brand: { id: brand.id, slug: brand.slug, name: brand.name },
      recent_posts_count: rows.length,
      path_collisions: pathCollisions,
      recent: rows.map((r) => ({
        createdAt: r.createdAt?.toISOString() ?? null,
        source: r.source,
        status: r.status,
        hookText: r.hookText?.slice(0, 60) ?? null,
        sourceImageUrl: r.sourceImageUrl,
        sourceNormalized: r.sourceImageUrl
          ? normalizeImageUrlForDedup(r.sourceImageUrl)
          : null,
        sourceDomain: r.sourceImageUrl
          ? (() => {
              try {
                return new URL(r.sourceImageUrl).hostname;
              } catch {
                return null;
              }
            })()
          : null,
      })),
    });
  }

  return NextResponse.json({ userId, brands: result });
}
