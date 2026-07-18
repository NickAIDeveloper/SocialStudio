# UX & UI Audit — SocialStudio

**Date:** 2026-07-18 · **Phase:** 1 (audit only — no code changed)
**Method:** 5 parallel read-only code passes (foundations/tokens · auth+public · analyze/perf/competitors · create/smart-posts/batch · autopilot/ads/settings), each producing file/line findings + a pattern inventory, then aggregated here.
**Stack:** Next.js App Router · Tailwind CSS v4 (CSS-variable tokens in `src/app/globals.css`) · a partly-adopted shadcn/base-ui primitive set under `src/components/ui/*` · lucide-react icons. App is hard-locked to the `.dark` (Higgsfield-purple) theme; light mode is defined but unshipped.

**Severity key:** **Critical** = broken flow, dead/misleading UI, inaccessible core control, or missing error/empty state on a core path · **High** = clear UX failure or systemic inconsistency users will feel · **Medium** = noticeable rough edge · **Polish** = refinement.

> **Bottom line:** the app is functional and the token palette is coherent, but there are **two competing visual languages** (token-based vs hand-rolled/`glass-card`), a **`.glass-card` class that doesn't exist**, and a long tail of duplicated primitives (buttons, cards, status pills, number/date formatters). The highest-leverage work is Phase 2 Step 1 — consolidate tokens + shared primitives — which resolves most of the High/Medium findings at once.

---

## PART 1 — Cross-cutting inconsistencies

These are systemic; fix them in the Phase 2 foundation step *before* page-level work.

### 1. `.glass-card` is undefined — applied on ~9 components, styles nothing  🔴
`globals.css` defines `.surface-card`, `.chip*`, `.cta-violet`, `.pill-btn`, `.surface-glow` — but **not `.glass-card`**. It's applied on `onboarding-wizard.tsx:1060`, `settings-panel`, `post-generator`, `meta-hub`, `insight-card`, `health-score`, `brand-manager`, `brand-voice-settings`, `instagram-section`. The intended frosted/translucent treatment never renders; those cards get only their co-located `border`/`rounded-*`. **→ Either define `.glass-card` (bg + backdrop-blur + border) or migrate all usages to `.surface-card`/`<Card>`.**

### 2. Two parallel design systems, barely interoperable  🔴
`ui/*` (shadcn/base-ui, cva, keyed to `--radius`/`bg-primary`/`h-8`) is imported by only ~6 files. The app shell and most feature screens **hand-roll** buttons/inputs/badges with raw `bg-(--violet) py-2.5 rounded-lg`. Same element, different look per screen. **→ Pick one: wire the primitives to the Higgsfield tokens and adopt them, or delete the unused primitives and codify the hand-rolled patterns as shared components.**

### 3. Button styles — 8+ distinct primaries
- `ui/Button` default `h-8 px-2.5 rounded-lg bg-primary shadow-[0_4px_20px_...]` (`button.tsx:13`)
- Hand-rolled primary `rounded-lg bg-(--violet) py-2.5` (onboarding, profile, brand-manager, settings-panel)
- Hand-rolled XL `py-3 font-semibold` (`onboarding-wizard.tsx:970`)
- `rounded-2xl bg-(--violet)` (ads/page, ads/queue)
- Gradient `bg-gradient-to-r from-(--violet) to-(--violet-deep)` (`batch-gallery.tsx:792`; landing hero)
- `bg-purple-600` off-palette (`post-analyzer.tsx:78`)
- `.cta-violet` pill helper (globals.css:197) — **defined but used in only a few files**
- Landing has 3 different CTA shapes (`page.tsx:151`, `:185`, `:482`)

**→ One primary-button component/recipe; adopt or delete `.cta-violet`/`.pill-btn`.**

