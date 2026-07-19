export { auth as middleware } from '@/auth';

export const config = {
  matcher: [
    '/((?!$|login|register|forgot-password|reset-password|terms|privacy|data-deletion|api/auth|api/brain/snapshot|api/brain/compute|api/brain/brief|api/brain/brands|api/competitors/sync|api/autopilot/run|api/ads/sync-insights|api/smart-posts/god-mode|api/insights|api/captions|api/images|_next|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
