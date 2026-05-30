// src/app/api/ads/copy/route.ts
// POST: premium ad-copy generation for the Meta ad builder. Loads brand + brain
// brief + competitor intel, summarizes the intel into a short context string,
// and calls the dedicated generateAdCopy generator. Distinct from /api/captions
// (which autopilot depends on and must stay untouched).

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { readBrandBrain } from '@/lib/brain/consume';
import { buildCompetitorIntel, type CompetitorIntel } from '@/lib/brain/competitor-intel';
import { generateAdCopy } from '@/lib/ads/ad-copy';
import { type AdObjective } from '@/lib/meta/ads-types';

export const maxDuration = 30;

function isObjective(v: unknown): v is AdObjective {
  return v === 'TRAFFIC' || v === 'ENGAGEMENT' || v === 'LEADS' || v === 'APP';
}

// Distil competitor intel into a concise, prompt-friendly string. Kept to a few
// hundred chars so it sharpens positioning without bloating the prompt.
function summarizeCompetitorIntel(intel: CompetitorIntel | null): string | null {
  if (!intel || intel.competitorCount === 0 || intel.sampleSize === 0) return null;
  const parts: string[] = [];
  parts.push(`${intel.competitorCount} competitors, ${intel.sampleSize} top posts analyzed.`);
  if (intel.topHookPatterns.length > 0) {
    parts.push(`Their best hooks lean: ${intel.topHookPatterns.map((h) => h.pattern).slice(0, 3).join(', ')}.`);
  }
  if (intel.topHashtags.length > 0) {
    parts.push(`Common tags: ${intel.topHashtags.map((h) => h.tag).slice(0, 5).join(' ')}.`);
  }
  if (intel.topPosts.length > 0) {
    const hooks = intel.topPosts.slice(0, 3).map((p) => `"${p.hook.slice(0, 70)}"`).join(' / ');
    parts.push(`Top-performing competitor hooks: ${hooks}.`);
  }
  return parts.join(' ').slice(0, 800);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = (await request.json()) as {
      brandId?: string;
      objective?: string;
      destinationUrl?: string;
    };

    if (!body.brandId) {
      return NextResponse.json({ error: 'brandId_required' }, { status: 400 });
    }
    if (!isObjective(body.objective)) {
      return NextResponse.json({ error: 'invalid_objective' }, { status: 400 });
    }

    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, body.brandId), eq(brands.userId, userId)))
      .limit(1);
    if (!brand) {
      return NextResponse.json({ error: 'brand_not_found' }, { status: 403 });
    }

    // Import lazily so the 503 guard can run without the env var in tests too.
    const { isCerebrasAvailable } = await import('@/lib/cerebras');
    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'no_ai_key', message: 'AI not configured' }, { status: 503 });
    }

    const destinationUrl =
      body.destinationUrl && /^https?:\/\//.test(body.destinationUrl)
        ? body.destinationUrl
        : (brand.websiteUrl ?? '');

    const [brain, intel] = await Promise.all([
      readBrandBrain(body.brandId).catch(() => null),
      buildCompetitorIntel(body.brandId).catch(() => null),
    ]);

    const competitorContext = summarizeCompetitorIntel(intel);

    try {
      const copy = await generateAdCopy({
        brand: {
          name: brand.name ?? brand.slug,
          slug: brand.slug,
          description: brand.description ?? null,
          websiteUrl: brand.websiteUrl ?? null,
        },
        objective: body.objective,
        destinationUrl,
        briefMd: brain?.briefMd ?? null,
        competitorContext,
      });

      return NextResponse.json({
        success: true,
        primaryText: copy.primaryText,
        hook: copy.hook,
        headline: copy.headline,
        hashtags: copy.hashtags,
      });
    } catch (genErr) {
      const message = genErr instanceof Error ? genErr.message : 'Copy generation failed';
      return NextResponse.json({ error: 'copy_failed', message: message.slice(0, 200) }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[ads/copy] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'copy_failed', message: message.slice(0, 200) }, { status: 502 });
  }
}
