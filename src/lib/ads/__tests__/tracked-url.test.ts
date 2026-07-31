import { describe, it, expect } from 'vitest';
import { buildTrackedUrl } from '../tracked-url';

const BASE = { source: 'meta', brandSlug: 'pacebrain', contentId: 'ad-123' };

describe('buildTrackedUrl', () => {
  it('adds utm params and a first-party click id', () => {
    const url = new URL(buildTrackedUrl('https://pacebrain.app/', BASE));
    expect(url.origin + url.pathname).toBe('https://pacebrain.app/');
    expect(url.searchParams.get('utm_source')).toBe('meta');
    expect(url.searchParams.get('utm_medium')).toBe('paid_social');
    expect(url.searchParams.get('utm_campaign')).toBe('pacebrain');
    expect(url.searchParams.get('utm_content')).toBe('ad-123');
    // First-party id: survives even if a site strips utm_*, and is what our own
    // attribution joins on rather than trusting Meta's reporting.
    expect(url.searchParams.get('gv_cid')).toBe('ad-123');
  });

  it('preserves query params the destination URL already had', () => {
    const url = new URL(buildTrackedUrl('https://pacebrain.app/signup?plan=pro', BASE));
    expect(url.searchParams.get('plan')).toBe('pro');
    expect(url.searchParams.get('utm_source')).toBe('meta');
  });

  it('never double-tags a URL that already carries our params', () => {
    const once = buildTrackedUrl('https://pacebrain.app/', BASE);
    const twice = buildTrackedUrl(once, BASE);
    expect(twice).toBe(once);
    expect(twice.match(/utm_source/g)).toHaveLength(1);
  });

  it('overwrites stale tracking rather than appending a second set', () => {
    const stale = 'https://pacebrain.app/?utm_source=meta&utm_content=ad-OLD&gv_cid=ad-OLD';
    const url = new URL(buildTrackedUrl(stale, BASE));
    expect(url.searchParams.getAll('utm_content')).toEqual(['ad-123']);
    expect(url.searchParams.get('gv_cid')).toBe('ad-123');
  });

  it('leaves App Store URLs completely untouched', () => {
    // APP-objective ads use the App Store URL as the creative link, and Meta
    // validates it against the registered promoted_object. Appending query
    // params breaks that match (error 1487810), so these must pass through.
    const appStore = 'https://apps.apple.com/us/app/pacebrain/id6759993012';
    expect(buildTrackedUrl(appStore, BASE)).toBe(appStore);
    expect(buildTrackedUrl('https://play.google.com/store/apps/details?id=app.pacebrain', BASE))
      .toBe('https://play.google.com/store/apps/details?id=app.pacebrain');
  });

  it('preserves the URL fragment', () => {
    const url = buildTrackedUrl('https://pacebrain.app/pricing#plans', BASE);
    expect(url).toContain('#plans');
    expect(url.indexOf('#plans')).toBe(url.length - '#plans'.length);
  });

  it('returns the input unchanged when it is not a valid absolute URL', () => {
    // Must degrade, never throw — a malformed URL should not abort an ad publish.
    expect(buildTrackedUrl('not a url', BASE)).toBe('not a url');
    expect(buildTrackedUrl('', BASE)).toBe('');
  });

  it('supports organic posts as a distinct medium', () => {
    const url = new URL(
      buildTrackedUrl('https://affectly.app/', {
        source: 'instagram',
        medium: 'organic_social',
        brandSlug: 'affectly',
        contentId: 'post-9',
      }),
    );
    expect(url.searchParams.get('utm_source')).toBe('instagram');
    expect(url.searchParams.get('utm_medium')).toBe('organic_social');
    expect(url.searchParams.get('gv_cid')).toBe('post-9');
  });

  it('slugifies values that would otherwise break analytics grouping', () => {
    const url = new URL(
      buildTrackedUrl('https://pacebrain.app/', { ...BASE, brandSlug: 'Pace Brain!' }),
    );
    expect(url.searchParams.get('utm_campaign')).toBe('pace-brain');
  });
});
