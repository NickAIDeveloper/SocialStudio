> **SUPERSEDED by `PLAN-performance-hub.md`.** That plan merges Analytics +
> Meta into one page instead of keeping them as separate tabs under a shared
> shell. Kept here for history.

# Plan: Unified Insights Hub (Option B)

Consolidates Smart Posts, Analytics, Competitors, and Meta into one shell
with a persistent header — shared brand selector, connection badges, and a
data-source switcher. Each current page becomes a tab.

## Goals

1. One mental model: "this is the Insights hub; the tabs slice by question."
2. Meta-powered vs original-scrape data sources are equal-class citizens.
   Either works wherever the page's question is answerable from that source.
3. Preserve the existing scrape pipeline verbatim. No silent changes to
   behavior. Users can still do "just run the old scan."

## Non-goals

- Do NOT touch `/generate`, `/batch`, `/schedule`, `/home`, `/settings`, or
  `/profile`. Those are production-quality flows; out of scope.
- Do NOT merge the `/meta` OAuth connection pages or the Buffer settings
  into the hub. They stay as-is; the hub just *reads* their connection
  state.

## Routes

Keep existing URLs (don't break deep links):

- `/smart-posts`
- `/analytics`
- `/competitors`
- `/meta`

Each page swaps its outer shell for `<InsightsHubShell activeTab="…">`. The
four page files become thin wrappers; the shell is the single source of
truth for the header.

## New files

- `src/components/insights-hub/shell.tsx` — layout wrapper with header +
  `{children}` slot. Accepts `activeTab`.
- `src/components/insights-hub/connection-badges.tsx` — FB, IG, Buffer
  dots with hover tooltips. Fetches once at hub mount via new
  `/api/connections/status` endpoint.
- `src/components/insights-hub/brand-selector.tsx` — lifted from
  `smart-posts-dashboard`. Stored in `localStorage` under
  `insightsHub.brandId` so the selection persists across tabs.
- `src/components/insights-hub/source-switcher.tsx` — two-button toggle:
  `Meta insights | Scrape`. Meta button disabled (w/ tooltip) when
  `!connections.meta.anyConnected`. Stored in `localStorage` under
  `insightsHub.source`.
- `src/components/insights-hub/tabs.tsx` — `<Link>`-based tab bar that
  preserves active source + brand across nav via URL.
- `src/app/api/connections/status/route.ts` — one GET that returns
  `{ meta: { ig, fb }, buffer: { connected } }`. Cheap; reads from same
  DB rows the existing `/api/meta/account`, `/api/meta/instagram/accounts`,
  `/api/buffer` use.

## Shared state

Brand and source live in URL query params + localStorage:

- `?brand=<id>&source=meta|scrape`
- Shell hydrates from URL; on change, push state + write localStorage.
- All four pages read these via `useSearchParams`; no context provider
  needed (keeps SSR boundaries simple).

## Per-tab changes

### Smart Posts

- Header: shell.
- Body: unchanged (already has one composite Generate button — matches
  feedback memory).
- Source switcher: when `source=meta`, prefill `metaOverrides` from the
  currently-viewed IG account's best format/slot/top-post (same signals
  today's `ApplyAllLearningsCta` bundles). No user action required.
- When `source=scrape`, current insight-card seed is used (status quo).

### Analytics

- Header: shell.
- Body: split into two tabs within the page:
  - **Posts** (existing leaderboard + PostAnalyzer)
  - **Meta** (surfaces the `/meta` post list + format strip + heatmap when
    `source=meta`)
- `Refresh` button acts on the active source.

### Competitors

- Header: shell.
- Body: unchanged list.
- Add **"Enrich with Meta data"** button next to the existing scan
  button. When Meta is the source, competitor scorecards prefer the
  account-level numbers Meta already exposes; scrape fills the rest.
- This respects: *"do not lose the original scanning approach"*.

### Meta

- Header: shell.
- Body: current `MetaHub` content, unchanged except:
  - `ApplyAllLearningsCta` stays but now just changes `source=meta` and
    navigates to `/smart-posts` — the shell carries the overrides.
  - `ConnectionCard` + `AdAccountSelector` + `InstagramSection` stay.

## Rollout order (fresh session)

1. **Scaffolding** — new `/insights-hub/` folder + `shell.tsx` + empty
   sub-components. `/api/connections/status` route.
2. **Smart Posts migration** — swap its outer shell. Verify existing
   `?preset` flow still works. Verify Generate button.
3. **Meta migration** — swap shell. Verify OAuth callback still lands.
4. **Analytics migration** — swap shell, add Meta sub-tab.
5. **Competitors migration** — swap shell, add Meta-enrich button.
6. **Source-switcher wiring** — hook it into each page's data fetch.
7. **Polish** — shared brand selector, localStorage persistence, keyboard
   nav.
8. **E2E smoke** — Playwright: navigate all four tabs, toggle source,
   generate a Smart Post with Meta source, confirm preset banner shows.

## Risks

- **Hydration:** shell uses `useSearchParams`, so every page needs a
  `<Suspense>` boundary. Already required on /meta and /smart-posts;
  add to /analytics and /competitors pages.
- **OAuth callback redirects** land on `/meta?connected=1` today. The
  shell must not strip that query param on first render.
- **localStorage source leak across users**: store under a user-specific
  key or clear on logout (current app probably already has a hook for
  this — verify).

## Success criteria

- All four pages share one header.
- Source switcher is visible and works on every page.
- Meta button correctly disables when no IG/FB is connected.
- Existing scrape flow still works unchanged when `source=scrape`.
- No regressions in `/generate`, `/batch`, `/schedule`, `/home`.
- `ApplyAllLearningsCta` → Smart Posts still produces a seeded generation.
