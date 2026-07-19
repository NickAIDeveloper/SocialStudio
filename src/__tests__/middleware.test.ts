import { describe, it, expect, vi } from 'vitest';

// Importing src/middleware.ts re-exports `auth` from '@/auth' (NextAuth), which
// initializes real auth config. Stub it so this test only exercises the route
// matcher, not the auth runtime.
vi.mock('@/auth', () => ({ auth: (handler: unknown) => handler }));

import { config } from '@/middleware';

// The matcher is a single negative-lookahead pattern that decides which paths
// run through session-auth middleware. Anchor it to the full pathname (as Next
// does) so we can assert per-path inclusion/exclusion.
const matcher = new RegExp(`^${config.matcher[0]}$`);
const runsThroughAuth = (path: string) => matcher.test(path);

describe('middleware matcher', () => {
  // Cron / HMAC-verified routes authenticate themselves (verifyBrainSignature)
  // and carry no session cookie — they MUST be excluded, or the auth middleware
  // 307-redirects them to /login and the cron POST gets a 405.
  it.each([
    '/api/ads/sync-insights', // regression: was missing → daily ad-insight sync 405'd
    '/api/autopilot/run',
    '/api/brain/compute',
    '/api/brain/brief',
    '/api/competitors/sync',
    '/api/insights',
  ])('excludes cron/HMAC route %s from auth', (path) => {
    expect(runsThroughAuth(path)).toBe(false);
  });

  // Normal user-facing routes MUST still be protected — including sibling
  // /api/ads/* routes, so the new exclusion doesn't over-match.
  it.each([
    '/api/ads/generate',
    '/api/brands',
    '/dashboard',
    '/settings',
  ])('still routes %s through auth', (path) => {
    expect(runsThroughAuth(path)).toBe(true);
  });
});