### 4. Card / surface treatments — 4 systems
`.surface-card` · `<Card>` (`ring-1 ring-foreground/10`) · `.glass-card` (undefined) · raw `bg-(--surface)/60 rounded-2xl border border-white/5` / `bg-black/20 border-white/5` (meta-sections). Radii mix `rounded-lg/xl/2xl`; borders mix `border-(--line)` vs raw `border-white/5|10`. `bg-black/20` on `--bg #0F1113` is nearly invisible. **→ One card primitive + token border.**

### 5. Status pills — 3 unrelated systems for the same posts
`statusBadge()` labeled 4-state (`autopilot-card.tsx:342`) · raw `p.status` string 2-state (`brand-panel.tsx:475`, prints dev strings) · `StatusBadge` uppercase (`command-center.tsx:56`). **→ One shared `statusBadge()`.**

### 6. Badges / chips — 3 systems
`.chip*` (globals.css:187) · `ui/Badge` (`rounded-4xl`) · raw conditional spans (`onboarding-wizard.tsx:462`). **→ Consolidate.**

### 7. Number/date formatting — 5+ reimplementations
`formatFollowers` (`competitor-card.tsx:13`), `formatNum` (`competitor-dashboard.tsx:37`, different rounding), `formatNumber` (`shared.tsx:32` **and** duplicated `meta-hub.tsx:644`), raw `.toLocaleString()` (deep-profile, command-center), `.toLocaleDateString()` (instagram-section, competitor-dashboard) vs custom `relativeTime`/`timeAgo`/`timeUntil` reimplemented in brand-panel, autopilot-card, command-center, competitor-card. **→ Shared `formatCount` / `formatRelative` utils.**

