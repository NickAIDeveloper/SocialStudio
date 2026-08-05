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

**WAVE 2 — DONE, not yet merged.** On `feat/platform-sweep`.
| What | Commit |
|---|---|
| `/analyze` brand picker + Brand Brain un-hidden | `f5d0f76` |
| Post-level leaderboard replacing the ingredient table | `c5a9396` |
| `/ask` sentences and tables instead of raw JSON | `bc1c5ef` |
| Wave 1 item 5 plain-English copy pass (had never been applied) | `a80d0f7` |

Suite now **944 tests / 103 files, 0 lint errors**, no new typecheck errors.

Details worth keeping:
- `resolveIgForBrand` extracted from `smart-posts-dashboard.tsx` to
  `src/lib/brand-ig.ts`; `/analyze` and `/smart-posts` share it. The brand
  picker only pushes `ig` on an ACTUAL brand change, so the legacy accordion's
  own IG picker is not snapped back.
- Leaderboard verdict names the angle that OUT-REACHES the rest, never the most
  frequent one. Counting occurrences would have crowned the collapsed
  "Your X is lying" myth shape and told the owner to make more of the exact
  pattern the variety engine exists to break up. An angle also needs
  MIN_CONFIDENT_SAMPLES (5) posts behind it.
- Verified against PRODUCTION, not assumed: 65 posts carry reach (only 16 have
  `posts.angle` set, the rest infer from hook text and all 65 have one); 11 ads
  exist with ZERO recorded impressions, so the ads tab shows its empty state.
  Live verdict reads: "Your top 10 posts reached 201 people. Posts that open
  with a number reach 11 people on average, against 7 for the rest."
- Reusable diagnostics, left UNTRACKED like the other diag scripts:
  `scripts/diag-leaderboard.mjs` (SQL only) and
  `scripts/diag-leaderboard-verdict.ts` (runs the real ranking code over prod,
  `npx tsx`).
- The `/ads/genome` "Nothing recorded yet" unreachable-banner bug is FIXED: the
  demoted ingredient section keys its empty state off whether any OBSERVATIONS
  exist, not `dimensions.length === 0`.
- Sidebar entry renamed Genome to Leaderboard.

**WAVE 3 — DONE** (`70481bc`). Batch no-brands guard, /create busy states on
the two feedback-less buttons, three swallowed errors surfaced (AgentPlanPanel
loading/empty/error, ImageSourceSelector search+generate, AdDashboardCard.askAi
missing res.ok), `/ads/queue` added to the sidebar and the nav regrouped by
marketer intent (Make posts, Automate, Advertising, Insights, Account). Group
headings never repeat an item label, and `/ads` no longer highlights while one
of its children is open.

**THE SWEEP IS COMPLETE.** All 12 plan items done. 946 tests / 103 files,
0 lint errors, no new typecheck errors. Branch `feat/platform-sweep` is pushed
but NOT merged to main and NOT deployed.

**NOT DONE, deliberate:** no live-browser QA pass has been run on any of Wave 1
or Wave 2. Everything is verified by unit tests, typecheck, lint and direct
production queries only.

---

## OUTSTANDING (beyond the sweep)

1. ~~Leaderboard of POSTS on `/ads/genome`.~~ DONE in Wave 2 (`c5a9396`).
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
