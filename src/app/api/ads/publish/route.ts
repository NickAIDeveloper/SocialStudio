// src/app/api/ads/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, metaAccounts, metaAds } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import {
  uploadAdImage, createCampaign, createAdSet, createAdCreative, createAd,
  searchAdInterests, buildAdsManagerUrl,
} from '@/lib/meta/ads';
import {
  OBJECTIVE_CONFIG, minDailyBudget, type AdDraft, type AdTargeting, type AdObjective,
} from '@/lib/meta/ads-types';

export const maxDuration = 60;

interface AdAccountAsset { id: string; account_id?: string; currency?: string }

function genderCodes(g: AdTargeting['gender']): number[] | undefined {
  if (g === 'male') return [1];
  if (g === 'female') return [2];
  return undefined; // all
}

export async function POST(request: NextRequest) {
  // Hoisted so the catch block can record a forensic row for a partially
  // created (paused, harmless) tree. We only persist that row when we have a
  // validated, real brandId + userId (both are uuid FKs); otherwise we just log.
  let userId: string | null = null;
  let brandValidated = false;
  let brandId = '';
  let adAccountId = '';
  let pageId = '';
  let igAccountId: string | undefined;
  let metaObjective = 'unknown';
  let createdCampaign: string | null = null;
  let createdAdset: string | null = null;
  let createdCreative: string | null = null;

  try {
    userId = await getUserId();
    const body = (await request.json()) as {
      brandId?: string; adAccountId?: string; pageId?: string; igAccountId?: string;
      draft?: AdDraft; targeting?: AdTargeting;
    };
    brandId = body.brandId ?? '';
    adAccountId = body.adAccountId ?? '';
    pageId = body.pageId ?? '';
    igAccountId = body.igAccountId;
    const { draft, targeting } = body;

    if (!brandId || !adAccountId || !pageId || !draft || !targeting) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    // Ownership: brand belongs to user.
    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
      .limit(1);
    if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 403 });
    brandValidated = true;

    // Meta account + token.
    const [account] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, userId))
      .limit(1);
    if (!account) return NextResponse.json({ error: 'meta_not_connected' }, { status: 400 });

    if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) {
      return NextResponse.json({ error: 'token_expired', message: 'Reconnect your Meta account.' }, { status: 401 });
    }

    // Trust boundary: the ad account must be one the user actually has.
    const assets = (account.assets as { adAccounts?: AdAccountAsset[] } | null) ?? {};
    const matched = (assets.adAccounts ?? []).find(
      (a) => a.id === adAccountId || a.id === `act_${adAccountId}` || a.account_id === adAccountId.replace('act_', ''),
    );
    if (!matched) return NextResponse.json({ error: 'ad_account_not_owned' }, { status: 403 });

    // Budget floor.
    const currency = matched.currency ?? 'USD';
    if (targeting.dailyBudgetMinor < minDailyBudget(currency)) {
      return NextResponse.json(
        { error: 'budget_below_minimum', message: `Daily budget is below the ${currency} minimum.`, minMinor: minDailyBudget(currency) },
        { status: 400 },
      );
    }
    if (
      !targeting.startDate ||
      !targeting.endDate ||
      new Date(targeting.startDate) >= new Date(targeting.endDate)
    ) {
      return NextResponse.json({ error: 'invalid_dates' }, { status: 400 });
    }

    // APP objective: validate required App Store fields before any write.
    const APP_STORE_RE = /^https?:\/\/(apps\.apple\.com|itunes\.apple\.com)/;
    if (draft.objective === 'APP') {
      if (!draft.appStoreUrl || !APP_STORE_RE.test(draft.appStoreUrl) || !draft.applicationId?.trim()) {
        return NextResponse.json(
          { error: 'app_setup_required', message: 'appStoreUrl (apps.apple.com) and applicationId are required for APP objective.' },
          { status: 400 },
        );
      }
    }

    const cfg = OBJECTIVE_CONFIG[draft.objective as AdObjective];
    metaObjective = cfg.metaObjective;
    const accessToken = decrypt(account.accessToken);

    // Resolve interest names → ids (drop the ones that don't resolve).
    const resolved = (
      await Promise.all((targeting.interests ?? []).map((name) => searchAdInterests(accessToken, name)))
    ).filter((x): x is { id: string; name: string } => Boolean(x));

    const metaTargeting: Record<string, unknown> = {
      geo_locations: { countries: targeting.countries },
      age_min: targeting.ageMin,
      age_max: targeting.ageMax,
    };
    const genders = genderCodes(targeting.gender);
    if (genders) metaTargeting.genders = genders;
    if (resolved.length) metaTargeting.flexible_spec = [{ interests: resolved.map((r) => ({ id: r.id, name: r.name })) }];

    // For APP objective, promoted_object links the ad set to the registered app.
    // For all other objectives, promotedObject is undefined (omitted from request).
    const promotedObject =
      draft.objective === 'APP' && draft.applicationId && draft.appStoreUrl
        ? { application_id: draft.applicationId, object_store_url: draft.appStoreUrl }
        : undefined;

    // APP ads use the App Store URL as the creative link; others use destinationUrl.
    const creativeLink = draft.objective === 'APP' ? draft.appStoreUrl! : draft.destinationUrl;

    // Ordered write sequence — all PAUSED.
    const imageHash = await uploadAdImage(accessToken, adAccountId, draft.imageUrl);
    createdCampaign = await createCampaign(accessToken, adAccountId, cfg.metaObjective);
    createdAdset = await createAdSet(accessToken, adAccountId, {
      campaignId: createdCampaign,
      optimizationGoal: cfg.optimizationGoal,
      billingEvent: cfg.billingEvent,
      dailyBudgetMinor: targeting.dailyBudgetMinor,
      startTime: targeting.startDate,
      endTime: targeting.endDate,
      targeting: metaTargeting,
      promotedObject,
    });
    const message = [draft.primaryText, draft.hashtags.join(' ')].filter(Boolean).join('\n\n');
    createdCreative = await createAdCreative(accessToken, adAccountId, {
      pageId, igAccountId,
      imageHash, message, headline: draft.headline, link: creativeLink, cta: draft.cta,
    });
    const adId = await createAd(accessToken, adAccountId, {
      adsetId: createdAdset, creativeId: createdCreative, name: `Ad — ${draft.headline}`,
    });

    await db.insert(metaAds).values({
      userId, brandId, adAccountId, pageId, igAccountId: igAccountId ?? null,
      campaignId: createdCampaign, adsetId: createdAdset, creativeId: createdCreative, adId,
      objective: cfg.metaObjective, status: 'PAUSED', draft: { ...draft, targeting }, lastError: null,
    });

    return NextResponse.json({
      campaignId: createdCampaign, adsetId: createdAdset, creativeId: createdCreative, adId,
      adsManagerUrl: buildAdsManagerUrl(adAccountId, createdCampaign),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Publish failed';
    console.error('[ads/publish] Error:', message, { createdCampaign, createdAdset, createdCreative });
    // Record the partial tree ONLY when we have a validated real brandId + userId
    // (both uuid FKs). Otherwise a forensic insert would itself fail; the log
    // above is the fallback. The partial Meta objects are PAUSED and harmless.
    if (userId && brandValidated && (createdCampaign || createdAdset || createdCreative)) {
      try {
        await db.insert(metaAds).values({
          userId, brandId, adAccountId, pageId, igAccountId: igAccountId ?? null,
          campaignId: createdCampaign, adsetId: createdAdset, creativeId: createdCreative, adId: null,
          objective: metaObjective, status: 'FAILED', draft: null, lastError: message.slice(0, 500),
        });
      } catch { /* best-effort forensic logging only */ }
    }
    return NextResponse.json({ error: 'publish_failed', message: message.slice(0, 300) }, { status: 500 });
  }
}
