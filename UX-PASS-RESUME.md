# UX Consistency Pass — Resume Handoff

**Date paused:** 2026-07-19
**Branch:** `refactor/ux-consistency-pass` (PR **#27**)
**Base:** `main`

---

## What this task is

A full UX/UI consistency + quality pass across the app (Next.js App Router + Tailwind v4,
CSS-var tokens in `src/app/globals.css`, Higgsfield-purple dark theme). Phase 1 audit is in
`UX_AUDIT.md`. We're in Phase 2 (implementation) + a live mobile QA pass driven via Playwright
against the PR preview.

**Constraints:** presentation/copy/a11y only — NO business-logic / data-model / API-contract
changes, NO new dependencies. Small coherent commits, each `next build`-verified + `tsc`-clean.

---

## Status: DONE so far (~19 commits on the branch, all build-verified)

- **Foundation** (`globals.css`): defined the missing `.glass-card`; added `prefers-reduced-motion`;
  tokenized the global focus ring; lifted `--muted-2` to pass 4.5:1 contrast; added canonical
  `.btn-primary` / `.btn-secondary` classes.
- **Dead code:** removed unused/stale `sidebar.tsx`.
- **Auth flow:** fixed the forgot-password false-success Critical; autocomplete/aria-live/label
  association/card-wrapper/copy across all 4 auth pages.
- **Autopilot/Settings:** confirm-before-Disconnect; named the autopilot toggle (role=switch);
  de-jargoned the Brain UI; fixed the `bg-white` brain modal.
- **Create/Smart-posts:** generate-button loading + error states (Criticals C4/C5); dropped
  god-mode/seed/"Viral Post" dev-speak; fixed subtitle hierarchy; killed IG-preview dead-clicks;
  tokenized the fuchsia MetaSeed banner.
- **Analyze:** surfaced the analytics hidden behind "Detailed views (legacy)" (C6 — now default-open,
  renamed, chevron); retokenized the invisible/low-contrast meta-sections (C7 — `bg-black/20` →
  `--surface-2`, `text-white/40` → `--muted`).
- **Onboarding:** dialog role + Escape-to-close + mobile scroll.
- **Legal pages:** added "Back to home" links.
- **C2 (design-system) started:** canonical button classes + converged the divergent primaries
  (ads `rounded-2xl`, batch gradient, post-analyzer `bg-purple-*`, image-source hover direction).
- **Mobile pt.1 (overflow):** AnalyzeTabs now scroll (were pushing page 23px wide); Ads step-header
  stacks + hides non-active labels on mobile (was 284px overflow); RunAnalysisButton header stacks;
  added `overflow-x-clip` safety net on the dashboard content wrapper (`src/app/(dashboard)/layout.tsx`).
- **Mobile pt.2:** extracted a shared **`src/lib/meta/friendly-error.ts`** (`friendlyIgError`) and
  applied it in `instagram-section.tsx` + `smart-posts/top-performers-strip.tsx` (were dumping raw
  `IG Graph error 500 on /me/media: {...}` to users); renamed the analyze "Scrape" toggle → "Public
  data"; made the autopilot `BrandPanel` loading skeleton representative (was too faint → read as blank).

**Cleared 6/8 Criticals.** Remaining audit items: C2 full rollout (migrate the ~remaining inline
buttons onto `.btn-primary`/`.btn-secondary` and eventually retire the barely-used `ui/*` primitives),
C8 (de-dupe the two `insight-card` components), native `<select>` → consistent styling.

---

## RESOLVED (commit `a712f76`, 2026-07-19) — the squeeze bug class

**The bug class the overflow diagnostic MISSED** (cramped non-stacking rows that squeeze a text
column into a 1-word-per-line ribbon without widening the page) has been swept and fixed:

- **hero-card**: row now `flex-col sm:flex-row`; thumbnail+text stay a sub-row, "Make more like
  this" drops to a full-width button below on mobile.
- **compare-section**: the 3-col You-vs-competitor table scrolls (`min-w-[480px]` inside
  `overflow-x-auto`) instead of crushing long values like "Format mix".
- **analytics-dashboard**: profile-stats `grid-cols-3 sm:grid-cols-5` (was fixed 5-col ~57px/col);
  account selector `flex-wrap`.
- **competitor-dashboard**: account picker `flex-wrap`.

**Swept and cleared (no fix needed):** deep-profile-section (tables in `overflow-x-auto`,
`sm:grid-cols-*`), heatmap (scroll container), brand-panel header (`sm:grid-cols-[200px_1fr_auto]`),
competitor you-vs-them table (`overflow-x-auto` + `hidden sm/md` columns), format-strip / PostHighlight
/ AdDashboardCard (short numeric grids), ads StepCreative/StepAudience & more-options-dialog (image
thumbnail grids / short form fields), post-generator grids (`grid-cols-3 sm:grid-cols-5`). None
produce the ribbon. Build-verified (`next build` ✓).

**NOT live-verified on preview:** the account's IG long-lived token is expired, so hero-card /
compare-section / deep-profile data branches render error/empty states on the preview rather than the
fixed layouts — reconnect IG to pixel-check them. Fixes are pure responsive Tailwind classes,
build-clean.

## OPEN / REMAINING (audit backlog, non-blocking)

- **C2 full rollout**: migrate the ~remaining inline buttons onto `.btn-primary`/`.btn-secondary`;
  eventually retire the barely-used `ui/*` primitives.
- **C8**: de-dupe the two `insight-card` components.
- Native `<select>` → consistent styling.

### Immediate next fix (hero-card.tsx, already read — apply this)

In the `{top && ( ... )}` block (~line 67), the row is:
```
<div className="flex gap-4">
  <img ... h-20 w-20 ... />
  <div className="flex-1 min-w-0"> ...caption, format/reach, verdict, suggestion... </div>
  <div className="shrink-0 flex flex-col gap-2"> <a>Make more like this</a> </div>
</div>
```
**Fix:** stack on mobile so the text gets full width and the button drops below.
- Change the row to `flex flex-col gap-4 sm:flex-row`.
- Group the thumbnail + text into their own `flex gap-4` sub-row (so they stay side-by-side), OR keep
  thumbnail inline and let text wrap full-width.
- Make the "Make more like this" `<a>` `w-full sm:w-auto` + `text-center`, and move it out of the
  `shrink-0` column so on mobile it's a full-width button below the content.
- Suggested structure:
  ```
  <div className="flex flex-col gap-4 sm:flex-row">
    <div className="flex gap-4 flex-1 min-w-0">
      {thumb && <img ... />}
      <div className="flex-1 min-w-0"> ...caption/reach/verdict/suggestion... </div>
    </div>
    {analysis?.makeMorePrompt && (
      <a ... className="... w-full sm:w-auto sm:shrink-0 text-center ..."> Make more like this </a>
    )}
  </div>
  ```
- Also while here: `text-amber-300/80` (line 62) and `text-white/50`/`text-white/90` are off-token —
  optionally map to `--muted`/`--txt`/a warning token (low priority).

### Then: check EVERY page for the same class of bug

The overflow diagnostic isn't enough. Use a **"squeezed column" diagnostic** at 375px — find text-
heavy elements rendered too narrow. Run in the browser (Playwright `browser_evaluate`):
```js
() => {
  const bad = [];
  for (const el of document.querySelectorAll('p, div, span, a, h1, h2, h3, li')) {
    const t = (el.textContent || '').trim();
    const r = el.getBoundingClientRect();
    // text-heavy but rendered in a very narrow column = squeezed
    if (t.length > 40 && r.width > 0 && r.width < 130 && el.children.length === 0) {
      bad.push({ w: Math.round(r.width), len: t.length, text: t.slice(0, 40), cls: (el.className?.toString?.()||'').slice(0,70) });
    }
  }
  return bad.slice(0, 20);
}
```
Also keep the overflow check (`docW - vw`). Walk each page: `/analyze` (You/Competitors/Compare tabs —
esp. the You tab which renders PerformancePage → InstagramSection → HeroCard/format-strip/heatmap/
post-autopsy/caption-patterns/deep-profile), `/analytics` (redirects to analyze), `/competitors`,
`/smart-posts`, `/create` (Single + Batch), `/autopilot`, `/ads` (all 4 builder steps), `/ads/queue`,
`/settings`, `/profile`, `/meta` (redirects). Fix any non-stacking `flex ... justify-between` /
`flex gap-*` rows with a text child + a sibling button/thumbnail by adding `flex-col ... sm:flex-row`
and making buttons `w-full sm:w-auto`.

Prime suspects (data-dense meta-sections, desktop-first): `hero-card`, `post-autopsy`, `caption-patterns`,
`format-strip`, `compare-section` (grid-cols-3), `analytics-dashboard` (grid-cols-5), `competitor-dashboard`,
`brand-panel` header (grid-cols-[200px_1fr_auto]).

---

## How to resume the live preview loop

1. **Preview is behind Vercel deployment protection.** Get a bypass each time (invalidates on every
   rebuild): use the Vercel MCP `get_access_to_vercel_url` on
   `https://social-studio-git-refactor-ux-14f386-nickaidevelopers-projects.vercel.app`, then navigate
   Playwright to the returned `?_vercel_share=...` URL (sets the cookie), then to the real page.
2. The app itself needs login — the user's session was already active in the Playwright browser
   (owner: origae@socialstudio.app). If logged out, ask the user to log in.
3. `browser_resize` to **375×812** for mobile checks.
4. Screenshots save to the **repo root** (e.g. `./x.png`) — read them, then `rm -f *.png` to clean up
   (don't commit screenshots).
5. **Project alias / IDs:** projectId `prj_aFsmdNkeXAsl6EC1r7HLfXpNOs1V`, teamId
   `team_cPvldrifqQeLzS7jpMllEfiC`.

## Build / commit workflow (gotchas)

- **Local `next build` fails ONLY because of an untracked broken script `scripts/_delpost.ts`**
  (not in the repo, so Vercel is fine). To get a clean local build:
  `mv scripts/_delpost.ts scripts/_delpost.ts.bak; npm run build; mv scripts/_delpost.ts.bak scripts/_delpost.ts`
  Look for `✓ Compiled successfully` — the `_delpost.ts` type error is expected/ignorable.
- `tsc --noEmit` has pre-existing unrelated errors in `_delpost.ts`, `deep-profile.test.tsx`,
  `tests/e2e/brain.spec.ts` (missing @playwright/test) — filter to your changed files with grep.
- After push, the Vercel preview rebuilds in ~85s; then re-fetch the share bypass and re-verify.
- Commit style: `fix(area): ...` / `refactor(ux): ...`, presentation-only, Co-Authored-By line.

## Known operational (NOT UI) issue

The account's **Instagram long-lived token is expired again**, so IG endpoints return
`IG Graph error 500 on /me/media` / "deep profile" failures on the preview. That's why those sections
error at all — reconnecting IG clears it. The UI fix (humanized errors) is done; the token is separate.

---

## Suggested resume order

1. Fix `hero-card.tsx` (above) — the reported bug.
2. Run the squeezed-column + overflow diagnostics on `/analyze` (You tab) and fix the meta-sections.
3. Sweep the remaining pages at 375px; fix non-stacking rows.
4. Build + push; re-verify on the rebuilt preview.
5. Then decide: finish C2 button migration + C8, or merge PR #27 as the milestone.
