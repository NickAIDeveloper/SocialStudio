# Onboarding wizard — "how it works" finale + palette fix

**Date:** 2026-07-18
**Status:** Approved (design)
**Scope:** Improve the existing `OnboardingWizard`; no new routes, no new APIs.

## Problem

A full 5-step onboarding wizard already ships (`src/components/onboarding-wizard.tsx`,
gated by `OnboardingGate` on `/api/preferences` `onboardingCompleted === false`).
Two gaps versus what a new user needs:

1. **The final step ("Ready") doesn't explain how the product works.** It shows three
   stat tiles (brand / tools / competitors) then "Go to Dashboard" — dumping the user at
   the dashboard with no sense of what happens next.
2. **Teal palette regression.** New brands default to `primaryColor '#14b8a6'` /
   `secondaryColor '#0d9488'` (old teal), but the design system is Higgsfield-purple
   (`--violet #8B5CF6`, `--violet-bright #A78BFA`). New brands start off-palette.

## Non-goals (YAGNI)

- No `/welcome` route or separate getting-started page.
- No change to the gate logic or to steps 1–4 (Brand / Tools / Competitors / Analyzing).
- No dropping of steps. Competitors + Analyzing stay as-is.

## Changes (all in `onboarding-wizard.tsx` + tests)

### 1. Purple defaults
`OnboardingWizard` initial `brand` state:
- `primaryColor: '#14b8a6'` → `'#8B5CF6'`
- `secondaryColor: '#0d9488'` → `'#A78BFA'`

### 2. Rework `StepReady` into a "how it works" finale
Keep a compact recap (brand name ✓, N tools connected). Replace the competitors tile
with a **3-step "Here's how it works"** vertical explainer using numbered violet markers:

1. **Autopilot learns your brand nightly** — it studies your account and competitors to
   learn what resonates.
2. **It drafts varied, quality-gated posts** — every draft passes an anti-slop check for
   fresh hooks, angles, and images (no repeats).
3. **It schedules them to Buffer** — you review and watch results roll in.

CTAs:
- **Primary:** "Set up Autopilot →" → navigates to `/autopilot` (`window.location` / router).
- **Secondary (text):** "I'll explore on my own" → dashboard (`/`), same completion path.

Both CTAs call the existing `onComplete` (which PATCHes `onboardingCompleted: true`) before
navigating, so the wizard doesn't reappear.

### 3. Light polish on the final step only
Numbered step markers, consistent `--violet` tokens, spacing. No restyle of other steps.

## Testing

- Unit test (`onboarding-wizard.test.tsx`): renders `StepReady` and asserts the how-it-works
  copy + both CTAs are present, and that clicking a CTA calls `onComplete`.
- If a component test harness for the wizard doesn't exist yet, add a focused one for
  `StepReady` (export it for testability) rather than driving all 5 steps.

## Risks

- `StepReady` currently receives `competitorsTracked`; removing that tile means the prop may
  go unused — drop it from the signature to avoid a dead prop.
- Navigation: the wizard is a modal over the dashboard; ensure the primary CTA fully
  completes onboarding before routing so `OnboardingGate` won't re-trigger.
