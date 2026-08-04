// src/app/api/ads/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, metaAccounts, metaAds } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import {
  uploadAdImage, createCampaign, createAdSet, createAdCreative, createAd,
  createVideoCreative, deleteCampaign,
  searchAdInterests, buildAdsManagerUrl, getAd,
} from '@/lib/meta/ads';
import { getAdvertisableApps } from '@/lib/meta/client';
import {
  OBJECTIVE_CONFIG, minDailyBudget, type AdDraft, type AdTargeting, type AdObjective,
} from '@/lib/meta/ads-types';
import { findOverlap, type GeoCity } from '@/lib/ads/geo-overlap';
import { buildTrackedUrl } from '@/lib/ads/tracked-url';
import { resolveAudienceMode, advantageAudienceFlag } from '@/lib/ads/audience-mode';
import type { SampledGenome } from '@/lib/creative/sampling';
import { randomUUID } from 'node:crypto';

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
  // Lifted out of the try so the catch can use it to roll back an orphan
  // campaign. Empty until we decrypt the Meta token below.
  let accessToken = '';

  try {
    userId = await getUserId();
    const body = (await request.json()) as {
      brandId?: string; adAccountId?: string; pageId?: string; igAccountId?: string;
      draft?: AdDraft; targeting?: AdTargeting; genome?: SampledGenome;
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

    // Geo: at least one country OR one city is required.
    if (!targeting.countries?.length && !targeting.cities?.length) {
      return NextResponse.json(
        { error: 'no_geo', message: 'Select at least one country or city to target.' },
        { status: 400 },
      );
    }

    // Reject overlapping city radii up front (Meta subcode 1487756). Only cities
    // that carry coordinates can be checked; coordinate-less legacy cities pass.
    const targetCities = (targeting.cities ?? []) as Array<{ key: string; name: string; lat?: number; lng?: number; radius?: number; distanceUnit?: 'mile' | 'kilometer' }>;
    for (let i = 0; i < targetCities.length; i++) {
      const c = targetCities[i];
      if (c.lat == null || c.lng == null) continue;
      const priorWithCoords: GeoCity[] = targetCities.slice(0, i)
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({ key: p.key, name: p.name, lat: p.lat as number, lng: p.lng as number, radius: p.radius, distanceUnit: p.distanceUnit }));
      const clash = findOverlap(priorWithCoords, { key: c.key, name: c.name, lat: c.lat, lng: c.lng, radius: c.radius, distanceUnit: c.distanceUnit });
      if (clash) {
        return NextResponse.json(
          { error: `Locations overlap: "${c.name}" overlaps "${clash.name}". Remove one and try again.` },
          { status: 400 },
        );
      }
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
    } else if (draft.destinationUrl && APP_STORE_RE.test(draft.destinationUrl)) {
      // Meta HARD-rejects (subcode 1487810, "creative requires a different
      // objective") an App Store URL used as the creative link on any objective
      // other than App installs. Such an ad publishes but is immediately
      // WITH_ISSUES and would be disapproved on activation. Catch it before any
      // write with a clear, actionable message instead of shipping a broken ad.
      return NextResponse.json(
        {
          error: 'app_url_wrong_objective',
          message:
            'App Store URLs can only be used with the “App installs” objective. For Traffic, Engagement, or Leads, set a website URL (e.g. https://yourdomain.com) as the destination.',
        },
        { status: 400 },
      );
    }

    const cfg = OBJECTIVE_CONFIG[draft.objective as AdObjective];
    metaObjective = cfg.metaObjective;
    accessToken = decrypt(account.accessToken);

    // Resolve interest names → ids (drop the ones that don't resolve).
    const resolved = (
      await Promise.all((targeting.interests ?? []).map((name) => searchAdInterests(accessToken, name)))
    ).filter((x): x is { id: string; name: string } => Boolean(x));

    // Build geo_locations from countries (existing) + cities (additive). An ad
    // can be city-only, but it must have at least one geo dimension.
    //
    // City radius rules (Meta Marketing API, basic-targeting reference):
    //   - mile: 10–50, kilometer: 17–80.
    // A radius below the per-unit minimum makes Meta reject the whole targeting
    // with subcode 1487756 ("Locations Can't Be Used"). The previous default of
    // 25 km was numerically valid but we still saw rejections, so we standardise
    // on Meta's own canonical default — radius 10 mile — used in every official
    // targeting example, and clamp any user-supplied radius into the valid range
    // for its unit. `key` is sent as the exact numeric string from the
    // adgeolocation search. Cities do NOT require a country in geo_locations.
    const geo: Record<string, unknown> = {};
    if (targeting.countries?.length) geo.countries = targeting.countries;
    if (targeting.cities?.length) {
      geo.cities = targeting.cities.map((c) => {
        const unit: 'mile' | 'kilometer' = c.distanceUnit === 'kilometer' ? 'kilometer' : 'mile';
        const [min, max] = unit === 'kilometer' ? [17, 80] : [10, 50];
        const fallback = unit === 'kilometer' ? 17 : 10;
        const requested = typeof c.radius === 'number' && Number.isFinite(c.radius) ? c.radius : fallback;
        const radius = Math.min(max, Math.max(min, Math.round(requested)));
        return { key: String(c.key), radius, distance_unit: unit };
      });
    }

    const audienceMode = resolveAudienceMode(targeting.audienceMode);

    const metaTargeting: Record<string, unknown> = {
      geo_locations: geo,
      age_min: targeting.ageMin,
      age_max: targeting.ageMax,
      // Meta requires the Advantage+ audience flag to be set explicitly, or it
      // rejects the ad set with subcode 1870227 ("Advantage Audience Flag
      // Required"). Which way it goes is now the user's choice per ad, and
      // defaults to opting out (0) so existing behaviour is unchanged.
      targeting_automation: { advantage_audience: advantageAudienceFlag(audienceMode) },
    };
    const genders = genderCodes(targeting.gender);
    if (genders) metaTargeting.genders = genders;
    if (resolved.length) metaTargeting.flexible_spec = [{ interests: resolved.map((r) => ({ id: r.id, name: r.name })) }];

    // For APP objective, promoted_object links the ad set to the registered app.
    // The object_store_url MUST be the URL Meta has registered for this
    // application_id — NOT the free-text field the user typed. A mismatch
    // triggers Meta subcode 1885093 ("Application/Object Store URL Mismatch")
    // at ad-set creation. We resolve it authoritatively from Meta here.
    // For all other objectives, promotedObject is undefined (omitted) and we
    // skip the lookup entirely.
    let promotedObject: { application_id: string; object_store_url: string } | undefined;
    if (draft.objective === 'APP') {
      const apps = await getAdvertisableApps(accessToken, adAccountId);
      const app = apps.find((a) => a.id === draft.applicationId);
      if (!app) {
        return NextResponse.json(
          { error: 'app_not_promotable', message: 'The selected app is no longer available on this ad account. Reconnect Meta or pick another app.' },
          { status: 400 },
        );
      }
      if (!app.iosUrl) {
        return NextResponse.json(
          { error: 'app_store_not_linked', message: 'This app is not linked to an App Store listing in Meta (Business Settings → Apps → associate it with the App Store listing), so it cannot be promoted yet.' },
          { status: 400 },
        );
      }
      promotedObject = { application_id: draft.applicationId!, object_store_url: app.iosUrl };
    }

    // APP ads use the App Store URL as the creative link; others use destinationUrl.
    const rawCreativeLink = draft.objective === 'APP' ? draft.appStoreUrl! : draft.destinationUrl;

    // Attribution tag. This platform takes no payments, so revenue is earned in
    // the marketed product (pacebrain.app / affectly.app) — the only way to tie
    // a click to an outcome is to carry an id across. clickId is minted here
    // (before the creative, which is built before the ad exists) and persisted
    // on the metaAds row so a conversion reported later can be joined back.
    //
    // buildTrackedUrl returns App Store URLs untouched: Meta validates those
    // against the registered promoted_object and extra query params break the
    // match (error 1487810).
    const clickId = randomUUID();
    const creativeLink = buildTrackedUrl(rawCreativeLink, {
      source: 'meta',
      medium: 'paid_social',
      brandSlug: brand.slug ?? brandId,
      contentId: clickId,
    });

    // Ordered write sequence — all PAUSED.
    // Validate video-specific fields before any write.
    if (draft.mediaType === 'video') {
      if (!draft.videoUrl || !draft.thumbnailUrl || !draft.videoId) {
        return NextResponse.json({ error: 'video_incomplete', message: 'videoUrl, thumbnailUrl, and a processed videoId are required for video ads. Re-upload the video.' }, { status: 400 });
      }
    }

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

    if (draft.mediaType === 'video') {
      // Video path: the video was already uploaded to /advideos and polled until
      // READY by /api/ads/upload-video, so we only reference its videoId here.
      createdCreative = await createVideoCreative(accessToken, adAccountId, {
        pageId, igAccountId,
        videoId: draft.videoId!, thumbnailUrl: draft.thumbnailUrl!, message, headline: draft.headline,
        link: creativeLink, cta: draft.cta,
      });
    } else {
      // Image path (default — mediaType absent or 'image').
      const imageHash = await uploadAdImage(accessToken, adAccountId, draft.imageUrl);
      createdCreative = await createAdCreative(accessToken, adAccountId, {
        pageId, igAccountId,
        imageHash, message, headline: draft.headline, link: creativeLink, cta: draft.cta,
      });
    }
    const adId = await createAd(accessToken, adAccountId, {
      adsetId: createdAdset, creativeId: createdCreative, name: `Ad — ${draft.headline}`,
    });

    const verdict = await getAd(accessToken, adId); // best-effort read-back
    const liveStatus = verdict?.effectiveStatus ?? 'PAUSED';
    const liveError =
      (liveStatus === 'DISAPPROVED' || liveStatus === 'WITH_ISSUES')
        ? (verdict?.reviewFeedback ?? null)
        : null;

    const [adRow] = await db.insert(metaAds).values({
      userId, brandId, adAccountId, pageId, igAccountId: igAccountId ?? null,
      campaignId: createdCampaign, adsetId: createdAdset, creativeId: createdCreative, adId,
      objective: cfg.metaObjective, status: liveStatus, draft: { ...draft, targeting }, lastError: liveError,
      // Joins a later conversion (gv_cid in the landing URL) back to this ad.
      clickId,
      // Published through the /ads builder by a person. The ads agent checks
      // this first and will never touch anything not tagged 'agent'.
      createdBy: 'human',
    }).returning();

    // Creative genome: remember what this ad was made of, so its outcome can
    // teach the ingredients rather than only the ad. Flagged and best effort —
    // recordGenome swallows its own failures and returns null.
    //
    // subjectId MUST be our internal meta_ads.id (uuid) — genome-read.ts joins
    // observations back via eq(metaAds.id, g.subjectId). It is NOT adId, which
    // is Meta's own ad id (a numeric string) and would fail the uuid column
    // constraint silently, since recordGenome swallows its own errors.
    if (process.env.CREATIVE_GENOME_ENABLED === 'true' && body.genome) {
      try {
        const { recordGenome } = await import('@/lib/creative/genome-record');
        await recordGenome({
          subjectType: 'ad',
          subjectId: adRow.id,
          brandId: brand.id,
          surface: 'ads',
          genome: body.genome,
        });
      } catch (err) {
        console.warn('[ads/publish] genome recording failed:', err instanceof Error ? err.message : err);
      }
    }

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
    // ROLLBACK: a failed publish must not leave an orphan campaign shell behind.
    // Deleting the campaign cascades to any ad set / creative / ad we created, so
    // a partial tree can never linger in Ads Manager. Best-effort: a rollback
    // failure (e.g. Meta throttling deletes) is logged, never thrown.
    if (createdCampaign && accessToken) {
      try {
        await deleteCampaign(accessToken, createdCampaign);
      } catch (rollbackErr) {
        console.error('[ads/publish] rollback (deleteCampaign) failed:', rollbackErr);
      }
    }
    return NextResponse.json({ error: 'publish_failed', message: message.slice(0, 1500) }, { status: 500 });
  }
}
