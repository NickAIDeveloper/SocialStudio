# Wave 1 — Contrast fix report

**Note:** these changes ended up co-mingled into commit `9f849ea` ("chore: delete six
phantom redirect-shim pages and repoint their links") — another agent ran a broad `git add`
in this shared working directory while my edits were sitting unstaged, and committed both
sets of changes together. Content verified intact via `git show 9f849ea -- <file>` for every
file below; no rewrite attempted (only `add`+`commit` were authorized, no history rewriting).


## Files changed
- `src/app/globals.css` — `.dark` block: `--muted` and `--muted-2` raised.
- `src/components/layout/app-sidebar.tsx` — sidebar section labels (`Workspace`, `Account`) moved off `--muted-2`/11px onto `--muted`/12px (`text-xs`).
- Flat `--violet` swapped to `--violet-bright` for text/icon uses (link hover states + two static icon/glyph cases) across 16 files:
  `src/app/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`,
  `src/app/(dashboard)/ads/page.tsx`, `src/app/(dashboard)/ads/queue/page.tsx`,
  `src/app/(dashboard)/ads/_components/StepGoal.tsx`, `StepCreative.tsx`, `StepAudience.tsx`,
  `src/components/login-form.tsx`, `register-form.tsx`, `onboarding-wizard.tsx`,
  `post-generator.tsx`, `post-analyzer.tsx`, `performance/ig-account-picker.tsx`.
  (`src/components/command-center.tsx` also matched the grep but had already been deleted by
  another agent working the dead-route-deletion item in this same sweep — nothing to do there.)
- Left untouched (per scope): `onboarding-wizard.tsx:698` checkbox `text-(--violet)` — this sets
  the checkbox's checked-state fill, not readable text, and `focus:ring-(--violet)/30`, borders,
  and the sidebar logo gradient (`from-(--violet) to-(--violet-deep)`).

## Before/after ratios (worst-case surface, `--surface-2`)
| Token | Before | After |
|---|---|---|
| `--muted` (#8A8F98→#A2A7B0) | 4.84:1 | ~6.4:1 |
| `--muted-2` (#6B7178→#8E939C) | 3.19:1 (FAIL) | ~4.9:1 (PASS) |
| flat `--violet` as text (#8B5CF6, now `--violet-bright` #A78BFA) | 3.72–3.95:1 (FAIL) | 6.1–7:1 (PASS) |
| sidebar section labels | `--muted-2`/11px, 3.19–3.87:1 (FAIL) | `--muted`/12px, ~6.4:1+ (PASS) |

Values taken from the pre-computed table in the readability audit; token math not
independently re-derived here (formula and surfaces match the audit exactly).

## Bracket-form var syntax (`text-[--x]`)
Grepped `text-\[--` across `src/` — **zero matches**. No live bug of that kind found or introduced.

## Test/lint/type status
- `npx vitest run` — 98 files / 879 tests, all passing (unchanged from baseline).
- `npx eslint .` — 0 errors, only pre-existing warnings (unused vars, exhaustive-deps).
- `npx tsc --noEmit` — same 3 pre-existing errors (`scripts/_delpost.ts`,
  `src/lib/meta/__tests__/deep-profile.test.ts`, `tests/e2e/brain.spec.ts`), plus stale
  `.next/types/validator.ts` errors referencing the six now-deleted dashboard route files
  (another agent's Wave 1 item 4 work; a `.next` build artifact, not new source error — will
  clear on next `next build`/dev restart). No new errors from this change.
