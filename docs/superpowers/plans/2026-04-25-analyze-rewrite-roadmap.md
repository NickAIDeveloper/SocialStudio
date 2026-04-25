# Analyze Rewrite — Roadmap

**Status:** Roadmap. Each phase has (or will have) its own detailed plan.

**North star:** Make `/analyze` a one-button experience that produces actionable insight cards, feeds them into Smart Posts and Create with full context, and learns from every published post.

---

## Why this exists

Today `/analyze` has three tabs (You / Competitors / Compare), and "You" itself splits into two parallel ~1000-line dashboards (scrape vs meta). Insights are tables that ask the user to interpret. The handoff to Smart Posts loses most signal (only format/day/hour/preset URL params survive). Competitor data is in a different room. Nothing learns from outcomes.

We want: **press one button → get insight cards → tick the ones you want → make 1 post or a 5-pack with all of them baked in → the system learns from what works.**

---

## Phases

Each phase ships standalone working software. Order matters — later phases consume earlier outputs.

### Phase 1 — Run Full Analysis (orchestration foundation)

**Plan:** `2026-04-25-phase1-run-full-analysis.md`

A single endpoint `/api/analyze/run` that fans out to existing analysis sources (deep profile, analytics insights, competitor insights, rescan triggers) and returns a unified `AnalysisResult`. UI gets a "Run Full Analysis" button that calls it and shows step progress. **Purely additive** — no existing UI is removed yet. This is the foundation everything else consumes.

### Phase 2 — Insight-first card layout

Replaces the You-tab tables with stacked `InsightCard` components fed by Phase 1's `AnalysisResult`. Each card has a headline number, a small chart (sparkline / pie / bar), a "why this matters" line, and a drill-down chevron that reveals the existing detail tables. Demotes (or removes) FormatStrip / Heatmap / PostAutopsy / CaptionPatterns as first-class panels.

### Phase 3 — Learnings cart + deep handoff

Each insight card gets a "Use this" toggle. Selected learnings persist (server-side `applied_learnings` table or URL encoded blob — TBD in plan). Two bottom-dock CTAs: **"Make 1 Perfect Post"** (→ `/smart-posts`) and **"Make a 5-pack"** (→ `/create`), both pre-seeded with the full ticked context — not just the existing 4 URL params.

### Phase 4 — Competitor data inline

Removes the Competitors and Compare tabs from `/analyze`. Surfaces "your reels get 0.6× competitor median" findings as inline cards in the main flow. Competitor management UI moves to a settings drawer. Compare view becomes a card variant ("vs @competitor").

### Phase 5 — Closed feedback loop

When a Smart Post we published beats the user's median engagement, tag it as a `winning_recipe` and feed it into the deep profile so the next analysis weights it. Adds a `post_outcomes` join + a recipe-extraction job. Each subsequent "Run Full Analysis" gets smarter than the last.

---

## Cross-cutting decisions

- **Brand-aware throughout.** Every phase respects the current brand selection in URL state.
- **Backwards-compatible APIs.** Existing routes (`/api/insights`, `/api/meta/deep-profile`, `/api/smart-posts/generate`) keep working. We add new endpoints, we don't break old ones.
- **One PR per phase to `develop`**, merged to `main` after browser-verified.
- **Tests required:** unit for orchestrators/engines, route tests for new endpoints, smoke test for UI button-click → result.

---

## What changes in dependent surfaces

- **`/smart-posts`** — Phase 3 onwards: accepts a `learningsId` query param that loads applied learnings server-side instead of relying on URL params.
- **`/create`** — Phase 3 onwards: same `learningsId` mechanism for batch generation.
- **DB schema** — Phase 3: `applied_learnings` table. Phase 5: `post_outcomes` table + `winning_recipes` field on `posts` or `scrapedPosts`.

---

## How to use this roadmap

When starting a phase, read its dedicated plan file (`2026-04-25-phaseN-*.md`) and execute task-by-task. After each phase merges to `main`, write the next phase's plan with full file paths and code blocks before starting work.
