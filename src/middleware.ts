export { auth as middleware } from '@/auth';

export const config = {
  matcher: [
    '/((?!$|login|register|api/auth|_next|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
