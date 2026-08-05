# Wave 1 — Phantom Page Deletion Report

## Deleted
- `src/app/(dashboard)/analytics/page.tsx`
- `src/app/(dashboard)/batch/page.tsx`
- `src/app/(dashboard)/generate/page.tsx`
- `src/app/(dashboard)/competitors/page.tsx`
- `src/app/(dashboard)/home/page.tsx`
- `src/app/(dashboard)/meta/page.tsx` + `src/app/(dashboard)/meta/redirect.tsx`
- `src/components/command-center.tsx` — verified zero imports anywhere in `src` (only self-reference of its own `CommandCenter` export) before deleting.

## Repointed (all found via exact-boundary grep for `["'\`](/path)(["'\`?/])`, not naive substring match)
- `src/components/smart-posts-dashboard.tsx:524,830` — `/analytics` → `/analyze` (copy also updated: "Scrape in Analytics" → "Scrape in Analyze", "Go to Analytics" → "Go to Analyze")
- `src/auth.ts:84` — post-login-page redirect `/home` → `/analyze`
- `src/components/login-form.tsx:31` — post-login `router.push('/home')` → `/analyze`
- `src/components/register-form.tsx:51` — post-register `router.push('/home')` → `/analyze`
- `src/app/api/meta/instagram/oauth/callback/route.ts:26` — IG OAuth callback redirect `/meta` → `/analyze` (preserves `?source=meta` default + all existing params)
- `src/app/api/meta/oauth/callback/route.ts:24` — **found during the exhaustive grep, not listed in the brief**: the Meta *ad account* OAuth callback (separate flow from IG Login) also redirected to `/analytics`. Repointed straight to `/analyze`. Missing this would have broken the ad-account "Connect Meta" flow the same way the IG callback would have broken.

`command-center.tsx` was the only thing linking `/generate`/`/batch` — no other repoint needed for those two; it's deleted outright.
`/competitors` had zero inbound links anywhere in `src` (confirmed via grep) — matches the audit.

## NOT deleted
- `src/components/performance/brand-selector.tsx` — kept per instructions (another agent is wiring it up for Wave 2).
- `/api/competitors*`, `/api/analytics/ask` — live API routes, unaffected.

## Redirects added
`next.config.ts` — new `async redirects()` block (file previously had no `redirects()`, only `headers()`; matched existing array-of-objects convention):
- `/analytics` → `/analyze` (permanent)
- `/batch` → `/create?mode=batch` (permanent)
- `/generate` → `/create?mode=single` (permanent)
- `/competitors` → `/analyze?tab=competitors` (permanent)
- `/home` → `/analyze` (permanent)
- `/meta` → `/analyze?source=meta` (permanent)

## Verification
- `npx vitest run` — 879/879 tests, 98/98 files passing (unchanged).
- `npx eslint .` — 0 errors, 91 pre-existing warnings (none in touched files).
- `npx tsc --noEmit` — same 3 pre-existing errors as baseline (`scripts/_delpost.ts`, `src/lib/meta/__tests__/deep-profile.test.ts`, `tests/e2e/brain.spec.ts`), zero new. Note: deleting the six page dirs left 12 stale `TS2307` errors in the auto-generated `.next/types/validator.ts` / `.next/dev/types/validator.ts` (typed-routes files referencing the now-gone page modules). Deleted the `.next` build cache to clear them — confirmed clean afterward. Anyone rebuilding will regenerate these automatically; not a source issue.
- Post-delete grep for `/analytics`, `/batch`, `/generate`, `/competitors`, `/home`, `/meta` (exact path-boundary pattern) across `src` — zero remaining references except one unrelated test mock string (`url-state.test.tsx:11`, `mockPathname = '/analytics'`, a generic hook fixture not tied to route existence).
- Did not run `npm run build` per instructions (pre-existing untracked `scripts/_delpost.ts` breaks it, not mine).

## Git
`git add` + `git commit` only, no branch operations performed.