### 8. Color — raw palette leaks, teal remnants, contradictory chart hues
- **Teal remnants** (design system is violet): `brand-manager.tsx:29-31,134-137` default brand colors `#14b8a6`/`#0d9488`; `competitor-dashboard.tsx:35` chart palette `['#14b8a6','#3b82f6',…]`. *(Onboarding defaults already fixed in #26.)*
- **Heatmap means two colors:** green `rgba(16,185,129)` (`heatmap.tsx:59`) vs violet `rgba(139,92,246)` (`insight-card.tsx:83`, `analytics-dashboard.tsx:143`) for the same "engagement by time" metric.
- **Off-palette Tailwind:** `bg-purple-*`/`text-purple-*` (post-analyzer, content-repurposer), `fuchsia-*`/`sky-*` (`shared.tsx:44`, smart-posts MetaSeedBanner), `amber-*`, raw hex in `health-score.tsx:11`, `analytics-dashboard.tsx:26` (where `teal: '#8B5CF6'` is mislabeled violet).

**→ Route all chart/semantic colors through tokens (`--chart-1..5`, `--destructive`, add `--warning`).**

### 9. Error styling — 6 color families, none tokenized
`text-red-400` (login/register/post-generator) · `text-red-300` (reset-password) · `text-red-600` (brain-panel) · `text-rose-200/300` (smart-posts, candidate-strip, autopilot-section) · `text-(--pink)/80` (caption-patterns) · none (forgot-password). **→ One `--destructive` recipe.**

### 10. Focus rings — declared twice + `focus` vs `focus-visible` drift
Global `*:focus-visible { ring-2 ring-violet-500/50 ring-offset-2 }` (`globals.css:156`, raw palette not token) **stacks** with primitives' own `focus-visible:ring-3 ring-ring/50` (no offset). Hand-rolled inputs use `focus:` not `focus-visible:` (onboarding, auth). Shell nav links have no explicit focus style. **→ One focus recipe on `--ring`, always `focus-visible`.**

### 11. Contrast — `--muted-2` (#6B7178) is below 4.5:1 and used for small text everywhere
~3.5–4.0:1 on `--bg`/`--surface`; used for 10–11px labels, emails, stat sublabels, feature copy (foundations, analyze, autopilot, landing `page.tsx:296`). `text-white/40` (heatmap, instagram-section) is far below. **→ Reserve `--muted-2` for non-text/decorative; use `--muted` for text, or lighten it.**

### 12. No `prefers-reduced-motion` anywhere
`globals.css:151` sets `scroll-behavior:smooth`; `animate-spin`/`animate-pulse`/`transition-all`, sidebar slide, landing marquee (`page.tsx:210`, a vestibular trigger), stroke-dashoffset ring animations — none gated. **→ Add a global reduced-motion block.**

### 13. Touch targets — pervasively under 44×44px
`ui/Button` default/icon `h-8` (32px); sidebar hamburger 40px / close 32px; setup-banner dismiss ~24px; "Run now" (`autopilot-card.tsx:226`), brand Edit/Delete, insight toggles/chevrons (`insight-card.tsx:49`), competitor X, template delete ×, all modal close ×, auth "Forgot password?". **→ Enforce ≥44px hit area (padding or min-h/min-w).**

### 14. Dev-speak leaking into UI copy
"god-mode" (`smart-posts-dashboard.tsx:442`), "seed"/"Seed" (`:444,790`), "Viral Post" (`post-generator.tsx:859`), "brain" as a noun + "Brain v{briefVersion}" + raw `briefMd` dump (brain-panel/brain-badge/brand-panel), raw pipeline keys `ig`/`ads`/`competitor_account` (`brain-panel.tsx:61`), raw `p.status`/verdict enums ("Verdict: positive", `post-autopsy.tsx:91`), Graph API scopes `ads_management`/`instagram_manage_insights` (`meta-hub.tsx:606`), raw `account_type` "BUSINESS". **→ Human labels; hide internal version numbers/keys.**

### 15. Radii off the token scale
`rounded-[11px]`/`rounded-[9px]` (`app-sidebar.tsx:35,73`), `.surface-card` hardcodes 16px (not a `--radius-*` step), free mix of `rounded-lg/xl/2xl/4xl`. **→ Snap to scale.**

### 16. Duplicate components / logic
Two `insight-card.tsx` (`components/` vs `analyze/insights/`, different verdict encodings) · `Metric` defined twice (`instagram-section.tsx:225`, `meta-hub.tsx:551`) · `formatNumber` twice · AI-insight grid duplicated (`competitor-dashboard.tsx:455` vs `analytics-dashboard.tsx:702`, divergent tokens). **→ De-dupe.**

### 17. Dead / orphaned code
`sidebar.tsx` — unused **and** stale (nav routes no longer match IA; dead-click brand spans). `meta-hub.tsx` — `/meta` redirects to `/analyze?source=meta`; MetaHub never mounted (matches known "orphaned" note). **→ Delete both (confirm meta-hub first).**

### 18. Dead-click affordances (look interactive, do nothing)
Instagram mock action bars (♡ 💬 ↗ ⌒) with `cursor-pointer hover:opacity-60` but no handler: `post-generator.tsx:1315`, `autopilot-card.tsx:659`, and the legacy `sidebar.tsx:138`. **→ Remove pointer/hover affordances (they're decorative).**

### 19. `--muted` token overload
`--muted` is redefined in `.dark` as a **text** gray while `--muted-color` is an elevated **bg**; `text-(--muted)` and `bg-muted` resolve from different vars with the same stem. **→ Rename the text gray (e.g. `--text-muted`).**

---

## PART 2 — Findings by severity

### 🔴 Critical

| # | Area | File:line | Issue |
|---|------|-----------|-------|
| C1 | Foundations | `globals.css` (+9 files) | `.glass-card` undefined — frosted treatment renders nothing. *(→ #1)* |
| C2 | Foundations | `ui/*` vs shell | Two parallel design systems; primitives barely adopted. *(→ #2)* |
| C3 | Auth | `forgot-password/page.tsx:15-21` | `fetch` result never checked; `setSent(true)` runs unconditionally — user told "check your email" even on network/500 failure. **→ try/catch + check `res.ok` + error state.** |
| C4 | Create | `post-generator.tsx:855-860, 953-959` | Both main generate buttons ("Generate", "Random Generator") fire a long async chain with **no button-level loading/disabled state**; stay clickable → double-submits. **→ disable + "Generating…" + spinner.** |
| C5 | Create | `post-generator.tsx:325,364,449,480` | Caption/image/render failures silently swallowed (empty catches / `console.error` only); failed generation leaves UI unchanged, no error, no retry. **→ surface dismissible error + retry.** |
| C6 | Analyze | `analyze-page.tsx:30-40` | The entire You/Competitors/Compare analysis is hidden inside a collapsed `<details>` labeled **"Detailed views (legacy)"** in muted micro-caps — the richest data self-branded deprecated and hidden by default. **→ promote or remove.** |
| C7 | Analyze | `meta-sections/*`, `instagram-section`, `meta-hub` | Whole second visual language: `glass-card` + `bg-black/20` + `text-white/40|50` — `bg-black/20` is near-invisible on `--bg`, `text-white/40` fails contrast. **→ port to tokens.** |
| C8 | Analyze | `insight-card.tsx` ×2 | Two unrelated "insight card" components, different verdict color encodings/layouts. **→ consolidate.** |

### 🟠 High

**Foundations / shell**
- `sidebar.tsx` — dead **and** stale (routes `/home,/generate,/batch,/analytics,/competitors,/meta` ≠ live IA; dead-click brand spans `:138`). → delete.
- `onboarding-wizard.tsx:1055-1060` — blocking full-screen modal is a plain `<div>`: no `role="dialog"`/`aria-modal`/`aria-labelledby`, no focus trap, Escape doesn't close; can tab to dashboard behind. → use `Dialog` primitive.
- `onboarding-wizard.tsx:1056-1060` — wrapper has no `overflow-y-auto`; `StepBrand` card exceeds a 375×667 viewport, top content clipped with no scroll. → add scroll + `max-h`.
- `onboarding-wizard.tsx:170,314,462,467` — `text-red-400`/`text-amber-400` for errors/required/badges instead of tokens; amber has no token. → `--destructive` + add `--warning`.

**Auth / landing**
- `login-form.tsx:68-94`, `register-form.tsx:88-132`, `forgot`/`reset` inputs — no `autocomplete`/`name` attrs anywhere → breaks password managers. → add `email`/`current-password`/`new-password`.
- `login-form.tsx:55`, `register-form.tsx:75`, `reset-password.tsx:53` — error banners have no `role="alert"`/`aria-live`; never announced. → add.
- `forgot-password.tsx:47`, `reset-password.tsx:55` — `<label>` without `htmlFor`, `<input>` without `id` (login/register do it right — drift). → associate.
- `forgot-password.tsx:45`, `reset-password.tsx:52` — bare `space-y-4` form, **no `surface-card`** wrapper (login/register have it) → visual drift.
- `page.tsx:142-146` (landing) — desktop-only in-page nav `hidden md:flex` with **no mobile menu**; anchors unreachable on phones. → mobile disclosure.
- `page.tsx:296` — feature body copy `text-(--muted-2)` only reaches contrast on `group-hover`. → `--muted` base.

**Analyze / perf**
- `analyze-page.tsx:23-40` — three competing violet primaries once expanded ("Run Full Analysis" / "Sync & Analyze" / "Find & Analyze Competitors"); no single dominant action.
- `heatmap.tsx:59` vs dashboards — same metric, green vs violet ramp (see #8).
- `shared.tsx:41` — REEL/CAROUSEL FormatBadge uses raw `fuchsia-500`/`sky-500`/`text-white/70` off-palette.
- `health-score.tsx:11`, `analytics-dashboard.tsx:26`, `competitor-dashboard.tsx:35` — raw-hex/teal chart palettes.
- `analyze-tabs.tsx:43-71` — `role=tablist/tab` but no `aria-controls`, content not `role=tabpanel`; active state is a low-contrast `bg-(--surface-2)` only.
- `deep-profile-section.tsx:267`, `instagram-section.tsx:251`, `performance-page.tsx:17`, `compare-section.tsx:134` — spinners+text for large content-shaped regions → layout shift; only 2 places use skeletons.
- `insight-card.tsx (analyze):49-71` — toggle + drill-down chevron ~24px, adjacent, sub-44px.
- `post-autopsy.tsx:91` — renders raw enum "Verdict: positive". `meta-hub.tsx:606` — raw Graph API scopes shown to users.

**Create / smart-posts**
- `post-generator.tsx:1315-1319` — IG mock action bar dead-clicks (pointer+hover, no handler).
- `post-generator.tsx:859` — "Random Generator — Viral Post" marketing/dev-speak + em-dash (app strips dashes elsewhere).
- `smart-posts-dashboard.tsx:442,444,790` — "god-mode"/"seed" dev-speak in labels.
- `batch-gallery.tsx:792` — bespoke gradient primary vs `.cta-violet` everywhere else.
- `smart-posts-dashboard.tsx:458`, `batch-gallery.tsx:736`, `content-repurposer.tsx:113` — raw native `<select>` vs `ui/select` in post-generator → two dropdown looks in one flow.
- `post-analyzer.tsx:52-112`, `content-repurposer.tsx:164` — `bg-purple-*`/`text-red-400`/`fuchsia-*` off-token.
- `create/page.tsx:9`, `smart-posts/page.tsx:13` — subtitle `text-sm text-white` same color as the `h1` → no hierarchy.

**Autopilot / ads / settings**
- `brand-panel.tsx:523,537` — collapsed row shows **weekly-goal** status as dominant, not autopilot on/off; `weekly.status:'paused'` collides with autopilot paused. → explicit on/off pill.
- `autopilot-card.tsx:235-246` — the only on/off toggle is an unnamed `sr-only peer` checkbox, no `aria-label`/state. → name it.
- `settings-panel.tsx:127-134` — "Disconnect" (removes token) fires immediately, **no confirm**, un-undoable. → confirm step.
- `brain-panel.tsx:60-66` — raw pipeline keys `ig`/`ads`/`competitor_account` shown verbatim.
- `brain-badge.tsx:42` — detail modal is `bg-white` (hard light card) in a dark app + raw `briefMd` `<pre>` dump.

### 🟡 Medium

**Foundations:** no `prefers-reduced-motion` block (global) · `--muted-2` contrast (global) · `--muted` token overload (`globals.css:96`) · `onboarding-gate.tsx:36-45` flashes dashboard before modal on new users · `setup-banner.tsx:22-46` treats fetch failure as "not connected" (false-positive chips on outage) · two "Skip for now" controls with different effects (`onboarding-wizard.tsx:527` vs `:1063`).

**Auth:** generic single error for all login failures (network path indistinguishable) · register 8-char rule at top of form not inline · reset invalid-link is bare text not styled box/link · input sizing drift `px-3 py-2` vs `px-4 py-2.5` · button copy Title Case ("Send Reset Link"/"Reset Password") vs sentence case · legal pages (privacy/terms/data-deletion) have no header/home link — dead-ends.

**Analyze:** `competitor-dashboard.tsx:670` "Market Position" always ranks user last (dead code `:381`) · `deep-profile-section.tsx:294` renders nothing (no empty state) · `hero-card.tsx:55` top-post `<img>` no dimensions → pop-in shift · number/date formatter sprawl (see #7) · `compare-section.tsx:185` 3-col grid crushes at 375px · `source-toggle.tsx:24` disabled Meta segment is a `<span>` w/ `title` only (invisible to touch/kbd) · `post-autopsy.tsx:57` "autopsy" jargon · `instagram-section.tsx:281` raw `account_type`.

**Create:** `post-generator.tsx:991` overlay toggle 40×20px, no `role=switch`/`aria-checked` · `image-source-selector.tsx:91` search errors only `console.error`, no empty/"no results" state · `post-generator.tsx:1048` "Position & Size" label but size is hardcoded · error color families split (`red-400` vs `rose-*`) · `batch`/`generate` are client redirects into `/create?mode=` with `Suspense fallback={null}` (blank flash); 4 nav entries collapse to 2 surfaces.

**Autopilot:** two status-pill systems for same posts (`brand-panel.tsx:475` raw vs `autopilot-card.tsx:342` labeled) · card/border/radius drift (`glass-card rounded-xl border-white/5` vs `rounded-2xl border-(--line)`) · primary-button radius `rounded-lg` vs `rounded-2xl` · teal defaults `brand-manager.tsx:29` · `command-center.tsx:85` empty catch masks API errors as empty state · sub-44px controls (Run now, Edit/Delete, template ×) · `ads/page.tsx:114` 4-step indicator overflows at 375px · template delete `×` no confirm (`ads/page.tsx:200`) · "brain"/`briefVersion` dev-speak.

### 🟢 Polish
- Motion not reduced-motion-gated on `active:scale`, dialog zoom, marquee, spinners (all areas).
- `more-options-dialog.tsx:60` no `DialogDescription` (a11y warning).
- `candidate-strip.tsx:72` dead hover (`hover:border-(--line-strong)` on already-`border-(--line-strong)`).
- `batch-gallery.tsx:834` "Schedule All (N)" no confirm (bulk external side effect).
- `post-generator.tsx` 1463 lines (over 800 ceiling); two near-duplicate generate pipelines.
- Button height/padding drift within onboarding (`py-2.5` vs `py-3` vs `py-1.5`).
- Icon-size outliers (`h-[18px]` sidebar nav vs `h-4` norm).
- Radii off-scale `rounded-[11px]`/`[9px]`.
- Focus-ring double-declaration (see #10).
- `h1` color mix `text-white` vs `text-(--txt)` across pages.
- Landing: no skip-to-content link; 3 CTA shapes; stat sublabels tiny+low-contrast.
- Auth: logo never links home on any auth page; reset form state has no "back to sign in".
- Privacy/terms: 15–18 sections, no in-page TOC/anchors.
- `autopilot-card.tsx:235` toggle not optimistic (inert until round-trip).
- `brand-panel.tsx:586` non-semantic `<div onClick>` refresh-key bump (no keyboard equiv).
- Loading states mix skeletons and text spinners within the same area (autopilot, analyze).

---

## PART 3 — Recommended Phase 2 sequencing

**Step 1 — Foundation (do first; resolves most High/Medium at once):**
1. Define `.glass-card` **or** migrate all usages to `.surface-card`/`<Card>` (C1).
2. Decide the primitive strategy (adopt `ui/*` on tokens vs codify hand-rolled) (C2).
3. Tokens: add `--warning`, rename the text-gray (`--text-muted`), lighten/reserve `--muted-2`, single focus recipe on `--ring`, add a `prefers-reduced-motion` block, tokenize `--destructive` error recipe, define chart tokens `--chart-1..5`.
4. Shared primitives/utils: one `Button`, one card, one `statusBadge()`, one `formatCount`/`formatRelative`, one `Dialog` (trap+Esc+roles), one error/empty/skeleton pattern.
5. Delete dead code: `sidebar.tsx`, confirm+remove `meta-hub.tsx`; de-dupe `insight-card` ×2, `Metric` ×2, `formatNumber` ×2.

**Step 2 — Pages, one at a time (suggested order by user impact):**
`/analyze` (C6/C7/C8) → auth flow (C3 + drift) → `/create` + `/smart-posts` (C4/C5, dead-clicks, dev-speak) → `/autopilot` + `/settings` (toggle a11y, disconnect confirm, brain copy) → landing/legal → onboarding modal a11y.

---

*End of Phase 1 audit. No code has been changed. Awaiting review before Phase 2.*
