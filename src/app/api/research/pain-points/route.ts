// POST /api/research/pain-points?brandId=<id>&site=<stackexchange site>
//
// Mines a public community for what this brand's audience actually complains
// about, ranks the pains by recurrence, and stores them for injection into
// caption and ad generation.
//
// HMAC-authenticated so the daily cron can refresh it. MUST stay listed in the
// src/middleware.ts matcher exclusions or this returns a silent 405 — see
// src/__tests__/middleware-cron-routes.test.ts.
//
// Fails soft throughout: a dead third-party API or a bad model response leaves
// the previous pain points in place rather than wiping them, because stale
// research beats none.

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, brandPainPoints } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { fetchStackExchangeDiscussions, SOURCE_SITES, type Discussion } from '@/lib/research/sources';
import { extractPainMentions } from '@/lib/research/extract-pains';
import { canonicaliseThemes } from '@/lib/research/canonicalise';
import { rankPainPoints } from '@/lib/research/pain-points';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Cap the model input: extraction quality drops and cost rises well before the
// full result set is useful.
const MAX_DISCUSSIONS = 40;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  const site = searchParams.get('site') ?? 'fitness';
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });
  if (!SOURCE_SITES[site]) {
    return NextResponse.json(
      { error: 'unknown_site', supported: Object.keys(SOURCE_SITES) },
      { status: 400 },
    );
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  // Queries come from the brand's own words. Broad queries pull in unrelated
  // communities whose pains genuinely don't recur together, which is what
  // produced an all-n=1 result on the first live run.
  const seed = (brand.name ?? brand.slug).toLowerCase();
  const queries = [
    `${seed} plan`,
    `${seed} progress`,
    `${seed} plateau`,
    `${seed} motivation`,
  ];

  const collected: Discussion[] = [];
  for (const q of queries) {
    collected.push(...(await fetchStackExchangeDiscussions(q, site)));
  }
  const seen = new Set<string>();
  const unique = collected.filter(d => d.permalink && !seen.has(d.permalink) && seen.add(d.permalink));

  if (unique.length === 0) {
    return NextResponse.json({ status: 'skipped', reason: 'no_discussions', queries });
  }

  const mentions = await extractPainMentions(unique.slice(0, MAX_DISCUSSIONS));
  if (mentions.length === 0) {
    // Keep whatever was stored before — stale research beats none.
    return NextResponse.json({ status: 'skipped', reason: 'no_pains_extracted', scanned: unique.length });
  }

  const merged = await canonicaliseThemes(mentions);
  const ranked = rankPainPoints(merged);

  await db
    .insert(brandPainPoints)
    .values({
      brandId,
      source: `stackexchange:${site}`,
      queries,
      discussionsScanned: unique.length,
      ranked,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: brandPainPoints.brandId,
      set: {
        source: `stackexchange:${site}`,
        queries,
        discussionsScanned: unique.length,
        ranked,
        fetchedAt: new Date(),
      },
    });

  return NextResponse.json({
    status: 'ok',
    scanned: unique.length,
    mentions: mentions.length,
    themes: ranked.length,
    trusted: ranked.filter(p => p.trusted).length,
    top: ranked.slice(0, 5).map(p => ({ theme: p.theme, mentions: p.mentions, trusted: p.trusted })),
  });
}
