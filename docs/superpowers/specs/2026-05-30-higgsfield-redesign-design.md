# Platform Redesign — "Higgsfield-Purple" Design Language

**Date:** 2026-05-30
**Status:** Approved (brainstorm) — pending spec review
**Owner:** Nick / GoViraleza

---

## Goal

Rebuild the entire GoViraleza platform's visual design in the language of
[higgsfield.ai](https://higgsfield.ai), substituting **violet** for higgsfield's
lime-yellow accent. Keep the existing left-sidebar app shell and all current
functionality. This is a **visual / design-system change only** — no routing,
data, or feature behavior changes.

Reference DNA measured from the live higgsfield.ai site:
- Background `rgb(15,17,19)` (near-black, faint cool tint)
- Card/surface `rgb(28,30,32)`, 16px radii, media-forward
- One bright accent used as solid CTAs (dark/white text on accent) + translucent
  "chips" (accent text on 5–24% accent wash)
- Pill-shaped nav items and buttons
- Bento grids; bold, tight headings; system sans font
- Secondary pops: cyan (positive/info), pink (alert/hot)

An approved mockup of the target look exists (Analyze page) and is the visual
source of truth. See "Approved Mockup" below.

## Decisions (locked during brainstorm)

| Decision | Choice |
|---|---|
| Nav shell | **Keep the left sidebar**, restyle it (no top-nav switch) |
| Primary accent | **Vivid violet `#8B5CF6`** (violet-500), bright `#A78BFA` for glow/active |
| Secondary accents | **Cyan `#4FCEE4` + pink `#FF4D8D`** (higgsfield-style), **replacing teal** |
| Rollout | **Design-system-first**, then cascade to pages |
| Vibe | Approved mockup as-is (subtle violet glow, not flat, not max-neon) |
| Coverage | **Whole platform**: dashboard + auth (login/register/reset) + public landing |

## Non-Goals

- No change to navigation structure, routes, or the 5 primary sections.
- No change to feature logic, API routes, data, or the ad builder behavior.
- No component-library swap (stay on the existing shadcn primitives + Tailwind v4).
- No new fonts (keep Geist / system sans).
- Light mode is **not** supported/maintained — the app is dark-only. The light
  `:root` block stays intact but unused; all redesign work targets the active `.dark`
  theme as the single source of truth.

---

## Design Tokens

The app uses **Tailwind v4** with an `@theme inline` block in `globals.css` mapping
`--color-*` to CSS variables. Current `:root` / `.dark` tokens are **grayscale**
(oklch chroma 0); teal and zinc are hardcoded as utility classes throughout.

### New token palette (added to `globals.css`)

Surfaces (near-black ramp):
```
--bg:        #0F1113   /* app canvas */
--bg-elevated:#15171A  /* raised sections, sidebar-adjacent */
--surface:   #1C1E20   /* cards, panels */
--surface-2: #212327   /* nested / hover cards */
--sidebar-bg:#0C0E10   /* sidebar, slightly darker than canvas */
--line:      rgba(255,255,255,0.07)   /* hairline borders */
--line-strong:rgba(255,255,255,0.12)
```

Text:
```
--txt:       #F7F7F8
--muted:     #8A8F98
--muted-2:   #6B7178
```

Accent (violet) + washes:
```
--violet:    #8B5CF6   /* primary accent, CTAs, active */
--violet-bright:#A78BFA /* glow, active icon */
--violet-deep:#6D28D9  /* gradient stop */
--violet-08: rgba(139,92,246,0.08)
--violet-12: rgba(139,92,246,0.12)
--violet-24: rgba(139,92,246,0.24)
```

Secondaries:
```
--cyan:      #4FCEE4   /* positive / up / info */
--pink:      #FF4D8D   /* alert / down / hot */
--success:   #5FD07F   /* explicit good states */
```

Radii (higgsfield-ish): cards `16–18px`, inputs/buttons `12px`, pills `999px`.

### Mapping into shadcn token slots

To make primitives inherit the look without per-component edits, remap the existing
semantic `--*` variables (in `.dark`, which is the active theme) to the new palette:

| shadcn var | new value |
|---|---|
| `--background` | `--bg` |
| `--card`, `--popover` | `--surface` |
| `--primary` | `--violet` |
| `--primary-foreground` | `#fff` (white text on violet CTAs) |
| `--accent` | `--violet-12` wash |
| `--muted` | `--bg-elevated` |
| `--muted-foreground` | `--muted` |
| `--border`, `--input` | `--line` / `--line-strong` |
| `--ring` | `--violet` |
| `--sidebar`, `--sidebar-*` | sidebar tokens above, `--sidebar-primary` = violet |
| `--destructive` | keep red |
| chart-1..5 | violet → cyan → pink ramp |

The `:root` (light) block is left intact but the app forces `.dark`; we do not invest
in light mode.

### Utility helpers (in `globals.css`)

Replace the current `.glass-card`, `.brand-affectly` (teal), `.brand-pacebrain` (blue)
helpers with a higgsfield set:
```
.surface-card   → bg var(--surface), 1px var(--line), radius 16px
.surface-glow   → adds a violet radial glow pseudo-element (as in mockup)
.chip           → pill, violet-12 wash, violet-bright text
.chip-muted     → pill, white/4% wash, muted text
.chip-cyan / .chip-pink → semantic chips
.cta-violet     → pill, solid violet, white text, soft violet shadow
.pill-btn       → pill, white/4% wash, hairline border
```
Selection color and focus ring switch from teal to violet.

---

## App Shell

### Sidebar (`src/components/layout/app-sidebar.tsx`)

- Background `--sidebar-bg` (`#0C0E10`), hairline right border `--line`.
- Brand: gradient violet logo tile (violet→deep) with a soft glow, wordmark.
- Section labels ("Workspace", "Account") in `--muted-2`, uppercase, 11px.
- Nav items: pill (`rounded-[11px]`), 14px medium.
  - Hover: white/4% wash, text → `--txt`.
  - Active: `--violet-12` wash, white text, **glowing violet icon** (replace the
    current teal left-bar indicator with the mockup's active-pill + glow treatment).
- Footer: surface card with avatar (cyan→violet gradient), name + plan line.
- Mobile drawer + toggle button restyled to match (near-black, violet focus).

### Layout (`src/app/(dashboard)/layout.tsx`)

- Canvas `--bg`. Keep `ml-60` content offset and max-width container.
- Replace the global faint noise overlay tint to suit near-black (keep subtle).

### Shared shell bits

- `user-menu.tsx`, `setup-banner.tsx`: restyle to surfaces + violet accents.

---

## UI Primitives (`src/components/ui/*.tsx`)

Restyle the 12 primitives so feature pages inherit the look:
- **button**: violet primary variant (pill option), surface secondary, ghost on
  white/4%; ring → violet. Add a `pill` size/shape and a `cta` variant if needed.
- **card**: `--surface`, `--line`, 16px radius; optional glow modifier.
- **input / textarea / select**: `--surface-2` bg, `--line` border, violet focus ring,
  12px radius, muted placeholder.
- **badge**: map variants to chip styles (violet / cyan / pink / muted).
- **tabs**: active tab = violet underline or violet-12 pill; inactive muted.
- **dialog / sheet**: surface bg, `--line` border, near-black backdrop.
- **avatar, separator, scroll-area**: tokens + hairlines.

These changes plus the token remap should visually convert the majority of pages
automatically.

---

## Color Sweep (cascade)

After tokens + primitives, sweep hardcoded utility classes in feature components.
Scope measured: **373 `teal-/emerald-`** across 60 files, **831 `zinc-/gray-/
neutral-/slate-`** across 69 files.

Sweep rules (consistent mapping):
- `teal-*` / `emerald-*` accent usages → `violet-*` (or `.chip` / `.cta-violet`
  helpers where it's a chip/button).
- Positive/up indicators that were teal/green → keep green `--success` or cyan per
  semantics (up-trends = cyan, explicit success = green).
- `zinc-950/900` backgrounds → `--bg` / `--surface`; `zinc-800` borders → `--line`;
  `zinc-400/500` text → `--muted`; `zinc-100/white` headings → `--txt`.
- Per-brand colors (`brand-pacebrain` blue, `brand-affectly` teal) → unify on violet
  with optional cyan/pink as the two brand distinguishers.

Sweep is done **page-group by page-group** (see plan phases), each verified in the
browser against the mockup, not as one giant find-replace (semantics differ per use).

### High-traffic pages to hand-polish (beyond sweep)

These get explicit bento/chip/CTA treatment to match the mockup quality:
1. **Analyze** (`analyze/`, `performance/`, `analyze/insights/`) — the mockup page.
2. **Create** / **Smart Posts** — generation surfaces, candidate strips, dialogs.
3. **Ads** wizard (`ads/_components/*`) + queue — steps, preview, chips.
4. **Autopilot** — brand panels / cards.

---

## Auth + Landing

- **Auth** (`login`, `register`, `forgot-password`, `reset-password` + their form
  components): near-black canvas, single centered surface card with violet CTA,
  violet focus rings, gradient logo. Replace zinc/teal.
- **Public landing** (`src/app/page.tsx`): restyle hero + feature sections to the
  higgsfield language — near-black, violet gradient hero glow, bento feature cards,
  pill CTAs. Keep existing copy/sections; this is visual only.
- Legal pages (`terms`, `privacy`, `data-deletion`): minimal token pass (bg + text).

---

## Component Boundaries (isolation)

- **Tokens** (`globals.css`): single source of color/radius. Everything references
  these; no new hardcoded hexes in components.
- **Primitives** (`components/ui/*`): own all base interactive styling. Feature
  components compose primitives + helper classes, not raw color utilities.
- **Shell** (`layout/*`): owns navigation chrome only.
- **Helper classes** (`.chip`, `.cta-violet`, `.surface-card`, `.surface-glow`):
  the shared vocabulary feature pages use instead of re-deriving washes/glows.

Success test: a new page built from primitives + helpers looks on-brand with **zero**
raw `zinc-`/`teal-` utilities.

---

## Testing & Verification

- **Unit/snapshot**: existing ~370 tests must stay green. Update the one committed
  snapshot (`deep-profile-section.test.tsx.snap`) and the `app-sidebar.test.tsx`
  expectations that assert teal/zinc classes.
- **Visual verification per phase**: use the `browse` skill to screenshot each
  restyled page group at desktop + mobile and compare against the mockup; fix drift
  before moving on.
- **Contrast/a11y**: violet CTA text and muted text must meet AA on near-black;
  verify focus rings are visible.
- **No-regression**: every page still renders, no console errors, all flows
  (generate, ad wizard, autopilot) still work — design change must not break behavior.

## Risks

- **Sweep volume** (1200+ utility occurrences): mitigated by token remap + primitive
  restyle doing most of the work, leaving a smaller hand sweep. Done per group with
  browser verification.
- **Per-brand color semantics**: collapsing blue/teal brand colors onto violet may
  reduce at-a-glance brand distinction — mitigated by using cyan/pink as the two
  brand distinguishers where brand identity matters.
- **Snapshot/test churn**: a few tests assert specific classes; update them as part
  of the relevant phase.

## Approved Mockup

The approved look (Analyze page) — for reference during implementation:
- Sidebar `#0C0E10`, gradient violet logo, pill nav, glowing violet active item.
- Canvas `#0F1113`. Page header (28px bold) + muted subtitle + pill controls + violet
  CTA. Chip row (violet active, muted brand chips, cyan trend chip).
- 4-up stat bento (`--surface`, 16px), big numbers, green/pink deltas.
- 2-col bento: chart panel with violet bars + violet radial glow; "top posts" media
  grid with cyan/pink-tinted tiles and pill tags.

(Mockup HTML used to generate it can be regenerated from this spec; it is not a
shipped artifact.)
