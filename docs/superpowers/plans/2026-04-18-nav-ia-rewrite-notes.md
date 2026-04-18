# Nav & IA rewrite — Phase 0 inventory

Base branch: `feat/nav-ia-rewrite` off `main` at `051108a` (bf80776 + 4 buffer image uploads, no code changes).

## Nav-related files

- **Current sidebar:** `src/components/sidebar.tsx` — 201 lines, 9 items (Home, Create, Batch, Smart Posts, Analytics, Competitors, Meta, Settings, Profile), collapsible, mobile hamburger, has its own brand filter + session footer with sign out. Mounted in `src/app/(dashboard)/layout.tsx:11`.
- **Current top nav:** `src/components/nav.tsx` — 57 lines, 4 items (Dashboard, Create, Batch, Schedule). **Not imported anywhere** (`git grep "from '@/components/nav'"` returns nothing). The earlier grep match was the landing page `src/app/page.tsx` using a literal `<nav>` element inline. So Phase 2 simplifies to deleting `src/components/nav.tsx`.
- **Landing page nav:** `src/app/page.tsx` — inline `<nav>` + sticky `<header>`. Do NOT touch. It's the marketing site.

## Dashboard layout

`src/app/(dashboard)/layout.tsx` (17 lines):

```tsx
<OnboardingGate>
  <Sidebar />
  <main className="ml-0 md:ml-60 min-h-screen ...">
    <div className="max-w-7xl mx-auto ...">{children}</div>
  </main>
</OnboardingGate>
```

Swap `<Sidebar />` for `<AppSidebar />` in Phase 1. `OnboardingGate` stays.

## BrandRequiredGate callers (Phase 7 targets)

```
src/app/(dashboard)/analytics/page.tsx
src/app/(dashboard)/batch/page.tsx
src/app/(dashboard)/competitors/page.tsx
src/app/(dashboard)/generate/page.tsx
src/app/(dashboard)/smart-posts/page.tsx
```

All 5 follow the same pattern: page header → `<BrandRequiredGate feature="...">` → content. Replace each with `<SetupBanner />` at top + inline empty state on content when no brand.

## Meta redirect (Phase 9)

`src/app/(dashboard)/meta/page.tsx` wraps `MetaRedirect` from `./redirect.tsx` in Suspense. `MetaRedirect` builds target `/analytics?source=meta&<preserved params>`. Phase 9 changes that target to `/analyze?source=meta&...`.

## Smart Posts state hook (Phase 8)

`src/components/smart-posts-dashboard.tsx` uses `useHubState` from `@/lib/url-state` for source/brand/ig. `useIgAccounts` from `@/lib/ig-accounts` gives IG account list. Top performers strip should reuse both.

The dashboard already has a `god-mode` path gated by `source === 'meta' && Boolean(ig)`. Phase 8 enriches the POST body with optional `likeOfMediaId` when the URL has `?likeOf=<mediaId>`.

## Routes present today

`src/app/(dashboard)/`: analytics, batch, competitors, generate, home, meta, profile, schedule, settings, smart-posts. New routes needed: `analyze`, `create`.

## Tech stack quick reference

- Next.js App Router (see `AGENTS.md`: "this is NOT the Next.js you know" — read `node_modules/next/dist/docs/` before writing code that could differ)
- Tailwind for styling; Lucide icons
- next-auth for session
- `useSearchParams` requires `Suspense` wrapper for static shelling
