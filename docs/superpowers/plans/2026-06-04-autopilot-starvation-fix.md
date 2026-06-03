# Autopilot "not shipping" — starvation + nextRunAt fix (handoff)

> **Pick-up prompt for fresh session:** "do the autopilot starvation + nextRunAt fixes — see docs/superpowers/plans/2026-04-autopilot-starvation-fix.md"

**Status going in:** Already shipped + live — Affectly Buffer channel re-authed (by user), and the image *alignment* fix (PR #9: `generate.ts` category fallback now passes `brand.slug` to `rankCandidates`). This plan covers what's LEFT: why posts don't ship, and the nextRunAt/visibility gaps.

## Problem
Autopilot barely ships. Dashboard: Affectly 0/4, PaceBrain 1/4 this week, both "Falling behind". Only ~3 posts in Buffer.

## Root cause (confirmed via investigation + live `scripts/inspect-autopilot-state.ts`)
1. **Image starvation → no image → draft (never reaches Buffer).** Recent Affectly posts are `status=draft, src=null`: generation ran but found no usable image. Caused by the **all-time image no-reuse filter** (24 used images for pacebrain, 22 affectly) intersected with **over-strict brand-domain tokens**, leaving ~0 fresh on-topic candidates. This is the primary "not shipping" cause.
2. **`nextRunAt` only advances on success.** Failure paths in `src/app/api/autopilot/run/route.ts` (no-image, god-mode non-2xx, empty-generation) update nothing, so a stuck brand stays perpetually "due" and silently fails daily. Affectly's `nextRunAt` is frozen at `2026-05-31` (last real autopilot post 2026-05-26).
3. **`lastError` is null on failures** → failures are invisible (live state showed `lastError: null` for both brands while nothing shipped).

Live snapshot (2026-06-03): both `enabled, mode=auto, frequency=every_other_day`. Affectly `nextRunAt=2026-05-31` (stuck), `lastRunAt=2026-05-26`, total 22. PaceBrain `nextRunAt=2026-06-03`, `lastRunAt=2026-06-01`, total 24.

## Fixes (in priority order)

### Fix 1 — Break image starvation (the real shipping fix)
- **Relax the all-time no-reuse to a rolling window.** Find where the "used images" dedup set is built (autopilot run path uses `normalizeImageUrlForDedup` + `buildDedupSet` from `src/lib/smart-posts/url-dedup.ts`, plus a pHash layer — see `reference_autopilot_image_dedup` memory). Cap it to the most recent ~60 posts per brand instead of all-time, so old images become reusable and the pool stops starving.
- **Widen `BRAND_DOMAIN_TOKENS.pacebrain`** in `src/lib/smart-posts/image-scoring.ts` (currently ~14 locomotion-only tokens). Add `pace`, `trail`, `5k`, `10k`, `endurance`. `trail` is safe now — animals are caught earlier by `ANIMAL_SUBJECT_TOKENS` in the negative list (`image-scoring.ts:129-158`).
- **Verify** with `npx tsx scripts/diagnose-autopilot-images.ts` (read-only): confirms fresh-image pool size per brand before/after.

### Fix 2 — Advance `nextRunAt` on failure + set `lastError`
- In `src/app/api/autopilot/run/route.ts`: every early-return failure path (no_ig_account, god-mode non-2xx, empty_generation, no-image, buffer push fail) should (a) set a descriptive `lastError`, and (b) call `computeNextRunAt(...)` and update `nextRunAt` so the brand backs off one cadence instead of hammering daily. The success-only `computeNextRunAt + db.update` block is ~`run/route.ts:311-327` — factor it so failures also advance the schedule.

## Verification
- Unit tests for any scoring/dedup change (mirror existing `src/lib/smart-posts/__tests__` patterns); `npx tsc --noEmit` (baseline = 4 pre-existing unrelated errors in `scripts/_delpost.ts`, `deep-profile.test.ts`, `tests/e2e/brain.spec.ts`).
- End-to-end: `npx tsx scripts/trigger-autopilot-run.mjs` for Affectly (⚠️ MUTATING — posts live to Buffer; confirm intent) → expect a `status=scheduled` post with a non-null, on-topic `src`, and `nextRunAt` advanced.
- Ship via PR → land-and-deploy (squash; Vercel auto-deploys main). Branch off `main`.

## Guardrails
- READ `node_modules/next/dist/docs/` conventions if touching routes (per AGENTS.md — this is a customized Next.js 16).
- Don't blindly run mutating scripts (`trigger-autopilot-run.mjs`, `backfill-autopilot-nextrun.ts`).
- Per `feedback_verify_before_string_fixes`: confirm pool/scoring behavior with the diagnose script before/after — don't guess token lists.

## Related memory
`reference_autopilot_image_dedup`, `reference_autopilot_brand_domain_scoring`, `reference_autopilot_schedule_model`, `project_buffer_channel_not_found`, `project_autopilot_image_no_reuse`.
