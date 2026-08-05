# Resume state

**Updated:** 2026-08-05
**Branch:** `main` (feat/creative-genome and feat/organic-genome both merged)
**Deployed:** production green, CI green, main == develop

Written so this work can survive a context reset. Trust this file and `git log`
over recollection.

---

## DONE and shipped

| What | Commits | State |
|---|---|---|
| Creative genome, ads rail (8 tasks) | `ac57ea5..deda91b` | live |
| Creative genome, organic rail | `f106ed5`, `d841979` | live |
| `CREATIVE_GENOME_ENABLED=true` in production | `d2a1db0` | **ON since 2026-08-05** |
| Affectly researched against fitness by mistake | `2626f5d` | fixed, prod + dev |
| 13 lint errors cleared, lint now a CI gate | `dce572b` | live |
| package-lock resynced, CI back on `npm ci` | `2c28633` | live |
| `/ask` three defects | `962f843` | live |
| Hook-shape history read backwards | `7691da6` | live |
| Variety + pain steering wired into autopilot | `9f0ae94`, `3f476d9` | live |

Suite at last check: **879 tests / 98 files, 0 lint errors.**
Pre-existing typecheck errors (NOT ours, ignore): `scripts/_delpost.ts`,
`src/lib/meta/__tests__/deep-profile.test.ts`, `tests/e2e/brain.spec.ts`.
`scripts/_delpost.ts` is untracked and breaks `npm run build` locally only.

---

## IN FLIGHT — platform-wide UI/UX sweep

Four read-only auditors dispatched 2026-08-05. Each writes full findings to a
file; they return only short summaries.

