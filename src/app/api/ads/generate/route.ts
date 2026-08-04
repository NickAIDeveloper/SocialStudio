import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { readBrandBrain } from '@/lib/brain/consume';
import { buildCompetitorIntel } from '@/lib/brain/competitor-intel';
import { buildAdDraft } from '@/lib/ads/build-draft';
import { auditAdCopy } from '@/lib/ads/ad-copy-guard';
import { brandPainPoints } from '@/lib/db/schema';
import { buildPainBrief, type RankedPain } from '@/lib/research/pain-points';
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
  // largeImageURL (1280px) rather than webformatURL (640px). A paid ad is shown
  // full-width on modern phones, where a 640px source looks visibly soft — and
  // unlike an organic post, this one costs money every time it is displayed.
  const { hits } = (await pxRes.json()) as { hits?: Array<{ largeImageURL?: string; webformatURL?: string }> };
  const candidates = (hits ?? [])
    .map((h) => h.largeImageURL ?? h.webformatURL)
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

    const [brain, intel, painRow] = await Promise.all([
      readBrandBrain(body.brandId).catch(() => null),
      buildCompetitorIntel(body.brandId).catch(() => null),
      // Audience pain points, mined from real community discussions. Optional:
      // a brand with none researched yet generates exactly as before.
      db.select().from(brandPainPoints).where(eq(brandPainPoints.brandId, body.brandId))
        .then(rows => rows[0] ?? null).catch(() => null),
    ]);
    const painBrief = painRow?.ranked
      ? buildPainBrief(painRow.ranked as RankedPain[])
      : null;
    const competitorContext = summarizeCompetitorIntel(intel);

    // Creative genome: sample the ingredients for this ad from what has actually
    // worked. Flagged off by default and fully best-effort — the house pattern
    // from smart-posts/generate.ts:216-226. A genome failure must never block
    // an ad, exactly as a brain failure never blocks a caption.
    let genome: import('@/lib/creative/sampling').SampledGenome | undefined;
    if (process.env.CREATIVE_GENOME_ENABLED === 'true') {
      try {
        const [{ sampleGenome }, read] = await Promise.all([
          import('@/lib/creative/sampling'),
          import('@/lib/creative/genome-read'),
        ]);
        const [available, scores, recent, index] = await Promise.all([
          read.loadSamplableIngredients(),
          read.refreshScores(),
          read.loadRecentGenomeIngredientIds('ads', 10),
          read.nextGenomeIndex('ads'),
        ]);
        genome = sampleGenome({
          available,
          scores,
          surface: 'ads',
          recentGenomes: recent,
          index,
        });
      } catch (err) {
        console.warn('[ads/generate] genome sampling failed:', err instanceof Error ? err.message : err);
        genome = undefined;
      }
    }

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
        painBrief,
        competitorContext,
        genome,
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

    // Surface copy problems the prompt is supposed to prevent but the model can
    // still produce — chiefly organic phrasing ("link in bio") in a paid ad,
    // which sends the reader nowhere. Reported, not blocking: the draft is
    // reviewed before publishing, and silently rewriting the model's prose
    // would be worse than showing the operator what is wrong with it.
    const copyIssues = auditAdCopy(draft);

    return NextResponse.json({
      draft,
      imageMissing: !chosen,
      imageCandidates: candidates,
      copyIssues,
      genome: genome ?? null,
    });
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
