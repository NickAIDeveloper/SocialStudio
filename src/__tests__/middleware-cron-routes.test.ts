import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ---------------------------------------------------------------------------
// Regression guard for a failure class that has now bitten three times:
//
//   An HMAC-authenticated cron route is added, but NOT added to the middleware
//   matcher's exclusion list. next-auth middleware then intercepts it and
//   redirects to /login, which the cron's POST sees as **405**. Nothing throws,
//   the workflow goes green, and the job silently does nothing.
//
// Confirmed in prod on 2026-07-30 from the daily run log:
//   [brain] ig-token refresh: status=405 refreshed=0 skipped=0 total=0
//   sync-insights: status=405 synced=0
// The IG token sweep had NEVER run since it shipped 2026-06-20, leaving the
// tokens to expire on 2026-08-19. sync-insights had regressed back to 405.
//
// So: derive the cron routes from the filesystem and assert the matcher lets
// every one of them through. Adding a new HMAC route without excluding it now
// fails this test instead of silently 405ing for weeks.
// ---------------------------------------------------------------------------

const API_ROOT = join(process.cwd(), 'src', 'app', 'api');

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      out.push(full);
    }
  }
  return out;
}

// Every route that authenticates via the brain HMAC — i.e. is called by a
// scheduler, not a browser session.
function hmacRoutePaths(): string[] {
  return findRouteFiles(API_ROOT)
    .filter(file => readFileSync(file, 'utf8').includes('verifyBrainSignature'))
    .map(file => {
      const rel = relative(join(process.cwd(), 'src', 'app'), file).split(sep);
      rel.pop(); // drop route.ts
      return `/${rel.join('/')}`;
    })
    .sort();
}

// Pull the matcher pattern straight out of middleware.ts so the test tracks the
// real config rather than a copy that can drift.
function middlewareMatcher(): RegExp {
  const src = readFileSync(join(process.cwd(), 'src', 'middleware.ts'), 'utf8');
  const match = src.match(/matcher:\s*\[\s*'([^']+)'/);
  if (!match) throw new Error('could not extract matcher from src/middleware.ts');
  // The file is a TS string literal, so '\\.' in source means '\.' in the regex.
  const pattern = match[1].replace(/\\\\/g, '\\');
  // Anchored, because Next matches a matcher against the WHOLE pathname. Testing
  // unanchored gives false positives: '/api/brain/snapshot' would "match" at the
  // inner '/brain/snapshot' offset even though the route is correctly excluded.
  return new RegExp(`^${pattern}$`);
}

describe('middleware matcher vs HMAC cron routes', () => {
  const matcher = middlewareMatcher();
  const routes = hmacRoutePaths();

  it('finds the HMAC cron routes to check', () => {
    // Sanity: if this ever hits zero the test below would vacuously pass.
    expect(routes.length).toBeGreaterThan(5);
    expect(routes).toContain('/api/meta/instagram/refresh-tokens');
    expect(routes).toContain('/api/ads/sync-insights');
  });

  it.each(routes)('excludes %s from auth middleware', route => {
    // A match means next-auth middleware intercepts it → /login redirect → 405.
    expect(
      matcher.test(route),
      `${route} authenticates via HMAC but is NOT excluded in src/middleware.ts, ` +
        'so a cron POST to it gets redirected to /login and returns 405. ' +
        'Add it to the matcher exclusion list.',
    ).toBe(false);
  });
});
