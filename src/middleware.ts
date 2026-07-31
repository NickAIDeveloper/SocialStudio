export { auth as middleware } from '@/auth';

// IMPORTANT: every route that authenticates via the brain HMAC signature
// (verifyBrainSignature) MUST be listed as an exclusion below. Otherwise
// next-auth intercepts it, redirects to /login, and the cron's POST comes back
// as a silent **405** — the workflow stays green while the job does nothing.
// That cost us the IG token sweep (405 from 2026-06-20 until 2026-07-30, never
// ran once) and a regression of /api/ads/sync-insights.
//
// src/__tests__/middleware-cron-routes.test.ts enforces this: it derives the
// HMAC routes from the filesystem and fails if any is missing here.
export const config = {
  matcher: [
    '/((?!$|login|register|forgot-password|reset-password|terms|privacy|data-deletion|api/auth|api/brain/snapshot|api/brain/compute|api/brain/brief|api/brain/brands|api/competitors/sync|api/autopilot/run|api/autopilot/channel-health|api/meta/instagram/refresh-tokens|api/ads/sync-insights|api/dev/diagnose-autopilot-images|api/smart-posts/god-mode|api/insights|api/captions|api/images|_next|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
