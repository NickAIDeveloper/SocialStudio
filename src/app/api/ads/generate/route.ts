import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { readBrandBrain } from '@/lib/brain/consume';
import { buildCompetitorIntel } from '@/lib/brain/competitor-intel';
import { buildAdDraft } from '@/lib/ads/build-draft';
import { generateAdCopy } from '@/lib/ads/ad-copy';
import { summarizeCompetitorIntel } from '@/lib/ads/competitor-summary';
import { OBJECTIVE_CONFIG, type AdObjective } from '@/lib/meta/ads-types';

export const maxDuration = 60;

function isObjective(v: unknown): v is AdObjective {
  return v === 'TRAFFIC' || v === 'ENGAGEMENT' || v === 'LEADS' || v === 'APP';
}

// Derive a query and fetch on-topic image URLs using the existing pipeline.
async function pickImages(args: {
  origin: string; cookie: string; brandName: string; brandDescription: string;
  caption: string; hookText: string; contentType: string;
}): Promise<{ chosen: string | null; candidates: string[] }> {
  const pickRes = await fetch(`${args.origin}/api/images/pick`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: args.cookie },
    body: JSON.stringify({
      caption: args.caption, hookText: args.hookText, contentType: args.contentType,
      brand: args.brandName, brandDescription: args.brandDescription,
    }),
  });
  if (!pickRes.ok) return { chosen: null, candidates: [] };
  const { searchTerm } = (await pickRes.json()) as { searchTerm?: string };
  if (!searchTerm) return { chosen: null, candidates: [] };

  const pxRes = await fetch(`${args.origin}/api/pixabay?q=${encodeURIComponent(searchTerm)}&orientation=horizontal`, {
    headers: { cookie: args.cookie },
  });
  if (!pxRes.ok) return { chosen: null, candidates: [] };
  const { hits } = (await pxRes.json()) as { hits?: Array<{ webformatURL?: string }> };
  const candidates = (hits ?? [])
    .map((h) => h.webformatURL)
    .filter((url): url is string => Boolean(url))
    .slice(0, 8);
  const chosen = candidates[0] ?? null;
  return { chosen, candidates };
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = (await request.json()) as {
      brandId?: string; objective?: string; destinationUrl?: string;
      applicationId?: string;
    };

    if (!body.brandId) {
      return NextResponse.json({ error: 'brandId_required' }, { status: 400 });
    }
    if (!isObjective(body.objective)) {
      return NextResponse.json({ error: 'invalid_objective' }, { status: 400 });
    }
    if (!body.destinationUrl || !/^https?:\/\//.test(body.destinationUrl)) {
      return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
    }

    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, body.brandId), eq(brands.userId, userId)))
      .limit(1);
    if (!brand) {
      return NextResponse.json({ error: 'brand_not_found' }, { status: 403 });
    }

    const cfg = OBJECTIVE_CONFIG[body.objective];
    const origin = request.nextUrl.origin;
    const cookie = request.headers.get('cookie') ?? '';

    const [brain, intel] = await Promise.all([
      readBrandBrain(body.brandId).catch(() => null),
      buildCompetitorIntel(body.brandId).catch(() => null),
    ]);
    const competitorContext = summarizeCompetitorIntel(intel);

    let copy;
    try {
      copy = await generateAdCopy({
        brand: {
          name: brand.name ?? brand.slug,
          slug: brand.slug,
          description: brand.description ?? null,
          websiteUrl: brand.websiteUrl ?? null,
        },
        objective: body.objective,
        destinationUrl: body.destinationUrl,
        briefMd: brain?.briefMd ?? null,
        competitorContext,
      });
    } catch (genErr) {
      const message = genErr instanceof Error ? genErr.message : 'Copy generation failed';
      return NextResponse.json({ error: 'caption_failed', message: message.slice(0, 200) }, { status: 502 });
    }
    // Adapt the premium copy into the CaptionResult shape buildAdDraft expects.
    const caption = {
      caption: copy.primaryText,
      hashtags: copy.hashtags.join(' '),
      hookText: copy.hook,
    };

    const { chosen, candidates } = await pickImages({
      origin, cookie,
      brandName: brand.name ?? brand.slug,
      brandDescription: brand.description ?? '',
      caption: caption.caption, hookText: caption.hookText,
      contentType: cfg.captionContentType,
    });

    // Interest suggestions: simple keywords from the brand name. The user edits
    // these in Step 3.
    const interestSuggestions = [brand.name ?? brand.slug]
      .filter(Boolean)
      .map((s) => String(s));

    // For APP objective, treat destinationUrl as the App Store URL so that
    // the publish route can wire it into promoted_object correctly.
    const isApp = body.objective === 'APP';
    const draft = buildAdDraft({
      objective: body.objective,
      destinationUrl: body.destinationUrl,
      caption,
      imageUrl: chosen ?? '',
      interestSuggestions,
      ...(isApp && { appStoreUrl: body.destinationUrl }),
      ...(isApp && body.applicationId && { applicationId: body.applicationId }),
    });

    return NextResponse.json({ draft, imageMissing: !chosen, imageCandidates: candidates });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[ads/generate] Error:', error);
    return NextResponse.json(
      { error: 'generate_failed', message: (error instanceof Error ? error.message : 'Unknown error').slice(0, 300) },
      { status: 500 },
    );
  }
}