Scratchpad: `C:\Users\nickc\AppData\Local\Temp\claude\C--Projects-Social-social-app\f64f4cd3-183b-401b-9373-050dda08267e\scratchpad\`

| Agent | Output file | Covering |
|---|---|---|
| sweep-readability | `sweep-readability.md` | WCAG contrast per token, exact replacement values |
| sweep-redundancy | `sweep-redundancy.md` | all 18 pages: keep/merge/delete/add-to-nav, plus new IA |
| sweep-broken | `sweep-broken.md` | dead buttons, missing endpoints, empty states that look broken |
| sweep-clarity | `sweep-clarity.md` | jargon, meaningless numbers, screens with no next action |

**Next action after they report:** dispatch a **Fable 5** supervisor to
synthesise the four files into one prioritised plan, present it to Nick BEFORE
making any edits, then execute.

### Owner's brief for the sweep
- Audience is marketers who are NOT tech-savvy. Apple-like: always obvious what
  is going on and what to do next.
- Named fault: light grey text on black is almost unreadable.
- Named fault: `/intel` is too complex to understand.
- Named fault: `/analyze` may be redundant and has no account picker.
- 18 dashboard pages exist, only 9 are in the sidebar.

---

## SWEEP PROGRESS

**Plan:** `docs/superpowers/plans/2026-08-05-platform-sweep.md` (12 items, 3 waves)
**Branch:** `feat/platform-sweep`, merged to main and develop

**WAVE 1 — DONE and shipped** (`9f849ea`, `8c2c40d`, `57cc69b`)
- Contrast fixed at the token level. `--muted` #8A8F98 -> #A2A7B0 (4.84 ->
  ~6.4:1), `--muted-2` #6B7178 -> #8E939C (3.19 FAIL -> ~4.9:1 PASS), sidebar
  labels off the dimmest tier, flat `--violet` as text -> `--violet-bright`
  across 13 files (3.72 FAIL -> 6.1-7:1). Zero bracket-form `text-[--x]` found
  or introduced.
- Six redirect-shim pages deleted (/analytics /batch /generate /competitors
  /home /meta) plus dead command-center.tsx. Dashboard is 18 pages -> 11.
  6 permanent redirects added to next.config.ts so bookmarks do not 404.
  The cleanup agent found a SECOND Meta OAuth callback not in my brief
  (`src/app/api/meta/oauth/callback/route.ts`, the ad-account one) that also
  pointed at a deleted page. Repointed.
- 879 tests / 98 files, 0 lint errors.

**PROCESS FAILURE TO NOT REPEAT:** I ran two implementers in parallel in ONE
working tree. Their `git add` calls collided and commit 9f849ea contains both
agents' work under a message describing only one. Content verified intact; only
the history is muddled. Run ONE implementer at a time in a shared tree.

**WAVE 2 — NEXT, not started.** Needs a fresh context; the leaderboard is the
biggest remaining build.
1. `/analyze` brand picker — `brand-selector.tsx` EXISTS and is imported
   nowhere. Wire it via `?brand=` URL state, auto-default to the first brand.
   This also un-hides the Brand Brain panel, which has never rendered.
2. **Post-level leaderboard replacing the ingredient table on `/ads/genome`.**
   Organic tab is live TODAY from 63 posts (rank by reach, show likes and
   engagement rate, angle chips, a "do more of X" sentence). Ads tab is an
   honest empty state until an ad delivers. Demote the ingredient table to a
   collapsed section. See plan §4 for the full design.
3. `/ask` renders raw `JSON.stringify` in a `<pre>` — replace with sentences
   and tables (`ask-panel.tsx:99-106`).

**WAVE 3 — not started.** Batch no-brands guard, /create busy states, surface
swallowed errors (AgentPlanPanel, ImageSourceSelector, askAi res.ok), add
/ads/queue to nav + grouped IA.

**ALSO CONFIRMED, fix during Wave 2:** `/ads/genome`'s "Nothing recorded yet"
banner is unreachable — gated on `dimensions.length === 0` (page.tsx:65) but
the API always returns 6 dimensions from the seeded vocabulary (route.ts:59).

---

## OUTSTANDING (beyond the sweep)

1. **Leaderboard of POSTS on `/ads/genome`.** Owner explicitly wants this and
   the current page is not it. Today the page ranks INGREDIENTS (which hook
   types work). He wants to see which actual social posts and ads are ranking,
   both surfaces side by side. Organic post data exists today (63 posts with
   reach and likes); ads have none until an ad delivers.
2. **Ads status reconciliation.** `meta_ads.status` is written only by our own
   app, so it cannot see a change made in Ads Manager or by a Meta rule. Build
   the Buffer-style drift check. Low value until ads actually run.
3. **Roadmap doc is stale** in ~6 places: `docs/marketing-agent-roadmap.md`.
   Rewrite against the verified agent-sweep findings from 2026-08-03.
4. **Organic genome has no warm start** until data accrues. Expect
   `/ads/genome` to read "too few to trust" for roughly 7 weeks of posting.
   Ads stay empty until an ad reaches 500+ impressions.

---

## Gotchas that have already cost time

- **Local `main` goes stale fast** — the app commits its own generated images to
  main. Always `git fetch` and rebase before merging.
- **Dev and production are DIFFERENT Neon databases.** `.env.local` is dev,
  `.env.vercel-production` is prod. Check which one a diagnostic is reading.
- **Vercel bakes env vars at build time.** Setting one needs a redeploy.
- **Tailwind v4:** use `text-(--x)` parentheses. `text-[--x]` silently renders
  nothing.
- **Review subagents on this harness frequently complete their analysis then go
  idle without reporting.** Five of six did during the genome build. Prompt once,
  then do the verification directly and record it as a controller action.
- **Subagents must be forbidden from any git branch operation.** One wandered to
  main previously and orphaned commits.

---

## SWEEP AUDIT RESULTS (2026-08-05) — all four auditors reported

Full findings in the scratchpad files listed above. Headlines:

**Readability.** One token causes the owner's "light grey on black" complaint:
`--muted-2` (#6B7178) scores 3.19:1 on sidebar labels, 3.39:1 on cards,
3.87:1 on page bg. WCAG AA needs 4.5:1. 205 usages, 60 paired with 11-12px
text. `--muted` (392 usages) passes at only 4.84:1, near-zero margin.
Proposed: `--muted` -> #A2A7B0, `--muted-2` -> #8E939C, and stop using flat
`--violet` as text (3.72:1) in favour of `--violet-bright`.
=> Two token edits fix 200+ usages at once.

**Redundancy.** /analyze is the real hub; /analytics is a redirect shim.
Six bare-redirect pages deletable: /analytics /batch /generate /competitors
/home /meta. /ads/queue is a real dashboard missing from nav. NO genuine
feature overlap found; create vs smart-posts, research vs intel are distinct.

**Broken.** /analyze has NO brand picker — brandId only ever comes from the
URL (analyze-page.tsx:17-18,28), so the Brand Brain panel never renders. A
finished BrandSelector component exists and is imported nowhere.
Also: batch-gallery can silently generate zero posts; profile shares one
`saving` flag across two buttons; AdDashboardCard renders raw error JSON as
if it were AI advice. No missing API routes anywhere.

**Clarity.** /ask renders answers as raw JSON.stringify in a <pre> block —
the worst offender. /ads/genome is untranslated stats jargon with no
recommendation anywhere on the page. /research and /autopilot already follow
the desired plain-English style and are the model to copy.

**CONTROLLER-CONFIRMED BUG:** /ads/genome's "Nothing recorded yet" banner is
gated on `dimensions.length === 0` (page.tsx:65), but the API builds
dimensions from the 23 seeded ingredients and filters to non-empty
(route.ts:59), so it is ALWAYS 6. The empty state is unreachable; the user
sees 23 rows of "— no data" instead. This is why it looked broken.

**IN FLIGHT:** Fable 5 supervisor synthesising all four into
`docs/superpowers/plans/2026-08-05-platform-sweep.md`. Present to Nick for
approval BEFORE any edits.
