// src/lib/meta/ads-types.ts
// Single source of truth for the v1 ad-builder's objective/targeting shapes.

export type AdObjective = 'TRAFFIC' | 'ENGAGEMENT' | 'LEADS';

// Maps our curated objective to the Meta ODAX objective + the ad-set
// optimization/billing fields + the default CTA + which caption content-type
// to ask /api/captions for. CTAs are restricted to ones valid on link ads.
export interface ObjectiveConfig {
  metaObjective: 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_LEADS';
  optimizationGoal: 'LINK_CLICKS' | 'POST_ENGAGEMENT';
  billingEvent: 'IMPRESSIONS';
  defaultCta: 'LEARN_MORE' | 'SIGN_UP';
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
