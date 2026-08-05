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

## OUTSTANDING

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
