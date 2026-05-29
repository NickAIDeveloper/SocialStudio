import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { readBrandBrain } from '@/lib/brain/consume';
import { buildAdDraft } from '@/lib/ads/build-draft';
import { OBJECTIVE_CONFIG, type AdObjective } from '@/lib/meta/ads-types';

export const maxDuration = 60;

function isObjective(v: unknown): v is AdObjective {
  return v === 'TRAFFIC' || v === 'ENGAGEMENT' || v === 'LEADS';
}

// Derive a query and fetch one on-topic image URL using the existing pipeline.
async function pickImageUrl(args: {
  origin: string; cookie: string; brandName: string; brandDescription: string;
  caption: string; hookText: string; contentType: string;
}): Promise<string | null> {
  const pickRes = await fetch(`${args.origin}/api/images/pick`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: args.cookie },
    body: JSON.stringify({
      caption: args.caption, hookText: args.hookText, contentType: args.contentType,
      brand: args.brandName, brandDescription: args.brandDescription,
    }),
  });
  if (!pickRes.ok) return null;
  const { searchTerm } = (await pickRes.json()) as { searchTerm?: string };
  if (!searchTerm) return null;

  const pxRes = await fetch(`${args.origin}/api/pixabay?q=${encodeURIComponent(searchTerm)}&orientation=horizontal`, {
    headers: { cookie: args.cookie },
  });
  if (!pxRes.ok) return null;
  const { hits } = (await pxRes.json()) as { hits?: Array<{ webformatURL?: string }> };
  return hits?.[0]?.webformatURL ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = (await request.json()) as {
      brandId?: string; objective?: string; destinationUrl?: string;
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
    const brain = await readBrandBrain(body.brandId).catch(() => null);
    const origin = request.nextUrl.origin;
    const cookie = request.headers.get('cookie') ?? '';

    const capRes = await fetch(`${origin}/api/captions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        brandSlug: brand.slug,
        contentType: cfg.captionContentType,
        brainBriefMd: brain?.briefMd ?? undefined,
      }),
    });
    if (!capRes.ok) {
      const err = await capRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'caption_failed', message: (err as { message?: string }).message ?? 'Caption generation failed' },
        { status: 502 },
      );
    }
    const caption = (await capRes.json()) as { caption: string; hashtags: string; hookText: string };

    const imageUrl = await pickImageUrl({
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

    const draft = buildAdDraft({
      objective: body.objective,
      destinationUrl: body.destinationUrl,
      caption,
      imageUrl: imageUrl ?? '',
      interestSuggestions,
    });

    return NextResponse.json({ draft, imageMissing: !imageUrl });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[ads/generate] Error:', error);
    return NextResponse.json(
      { error: 'generate_failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
