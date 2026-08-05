# Platform UI/UX Sweep — Prioritised Plan
**Date:** 2026-08-05
**Inputs:** four specialist audits (readability/contrast, page redundancy, broken/silent-failure, language clarity) over all 18 dashboard pages.
**Audience goal (owner's brief):** non-technical marketers must be able to open any page and "say exactly what to do really easily" — Apple-style clarity, no jargon, no unreadable grey text.

---

## The shape of the plan

12 work items in 3 waves. Wave 1 is a single low-risk session that fixes what the owner actually complained about (unreadable text) plus deletes the dead routes. Wave 2 builds the two owner-named features (account picker on `/analyze`, post-level leaderboard). Wave 3 cleans up the silent failures that make the app feel flaky.

Two facts constrain everything:

- **The creative genome has zero recorded posts** (switched on today; ~7 weeks until scores are trustworthy). Nothing in this plan depends on genome data.
- **Organic post data exists now**: 63 posts with reach and likes. The leaderboard is built from that, today.
- **Ads have never delivered a single impression.** The ads side of the leaderboard will be an honest empty state, not a designed-around illusion.

---

## Wave 1 — "Read it and trust it" (5 items, one session, highest impact-to-risk ratio)

Items 1–3 are one commit's worth of token/CSS work and safe to do together. Item 4 is a separate commit. Item 5 is pure copy edits, safe alongside anything.

### 1. Fix the two grey text tokens (fixes 600+ usages at once)
- **What:** In `src/app/globals.css` `.dark` block: `--muted` `#8A8F98` → `#A2A7B0`; `--muted-2` `#6B7178` → `#8E939C`. Optionally `--line` `rgba(255,255,255,.07)` → `.14` and `--line-strong` `.12` → `.20` so card edges stop being invisible (1.2:1 today).
- **Files:** `src/app/globals.css` only.
- **Why it matters:** This *is* the owner's "light grey on black is almost impossible to read" complaint. `--muted-2` fails WCAG AA on every surface (3.19–3.87:1, used 205 times); `--muted` passes by 0.34 margin on the most-used panel surface (392 usages) — nominally compliant, practically hard to read. Two token edits fix every page simultaneously; no per-page work.
- **Effort:** S. **Risk:** near zero — colors shift slightly lighter everywhere; the two-tier hierarchy is preserved (audit verified new values keep muted-2 visibly dimmer while both clear 4.5:1). Eyeball 2–3 pages after.

### 2. Sidebar section labels off the dimmest tier
- **What:** `src/components/layout/app-sidebar.tsx:102,109` — 11px labels using `text-(--muted-2)`. Move to `text-(--muted)` and consider 12px. This is permanent chrome on every page: worst token + smallest font in the app.
- **Effort:** S. **Risk:** none.

### 3. Stop using flat `--violet` as text color
- **What:** `--violet` (#8B5CF6) fails AA as text on card surfaces (3.7–3.95:1). Grep the isolated `text-(--violet)` cases and swap to `--violet-bright` (#A78BFA, passes at 6.1–7:1). Reserve flat `--violet` for fills (buttons/badges with white text).
- **Files:** small set — chip/badge labels and link accents; grep `text-(--violet)` to enumerate.
- **Effort:** S. **Risk:** none.

### 4. Delete the six shim routes and the dead code that props them up
Verdicts and required repointing (all six are pure `router.replace()` shims with zero unique UI or API — see decisive calls section below for the one-liner). Order of operations:
1. Repoint `/analytics` links: `src/components/smart-posts-dashboard.tsx:524,830` → `/analyze`. (`command-center.tsx:248` is moot — see next.)
2. **Delete `src/components/command-center.tsx`** — fully built but imported/rendered nowhere; it is the only thing linking `/generate` and `/batch`.
3. Repoint auth landing: `src/auth.ts`, `login-form.tsx`, `register-form.tsx` → `/analyze` instead of `/home`.
4. Repoint OAuth callback: `src/app/api/meta/instagram/oauth/callback/route.ts` → `/analyze?source=meta...` directly instead of bouncing through `/meta`.
5. Delete the six page files: `(dashboard)/analytics`, `/batch`, `/generate`, `/competitors`, `/home`, `/meta`.
6. Add `redirects()` entries in `next.config` for all six old paths (server-side, permanent) so stale bookmarks/external links don't 404 — this also kills the blank-flash the client shims had.
- **Do NOT delete** `src/components/performance/brand-selector.tsx` even though it's dead code — Wave 2 item 6 wires it up. Keep `/api/competitors*` and `/api/analytics/ask` routes (live, used by the Competitors tab and `/ask`).
- **Why it matters:** fewer routes to maintain, no invisible redirect hops, one canonical URL per feature.
- **Effort:** M. **Risk:** the auth-landing and OAuth-callback repoints touch login flow — test a real login and a Meta reconnect before merging. This is the one Wave 1 item to do as its own commit with a smoke test.

### 5. Plain-English copy pass (mechanical relabels, no logic changes)
One commit of string edits, using `/research` and `/autopilot` as the house-style model:
- **`/ads` metrics grid** (`AdDashboardCard.tsx:100-110`): "CTR" → "Click rate (% who saw it and clicked)"; "CPC" → "Cost per click"; "Impressions (times shown)" vs "Reach (people who saw it)"; "Frequency (avg. times each person saw it)"; **render the existing-but-unused `resultType` field**: "Results (link clicks): 42".
- **`/intel`** (`creative-intel-panel.tsx`): `n=12` → "12 posts"; rewrite "confidence bar"/"chase noise" sentence (page.tsx:11-13) per clarity audit's replacement; score explainer (lines 118-121) → "combines how many people saw the post and how many saved it — saves count for more."
- **`/autopilot`** (`brand-panel.tsx:231,611,629`): "Daily cron fires at 03:00 UTC" → "Runs automatically every night — check back in the morning"; drop "Brain v{n}".
- **`/analyze`** (`compare-section.tsx:53`): "Median engagement (likes)" → "Typical post likes".
- **`/ask`** (`page.tsx:12-13`): remove the SQL/database reassurance sentence → "this tool only reads your data, it never changes anything."
- **Effort:** S. **Risk:** none — strings only. (Genome-page copy is deliberately excluded: item 7 rebuilds that page.)

---

## Wave 2 — The two features the owner asked for by name (3 items)

### 6. Account/brand picker on `/analyze` (owner: "doesn't let you pick your account")
- **What:** The audit found the exact cause: `analyze-page.tsx:17-18` reads `?brand=` from the URL but *nothing on the page sets it* — so `brandId` is always null, analysis runs unscoped, and the Brand Brain panel (`line 28`, gated on `brandId`) has never rendered for any real user. Meanwhile a fully built `BrandSelector` (`src/components/performance/brand-selector.tsx`) sits imported nowhere.
- **Do:** Render `BrandSelector` at the top of `analyze-page.tsx`, writing `?brand=` via the existing URL-state pattern (`useHubState` in `src/lib/url-state.ts`). Auto-select the first brand when the param is absent so the Brain panel appears by default. Sync the Competitors-tab picker (`competitor-dashboard.tsx:97,120,393-415` — currently local state, lost on refresh) to the same URL param. Change the deep-profile "skipped" step (`run-analysis.ts:52-61`) to say *why*: "No Instagram account selected — pick one above."
- **Why it matters:** this is the single most-reported functional gap, and it un-hides an entire shipped feature (Brand Brain) for free.
- **Effort:** M. **Risk:** URL-state interactions between the picker, the legacy accordion tabs, and `RunAnalysisButton` — test brand-switch → run-analysis → refresh. Do not attempt to redesign the "Detailed views (legacy)" accordion in the same change; that's a separate, cuttable polish task.

### 7. Post-level leaderboard (owner's "really awesome feature") — full design below
- **What:** Rebuild `/ads/genome` as a **Leaderboard page**. The current page ranks abstract *ingredients* with 3-decimal shrinkage-adjusted scores — a statistics dump no marketer can act on, and with zero genome observations it will show "no data" rows for ~7 weeks anyway. Posts, not ingredients, become the headline. Keep the route (`/ads/genome`) to avoid link churn; rename the sidebar entry to **"Leaderboard"**.
- **Design:**
  - **Two tabs, same as today's surface toggle:** "Instagram posts" | "Ads".
  - **Instagram posts tab (live today, from the 63 posts with recorded reach/likes in `postAnalytics`):** ranked list, #1 down. Each row: rank, thumbnail, first line of caption, posted date, **Reach** (the ranking metric — people actually reached, the number the brain already optimises for), **Likes**, and **likes-per-reach as "Engagement rate"**. Where the existing angle→reach attribution (caption-match, already built for the learning loop) knows the post's angle/hook, show it as a chip on the row — that is the "do more of this" handle.
  - **A verdict sentence at the top, not a stat:** e.g. "Your top 10 posts reached 12,400 people. 6 of them used the *open-loop question* hook — do more of that." Computed from the top-N rows' attribution chips; if attribution covers too few posts, fall back to "Your best post reached Nx more people than your typical post."
  - **Ranking metric:** reach, descending. It exists today for all 63 posts, it's what the autopilot brain already optimises, and it answers "which posts worked." Likes and engagement rate are displayed but don't rank (likes alone favours small-reach flukes).
  - **Ads tab:** honest empty state, stated plainly: "Your ads haven't reached anyone yet — no impressions recorded so far. Once an ad is live and delivering, it ranks here by cost per result." No skeleton UI pretending data is coming. (Ads have literally never delivered an impression; designing a populated view now would be fiction.)
  - **The existing ingredient table survives, demoted:** a collapsed section at the bottom, "What's inside the winners (early — building up over the next few weeks)", with the clarity audit's relabels applied (reuse `DIMENSION_LABELS` from `creative-intel-panel.tsx:18-23`; "prior borrowed from Instagram" → "estimated from your Instagram posts — not enough ad data yet"; drop the raw `0.023` numbers in favour of relative bars/rank). It becomes genuinely useful when the genome has data, without holding the page hostage until then.
- **Files:** `src/app/(dashboard)/ads/genome/page.tsx` (rebuild), new API route or extension of `/api/creative/genome` to serve ranked posts from `postAnalytics`, `app-sidebar.tsx` (label), reuse attribution logic from the learning-loop code.
- **Why it matters:** it's the difference between "here are statistics" and "here's what worked — make more of it," which is the owner's entire brief in one page.
- **Effort:** L (the one large item in the plan). **Risk:** low on the read path (new read-only query); the verdict sentence depends on attribution coverage — build it defensively with the fallback above.

### 8. `/ask` answers rendered as sentences/tables, not raw JSON
- **What:** `ask-panel.tsx:99-106` prints `JSON.stringify(row)` in a `<pre>` — the clarity audit's single worst comprehension failure. Since the backend is a *fixed set of hand-written queries* (`/api/analytics/ask`), each known question can have a known renderer: a plain sentence for single-row answers ("Reach was 1,023 on 30 Jul, down from 1,800 the week before"), a labelled two-column table for lists (reuse the `CompareRow` pattern from `compare-section.tsx`). Also upgrade the "No data for that yet." empty state to say why and what to do.
- **Effort:** M. **Risk:** none beyond the panel itself; fixed query set means no open-ended formatting problem.

---

## Wave 3 — Silent-failure cleanup + nav polish (4 items)

Safe to parallelise; each is an independent component.

### 9. Batch generate: guard the no-brands silent no-op
- **What:** `batch-gallery.tsx` — clicking "Generate 5 Posts" with zero brands (or before `/api/brands` resolves) spins through "Generating 0/0…" and produces nothing, no message. Copy the exact guard its sibling already has (`post-generator.tsx:835-847`: "No brands yet — create one in Settings") and disable the button until brands are loaded.
- **Effort:** S. **Risk:** none.

### 10. `/create` busy states on the two feedback-less buttons
- **What:** "Random Generator — Viral Post" (`post-generator.tsx:855-860`) has no disabled/spinner state across a multi-second, multi-fetch chain — users double-click and race the handlers. "Generate" caption button (`:953-959`) shows zero progress when image search returns empty. Add a busy flag to each, disable while in flight.
- **Effort:** S. **Risk:** none.

### 11. Surface swallowed errors: AgentPlanPanel + ImageSourceSelector
- **What:** `agent-plan-panel.tsx:25-36` renders literally nothing for loading, empty, *and* hard failure (whole feature vanishes silently on `/ads/queue`) — add a loading line and an error line. `image-source-selector.tsx` swallows search/generate failures to `console.error` only — track and render an error string like its siblings (`ask-panel.tsx`, `candidate-strip.tsx`) already do. Also add the missing `res.ok` check in `AdDashboardCard.askAi` (`:63-77`) so server errors stop rendering as AI advice.
- **Effort:** S. **Risk:** none.

### 12. Nav: add `/ads/queue`, apply the grouped IA
- **What:** `/ads/queue` is a real, actively used dashboard reachable only via a link inside `/ads` — add it to the sidebar. Apply the redundancy audit's grouping (marketer intent, not system internals): **Create** (`/create`, `/smart-posts`) · **Automate** (`/autopilot`) · **Ads** (`/ads`, `/ads/queue`, Leaderboard) · **Insights** (`/analyze`, `/intel`, `/ask`) · **Research** (`/research`) · avatar menu (`/settings`, `/profile`).
- **Files:** `src/components/layout/app-sidebar.tsx` (the live sidebar — note `components/sidebar.tsx` is legacy dead code; do not edit it).
- **Effort:** S–M. **Risk:** none functional; sequence it *after* Wave 1 item 4 so the groups reflect the surviving routes.

---

## Decisive calls on the six deletion candidates

**Delete all six.** Every one is a pure `router.replace()` shim with no unique UI and no API of its own:

| Route | Verdict | Repoint first |
|---|---|---|
| `/analytics` | Delete | `smart-posts-dashboard.tsx:524,830` → `/analyze` (the `command-center.tsx:248` caller is itself dead code and gets deleted) |
| `/batch` | Delete | nothing live links it (only dead `command-center.tsx`); `next.config` redirect → `/create?mode=batch` |
| `/generate` | Delete | same; redirect → `/create?mode=single` |
| `/competitors` | Delete | zero inbound links anywhere; redirect → `/analyze?tab=competitors`; **keep** `/api/competitors*` routes (live) |
| `/home` | Delete | `src/auth.ts`, `login-form.tsx`, `register-form.tsx` → `/analyze`; redirect → `/analyze` |
| `/meta` | Delete | `src/app/api/meta/instagram/oauth/callback/route.ts` → `/analyze?source=meta` directly; redirect → `/analyze` |

Plus: delete `src/components/command-center.tsx` (never rendered). Keep `brand-selector.tsx` (wired up in item 6). All six get permanent `next.config` redirects so old bookmarks survive.

---

## What I am choosing NOT to do, and why

- **Any feature that depends on genome scores** — zero observations, ~7 weeks to trust. The ingredient table survives only as a demoted, honestly-labelled section (item 7).
- **A designed ads leaderboard view** — ads have never delivered an impression. It gets a plain-truth empty state; building visualisation for data that has never existed is wasted work.
- **`/profile` fixes** (shared `saving` state between the two forms; stale sidebar name after rename) — real but trivial-impact bugs on a page marketers rarely visit. Backlog.
- **APP-objective dead code in `StepGoal.tsx`** — unreachable by users and deliberately parked (business portfolio is blocked from claiming apps). Removing it is churn with zero user-visible gain; revisit when the Meta block clears.
- **AskPanel's unused `canAnswer` field** — the same suggestions are already on screen; cosmetic dead code.
- **Per-item error reporting in the competitor Scan & Analyze flow** — swallowed sub-steps are discoverable via the final list count; low frequency page, low payoff.
- **Redesigning the "Detailed views (legacy)" accordion on `/analyze`** — item 6 fixes the actual complaint (no picker). Restructuring the legacy tabs is a bigger design question; not blocking anything.
- **A full sidebar IA rewrite beyond item 12** — the existing nav memory notes a 12-phase rewrite plan exists separately; this sweep only regroups and adds the missing entry.

## Unverified / auditor gaps (stated, not papered over)

- **`/smart-posts`** was clarity-checked only at the header and health-score line; its full copy was not audited. The one hard constraint (single composite Generate button) was verified NOT regressed.
- **`/settings` sub-panels** (`SettingsPanel`, `BrandVoiceSettings`, `BrandManager`) were verified for broken functionality (clean) but **not** audited for language clarity.
- **`/analyze`'s full component tree** (`analyze-tabs.tsx`, `run-analysis-button.tsx`, `insight-feed.tsx`, `learnings-cta-dock.tsx`) was only spot-checked for clarity.
- **DB state was not inspected**: whether `creativeIngredients` is seeded in prod determines which genome empty state actually renders today (the audit believes the "Nothing recorded yet" banner is unreachable if seeded). Item 7 makes this moot but verify during build.
- **Everything above is from static code reading** — no live-browser pass was run. A quick `/qa` smoke of login → analyze → create → ads after Wave 1 lands is cheap insurance, especially for the auth/OAuth repoints.

## Auditor conflicts resolved

- Redundancy audit initially assumed `/settings` was under-linked; it self-corrected (sidebar has an Account section). No action.
- Broken-audit says the genome "Nothing recorded yet" copy path is likely dead; clarity-audit proposed new copy for it. Resolution: item 7 rebuilds the page, superseding both.
- Readability audit notes `--muted` technically *passes* AA yet is probably what the owner is complaining about. Resolution: raise it anyway (item 1) — the brief is "easy to read," not "technically compliant."
