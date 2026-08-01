// GET  /api/research/view?brandId=…  → stored pain points for a brand
// POST /api/research/view?brandId=…&site=… → refresh them now
//
// Session-authenticated UI companion to /api/research/pain-points (which is
// HMAC-only, for the cron). Same pipeline, different door: the cron route must
// not accept a session and this must not accept an HMAC.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, brandPainPoints } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { fetchStackExchangeDiscussions, SOURCE_SITES, type Discussion } from '@/lib/research/sources';
import { extractPainMentions } from '@/lib/research/extract-pains';
import { canonicaliseThemes } from '@/lib/research/canonicalise';
import { rankPainPoints, MIN_MENTIONS_TO_TRUST } from '@/lib/research/pain-points';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function ownedBrand(userId: string, brandId: string | null) {
  if (!brandId) return null;
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, userId)));
  return brand ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const brand = await ownedBrand(userId, new URL(req.url).searchParams.get('brandId'));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  const [row] = await db
    .select()
    .from(brandPainPoints)
    .where(eq(brandPainPoints.brandId, brand.id));

  return NextResponse.json({
    researched: Boolean(row),
    source: row?.source ?? null,
    queries: row?.queries ?? null,
    discussionsScanned: row?.discussionsScanned ?? 0,
    fetchedAt: row?.fetchedAt ?? null,
    ranked: row?.ranked ?? [],
    minMentionsToTrust: MIN_MENTIONS_TO_TRUST,
    sites: Object.entries(SOURCE_SITES).map(([key, v]) => ({ key, label: v.label })),
  });
}

export async function POST(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brand = await ownedBrand(userId, searchParams.get('brandId'));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  const site = searchParams.get('site') ?? 'fitness';
  if (!SOURCE_SITES[site]) return NextResponse.json({ error: 'unknown_site' }, { status: 400 });

  const seed = (brand.name ?? brand.slug).toLowerCase();
  const queries = [`${seed} plan`, `${seed} progress`, `${seed} plateau`, `${seed} motivation`];

  const collected: Discussion[] = [];
  for (const q of queries) collected.push(...(await fetchStackExchangeDiscussions(q, site)));
  const seen = new Set<string>();
  const unique = collected.filter(d => d.permalink && !seen.has(d.permalink) && seen.add(d.permalink));

  if (unique.length === 0) {
    return NextResponse.json({ error: 'no_discussions', message: 'That community returned nothing for this brand.' }, { status: 422 });
  }

  const mentions = await extractPainMentions(unique.slice(0, 40));
  if (mentions.length === 0) {
    return NextResponse.json({ error: 'no_pains', message: 'Found discussions but no clear frustrations. Try a different community.' }, { status: 422 });
  }

  const ranked = rankPainPoints(await canonicaliseThemes(mentions));
  await db
    .insert(brandPainPoints)
    .values({ brandId: brand.id, source: `stackexchange:${site}`, queries, discussionsScanned: unique.length, ranked, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: brandPainPoints.brandId,
      set: { source: `stackexchange:${site}`, queries, discussionsScanned: unique.length, ranked, fetchedAt: new Date() },
    });

  return NextResponse.json({ status: 'ok', scanned: unique.length, ranked });
}
