// src/lib/meta/ads-types.ts
// Single source of truth for the v1 ad-builder's objective/targeting shapes.

export type AdObjective = 'TRAFFIC' | 'ENGAGEMENT' | 'LEADS' | 'APP';

// Maps our curated objective to the Meta ODAX objective + the ad-set
// optimization/billing fields + the default CTA + which caption content-type
// to ask /api/captions for. CTAs are restricted to ones valid on link ads.
export interface ObjectiveConfig {
  metaObjective: 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_LEADS' | 'OUTCOME_APP_PROMOTION';
  optimizationGoal: 'LINK_CLICKS' | 'POST_ENGAGEMENT' | 'APP_INSTALLS';
  billingEvent: 'IMPRESSIONS';
  defaultCta: 'LEARN_MORE' | 'SIGN_UP' | 'INSTALL_MOBILE_APP';
  captionContentType: 'promo' | 'community';
  label: string;
  description: string;
}

export const OBJECTIVE_CONFIG: Record<AdObjective, ObjectiveConfig> = {
  TRAFFIC: {
    metaObjective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    defaultCta: 'LEARN_MORE',
    captionContentType: 'promo',
    label: 'Traffic',
    description: 'Send people to your website.',
  },
  ENGAGEMENT: {
    metaObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'POST_ENGAGEMENT',
    billingEvent: 'IMPRESSIONS',
    defaultCta: 'LEARN_MORE',
    captionContentType: 'community',
    label: 'Engagement',
    description: 'Get more reach, reactions, and interaction.',
  },
  LEADS: {
    metaObjective: 'OUTCOME_LEADS',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    defaultCta: 'SIGN_UP',
    captionContentType: 'promo',
    label: 'Leads',
    description: 'Drive sign-ups on your site (website leads).',
  },
  // NOTE: iOS 14+ app campaigns have SKAdNetwork (SKAN) nuances and a 9-campaign
  // limit enforced by Meta. Delivery requires the app to be registered in Meta
  // Business Manager (application_id) and SKAdNetwork values set up in the app's
  // Info.plist. We do NOT configure SKAN here; this is handled on the Meta side.
  APP: {
    metaObjective: 'OUTCOME_APP_PROMOTION',
    optimizationGoal: 'APP_INSTALLS',
    billingEvent: 'IMPRESSIONS',
    defaultCta: 'INSTALL_MOBILE_APP',
    captionContentType: 'promo',
    label: 'App installs',
    description: 'Promote your iOS app on the App Store.',
  },
};

export const HEADLINE_MAX = 40; // Meta truncates link-ad headlines hard.
export const MAX_HASHTAGS = 5;

// The editable creative produced by /api/ads/generate.
export interface AdDraft {
  objective: AdObjective;
  destinationUrl: string;
  primaryText: string; // the caption / message
  hook: string;
  headline: string; // <= HEADLINE_MAX
  hashtags: string[];
  cta: ObjectiveConfig['defaultCta'];
  imageUrl: string;
  interestSuggestions: string[];
  // APP objective only. appStoreUrl is the canonical App Store link used as the
  // creative destination. applicationId is the Meta-registered app id (numeric
  // string) required in promoted_object for OUTCOME_APP_PROMOTION delivery.
  appStoreUrl?: string;
  applicationId?: string;
  // Video creative fields. When mediaType is 'video', videoUrl is the uploaded
  // video file URL and thumbnailUrl is the poster/thumbnail image URL (required
  // by Meta for video creatives). Absent mediaType is treated as 'image' for
  // full backward compatibility.
  mediaType?: 'image' | 'video';
  videoUrl?: string;
  thumbnailUrl?: string;
  // The Meta video id returned by the upload step once the video has finished
  // processing (READY). publish/ references this directly and never re-uploads
  // or polls.
  videoId?: string;
}

// The audience/budget the user sets in Step 3, sent to /api/ads/publish.
export interface AdTargeting {
  countries: string[]; // ISO-2, e.g. ['GB']
  ageMin: number; // 13..65
  ageMax: number; // 13..65
  gender: 'all' | 'male' | 'female';
  interests: string[]; // free-text names; resolved to IDs at publish time
  dailyBudgetMinor: number; // minor units of account currency (e.g. pence)
  startDate: string; // ISO date-time
  endDate: string; // ISO date-time
}

// Conservative per-currency daily-budget floors in MINOR units. Meta is the
// final arbiter; these catch obvious mistakes with a friendly message before
// we call the API. Default applies to unlisted currencies.
export const MIN_DAILY_BUDGET_MINOR: Record<string, number> = {
  USD: 500, GBP: 500, EUR: 500, CAD: 600, AUD: 700, BRL: 2000,
};
export const DEFAULT_MIN_DAILY_BUDGET_MINOR = 500;

export function minDailyBudget(currency: string): number {
  return MIN_DAILY_BUDGET_MINOR[currency] ?? DEFAULT_MIN_DAILY_BUDGET_MINOR;
}
