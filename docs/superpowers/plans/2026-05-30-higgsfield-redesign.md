# Higgsfield-Purple Platform Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire GoViraleza platform into higgsfield.ai's visual language with violet as the single bright accent, driven by a token system so most pages convert automatically.

**Architecture:** Design-system-first. Define a near-black + violet token palette in `globals.css`, remap the existing shadcn `--*` variables onto it, restyle the 12 `components/ui/*` primitives and the app shell, then sweep the remaining hardcoded `teal-`/`zinc-` utility classes page-group by page-group with browser verification against the approved mockup. Visual-only: no routing, data, or feature-behavior changes.

**Tech Stack:** Next.js (App Router), Tailwind CSS v4 (`@theme inline` in `globals.css`), shadcn primitives, Geist font, lucide-react icons, Vitest (+ jsdom snapshots), gstack `browse` skill for visual verification.

**Spec:** `docs/superpowers/specs/2026-05-30-higgsfield-redesign-design.md`

---

## Conventions used by every phase

**Browser verification (the "test" for visual work).** The `browse` binary path:
```
B="/c/Users/nickc/.claude/skills/gstack/browse/dist/browse"
```
Dev server: `npx next dev --port 3005` (port 3000 is another project — never kill it). To verify a page:
```
"$B" viewport 1440x900
"$B" goto http://localhost:3005/<path>
"$B" screenshot --viewport /tmp/<name>.png
```
Then Read `/tmp/<name>.png` and compare against the approved mockup (`/tmp/mock.png` look: near-black canvas, charcoal cards, violet pill nav active state, violet CTA, cyan/pink secondary pops). Also run `"$B" console --errors` and confirm no errors.

**Color mapping table (used by every sweep task — apply consistently):**

| Old utility | New |
|---|---|
| `bg-zinc-950` / `bg-[#09090b]` | `bg-[--bg]` (canvas) |
| `bg-zinc-900` / `bg-zinc-900/xx` | `bg-[--surface]` (card) |
| `bg-zinc-800` (raised/hover) | `bg-[--surface-2]` or `bg-white/[0.04]` |
| `border-zinc-800` / `border-zinc-700` | `border-[--line]` / `border-[--line-strong]` |
| `text-zinc-100` / `text-white` (headings) | `text-[--txt]` |
| `text-zinc-400` / `text-zinc-300` (body) | `text-[--muted]` |
| `text-zinc-500` / `text-zinc-600` (faint) | `text-[--muted-2]` |
| `teal-*` / `emerald-*` accent (text/bg/border) | `violet-*` or `.chip` / `.cta-violet` helper |
| teal/green "up/positive/success" | cyan (`text-[--cyan]`) for trends, green (`text-[--success]`) for explicit success |
| red "down/negative" | pink (`text-[--pink]`) for trend-down, keep red for errors/destructive |
| `brand-pacebrain` (blue) / `brand-affectly` (teal) | violet; use cyan vs pink only when two brands must be visually distinguished |
| `rounded-lg`/`rounded-xl` on cards | `rounded-2xl` (16px) to match higgsfield |

**Commit cadence:** one commit per task. Conventional commits, type `style` or `refactor` (visual), e.g. `style(shell): restyle sidebar to higgsfield-purple`. Attribution disabled per user settings. Branch: `feat/higgsfield-redesign` (already exists, spec committed there).

**Pre-push rule (from handoff):** the app auto-commits images to `main`; this branch is separate, but before any `git push` run `git pull --rebase origin main` only when merging. During the feature branch work, push to `origin feat/higgsfield-redesign`.

---

## Phase 1 — Token foundation

### Task 1: Add the higgsfield-purple token palette + helper classes

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add raw palette + remap the active `.dark` shadcn tokens**

In `src/app/globals.css`, replace the `.dark { ... }` block (lines ~86-118) with the following. This both defines the raw palette vars and remaps the shadcn semantic slots the primitives read:

```css
.dark {
  /* ── Higgsfield-purple raw palette ── */
  --bg: #0F1113;
  --bg-elevated: #15171A;
  --surface: #1C1E20;
  --surface-2: #212327;
  --sidebar-bg: #0C0E10;
  --line: rgba(255, 255, 255, 0.07);
  --line-strong: rgba(255, 255, 255, 0.12);
  --txt: #F7F7F8;
  --muted: #8A8F98;
  --muted-2: #6B7178;
  --violet: #8B5CF6;
  --violet-bright: #A78BFA;
  --violet-deep: #6D28D9;
  --violet-08: rgba(139, 92, 246, 0.08);
  --violet-12: rgba(139, 92, 246, 0.12);
  --violet-24: rgba(139, 92, 246, 0.24);
  --cyan: #4FCEE4;
  --pink: #FF4D8D;
  --success: #5FD07F;

  /* ── shadcn semantic slots remapped onto the palette ── */
  --background: var(--bg);
  --foreground: var(--txt);
  --card: var(--surface);
  --card-foreground: var(--txt);
  --popover: var(--surface);
  --popover-foreground: var(--txt);
  --primary: var(--violet);
  --primary-foreground: #ffffff;
  --secondary: var(--surface-2);
  --secondary-foreground: var(--txt);
  --muted-color: var(--bg-elevated);
  --muted-foreground: var(--muted);
  --accent: var(--violet-12);
  --accent-foreground: var(--txt);
  --destructive: oklch(0.704 0.191 22.216);
  --border: var(--line);
  --input: var(--line-strong);
  --ring: var(--violet);
  --chart-1: var(--violet);
  --chart-2: var(--cyan);
  --chart-3: var(--pink);
  --chart-4: var(--violet-bright);
  --chart-5: var(--success);
  --sidebar: var(--sidebar-bg);
  --sidebar-foreground: var(--txt);
  --sidebar-primary: var(--violet);
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: var(--violet-12);
  --sidebar-accent-foreground: var(--txt);
  --sidebar-border: var(--line);
  --sidebar-ring: var(--violet);
}
```

Note: the shadcn `--muted` slot must stay mapped to the elevated surface, but `--muted` is also our text token name. To avoid collision, the raw token above is `--muted` (text) and the shadcn slot uses `--muted-color`. Update the `@theme inline` mapping accordingly in Step 2.

- [ ] **Step 2: Point the `@theme inline` muted mapping at the renamed slot**

In the `@theme inline` block, change:
```css
  --color-muted: var(--muted);
```
to:
```css
  --color-muted: var(--muted-color);
```
Leave all other `--color-*` mappings as-is (they already reference the remapped vars).

- [ ] **Step 3: Replace the selection color + focus ring (teal → violet) and swap helper classes**

Replace the `::selection` rule and the `*:focus-visible` rule:
```css
  ::selection {
    background: rgba(139, 92, 246, 0.3);
  }
  *:focus-visible {
    @apply outline-none ring-2 ring-violet-500/50 ring-offset-2;
    --tw-ring-offset-color: var(--bg);
  }
```
Then replace the "Studio design system utilities" block at the bottom (`.glass-card`, `.brand-affectly`, `.brand-pacebrain`) with:
```css
/* Higgsfield-purple design system utilities */
.surface-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}
.surface-glow { position: relative; overflow: hidden; }
.surface-glow::before {
  content: '';
  position: absolute;
  top: -60px; right: -40px;
  width: 220px; height: 220px;
  background: radial-gradient(circle, var(--violet-24), transparent 70%);
  pointer-events: none;
}
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 13px; border-radius: 999px;
  font-size: 12px; font-weight: 600;
  background: var(--violet-12); color: var(--violet-bright);
  border: 1px solid var(--violet-24);
}
.chip-muted { background: rgba(255,255,255,0.04); color: var(--muted); border-color: var(--line); }
.chip-cyan  { background: rgba(79,206,228,0.12); color: var(--cyan); border-color: rgba(79,206,228,0.25); }
.chip-pink  { background: rgba(255,77,141,0.12); color: var(--pink); border-color: rgba(255,77,141,0.25); }
.cta-violet {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 18px; border-radius: 999px;
  font-size: 13px; font-weight: 700;
  background: var(--violet); color: #fff; border: none; cursor: pointer;
  box-shadow: 0 6px 24px rgba(139,92,246,0.4);
}
.cta-violet:hover { background: var(--violet-bright); }
.pill-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px; border-radius: 999px;
  font-size: 13px; font-weight: 600;
  background: rgba(255,255,255,0.04); color: var(--txt);
  border: 1px solid var(--line-strong); cursor: pointer;
}
```
Also update the `body::before` noise overlay opacity if needed (keep `0.015`).

- [ ] **Step 4: Ensure the app renders dark**

Confirm `src/app/layout.tsx` puts `className="dark"` on `<html>` (or `<body>`). If it does not, add `dark` to the `<html>` className so the `.dark` tokens are active. (Check before editing — do not duplicate.)

Run: open `src/app/layout.tsx`, verify/add the `dark` class.

- [ ] **Step 5: Visual smoke check**

Start dev server (`npx next dev --port 3005`), then:
```
"$B" goto http://localhost:3005/analyze
"$B" screenshot --viewport /tmp/p1-analyze.png
"$B" console --errors
```
Read `/tmp/p1-analyze.png`. Expected: backgrounds are now near-black `#0F1113`, cards charcoal, primary buttons violet (even before per-page work, because primitives read the remapped tokens). No console errors. Some pages will still show stray teal from hardcoded classes — that is expected and handled in Phase 4.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "style(tokens): higgsfield-purple palette, shadcn remap, helper classes"
```

---

## Phase 2 — App shell

### Task 2: Restyle the sidebar

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Test: `src/components/layout/__tests__/app-sidebar.test.tsx`

- [ ] **Step 1: Update the sidebar test expectations**

The current test asserts teal/zinc classes (the active indicator + container). Open `src/components/layout/__tests__/app-sidebar.test.tsx`, find assertions referencing `teal-400`, `bg-zinc-800`, or the `left-0 ... bg-teal-400` indicator, and update them to the new look. Replace the active-state assertion with one that checks the active link has the violet wash class. Concretely, change any `toContain('bg-teal-400')` / `'text-teal'` assertion to assert the active item container includes `'bg-[--violet-12]'` (or `aria-current`). If the test asserts the noise/teal indicator span, update it to assert the active item has `data-active` / the violet classes used in Step 2.

- [ ] **Step 2: Rewrite the sidebar markup to the mockup**

Replace the body of `app-sidebar.tsx` with the higgsfield treatment (keep the same `primaryItems`/`Settings`/`UserMenu` structure and the mobile drawer logic):

```tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, Sparkles, Plus, Bot, Megaphone, Menu, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/layout/user-menu';

const primaryItems = [
  { href: '/analyze', label: 'Analyze', icon: BarChart3 },
  { href: '/smart-posts', label: 'Smart Posts', icon: Sparkles },
  { href: '/create', label: 'Create', icon: Plus },
  { href: '/autopilot', label: 'Autopilot', icon: Bot },
  { href: '/ads', label: 'Ads', icon: Megaphone },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const navLink = (href: string, label: string, Icon: typeof BarChart3) => {
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        data-active={isActive}
        className={cn(
          'group flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-[--violet-12] text-white'
            : 'text-[--muted] hover:bg-white/[0.04] hover:text-[--txt]',
        )}
      >
        <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-[--violet-bright]' : '')} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-[--line] bg-[--surface] text-[--txt] md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-40 flex w-60 flex-col border-r border-[--line] bg-[--sidebar-bg] transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2.5 px-4">
          <Link href="/analyze" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-[--violet] to-[--violet-deep] text-[15px] font-extrabold text-white shadow-[0_0_24px_rgba(139,92,246,0.45)]">
              <Image src="/logo-goviraleza.png" alt="" width={20} height={14} className="rounded" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-[--txt]">GoViraleza</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[--muted] hover:bg-white/[0.04] hover:text-[--txt] md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[--muted-2]">Workspace</p>
        <nav className="flex flex-col gap-1 px-2">
          {primaryItems.map((i) => navLink(i.href, i.label, i.icon))}
        </nav>

        <p className="px-4 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[--muted-2]">Account</p>
        <nav className="flex flex-col gap-1 px-2">
          {navLink('/settings', 'Settings', Settings)}
        </nav>

        <div className="mt-auto p-2">
          <UserMenu />
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Run the sidebar test**

Run: `npx vitest run src/components/layout/__tests__/app-sidebar.test.tsx`
Expected: PASS (after the Step 1 expectation updates).

- [ ] **Step 4: Visual check + commit**

```
"$B" goto http://localhost:3005/analyze
"$B" screenshot --viewport /tmp/p2-sidebar.png
```
Read it; confirm sidebar matches mockup (near-black `#0C0E10`, "Workspace"/"Account" labels, violet active pill + glowing icon, gradient logo). Then:
```bash
git add src/components/layout/app-sidebar.tsx src/components/layout/__tests__/app-sidebar.test.tsx
git commit -m "style(shell): restyle sidebar to higgsfield-purple"
```

### Task 3: Restyle layout, user-menu, setup-banner

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/layout/user-menu.tsx`
- Modify: `src/components/layout/setup-banner.tsx`
- Test: `src/components/layout/__tests__/user-menu.test.tsx`

- [ ] **Step 1: Layout canvas**

In `src/app/(dashboard)/layout.tsx`, the `<main>` inherits `--background`, so no bg change is required, but confirm there are no hardcoded `bg-zinc-*`. Leave `ml-60` offset and container as-is. If a hardcoded bg exists, map it per the table.

- [ ] **Step 2: user-menu**

In `src/components/layout/user-menu.tsx`, apply the mapping table: container → `.surface-card` look (`bg-[--surface] border border-[--line] rounded-xl`), avatar gradient `from-[--cyan] to-[--violet]`, name `text-[--txt]`, plan/email line `text-[--muted-2]`, the sign-out item hover `hover:bg-white/[0.04]`, any teal → violet. Keep the `signOut` behavior unchanged.

- [ ] **Step 3: Update user-menu test if it asserts old classes**

Run: `npx vitest run src/components/layout/__tests__/user-menu.test.tsx`. If it fails on a class/text assertion, update the expectation to the new class; do not change behavior assertions (sign-out call, name render).

- [ ] **Step 4: setup-banner**

In `src/components/layout/setup-banner.tsx`, map zinc/teal per the table; if it is a call-to-action banner, use `.chip`/`.cta-violet` and `border-[--violet-24] bg-[--violet-08]`.

- [ ] **Step 5: Verify + commit**

```
"$B" goto http://localhost:3005/analyze
"$B" screenshot --viewport /tmp/p2-shell.png
"$B" console --errors
```
Read; confirm user-menu + banner on theme, no errors.
```bash
git add "src/app/(dashboard)/layout.tsx" src/components/layout/user-menu.tsx src/components/layout/setup-banner.tsx src/components/layout/__tests__/user-menu.test.tsx
git commit -m "style(shell): restyle layout, user-menu, setup-banner"
```

---

## Phase 3 — UI primitives

### Task 4: Restyle the 12 shadcn primitives

**Files (modify each):** `src/components/ui/{button,card,input,textarea,select,badge,tabs,dialog,sheet,avatar,separator,scroll-area}.tsx`

Most primitives already read shadcn tokens (`bg-primary`, `border-input`, `bg-card`, etc.), so the Phase 1 remap converts them automatically. This task handles the radius + variant polish and any hardcoded zinc.

- [ ] **Step 1: button — violet primary + pill option**

In `src/components/ui/button.tsx`, in the `buttonVariants` cva:
- `default` variant: ensure it uses `bg-primary text-primary-foreground` with `hover:bg-primary/90` (now violet). Add `shadow-[0_6px_24px_rgba(139,92,246,0.35)]` to `default`.
- Add a `pill` to the `size` (or a `shape`) options: `rounded-full px-5`. If cva has no shape axis, add `pill: 'rounded-full'` under a new `shape` variant with `defaultVariants.shape: 'default'` and `default: 'rounded-md'`.
- `outline`/`secondary`/`ghost`: replace any `border-zinc-*`/`bg-zinc-*` with `border-[--line] bg-white/[0.04] hover:bg-white/[0.08]`.

- [ ] **Step 2: card — 16px radius + line border**

In `src/components/ui/card.tsx`, change the root `rounded-xl`/`rounded-lg` to `rounded-2xl`, ensure `border-[--line]` (or keep `border` which now resolves to `--line`) and `bg-card` (→ surface). Remove any hardcoded zinc.

- [ ] **Step 3: input / textarea / select — surface-2 + violet ring**

In each of `input.tsx`, `textarea.tsx`, `select.tsx`: background `bg-[--surface-2]`, border `border-[--line]` → `focus:border-[--violet]`, ring `focus-visible:ring-[--violet]`, radius `rounded-xl` (12px), placeholder `placeholder:text-[--muted-2]`. Replace hardcoded zinc.

- [ ] **Step 4: badge — chip variants**

In `src/components/ui/badge.tsx`, map cva variants: `default` → violet chip (`bg-[--violet-12] text-[--violet-bright] border-[--violet-24]`), add/repoint `secondary` → `.chip-muted` equivalent, `destructive` stays red. Add `cyan` and `pink` variants matching `.chip-cyan`/`.chip-pink` if the codebase will use them (only if referenced; otherwise skip per YAGNI).

- [ ] **Step 5: tabs — violet active**

In `src/components/ui/tabs.tsx`, active `TabsTrigger` → violet underline or `data-[state=active]:bg-[--violet-12] data-[state=active]:text-white`; inactive `text-[--muted]`.

- [ ] **Step 6: dialog / sheet — surface + near-black backdrop**

In `dialog.tsx` and `sheet.tsx`: content `bg-[--surface] border-[--line] rounded-2xl`; overlay `bg-black/70`. Replace hardcoded zinc.

- [ ] **Step 7: avatar / separator / scroll-area**

`avatar.tsx`: fallback `bg-[--surface-2] text-[--muted]`. `separator.tsx`: `bg-[--line]`. `scroll-area.tsx`: thumb `bg-white/[0.1]`. Replace hardcoded zinc.

- [ ] **Step 8: Run the full unit suite (catch snapshot drift)**

Run: `npx vitest run`
Expected: PASS except possibly `deep-profile-section.test.tsx.snap` (a committed snapshot asserting old zinc classes). If it fails ONLY due to expected class changes, update the snapshot: `npx vitest run -u src/components/performance/__tests__/deep-profile-section.test.tsx` and eyeball the diff to confirm it is only color-class changes.

- [ ] **Step 9: Verify a primitive-heavy page + commit**

```
"$B" goto http://localhost:3005/settings
"$B" screenshot --viewport /tmp/p3-primitives.png
"$B" console --errors
```
Read; confirm inputs/cards/buttons/tabs are on theme.
```bash
git add src/components/ui/ src/components/performance/__tests__/
git commit -m "style(ui): restyle shadcn primitives to higgsfield-purple"
```

---

## Phase 4 — High-traffic page polish + per-group sweep

Each task below: (a) sweep hardcoded utilities per the mapping table, (b) apply `.chip`/`.cta-violet`/`.surface-card`/`.surface-glow` and `rounded-2xl` bento treatment to match the mockup, (c) verify in browser, (d) commit. Use Grep to find offenders per file: `teal-|emerald-|zinc-|gray-|slate-|neutral-|brand-pacebrain|brand-affectly|#09090b`.

### Task 5: Analyze (the mockup page)

**Files:** `src/components/analyze/**`, `src/components/performance/**`, `src/components/analyze/insights/**`, `src/components/analytics-dashboard.tsx`, `src/app/(dashboard)/analyze/page.tsx`, `src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Sweep + polish**

For each file (find them with `git grep -lE "teal-|emerald-|zinc-|gray-|slate-|neutral-|brand-(pacebrain|affectly)" src/components/analyze src/components/performance src/components/analytics-dashboard.tsx`), apply the mapping table. Specifically:
- Stat cards → `.surface-card` + big numbers `text-[--txt]`, deltas: up `text-[--cyan]`/`text-[--success]`, down `text-[--pink]`.
- Brand selector chips → `.chip` (active) / `.chip-muted`.
- The hero/feature chart panel → `.surface-glow` with violet bars (`from-[--violet] to-[--violet-deep]`).
- Health Score / trend pills → violet, cyan for "up".

- [ ] **Step 2: Verify against mockup**

```
"$B" goto http://localhost:3005/analyze
"$B" screenshot --viewport /tmp/p4-analyze.png
"$B" responsive /tmp/p4-analyze
"$B" console --errors
```
Read `/tmp/p4-analyze.png` and `/tmp/p4-analyze-mobile.png`. It should closely match the approved mockup. Fix drift before committing.

- [ ] **Step 3: Commit**

```bash
git add src/components/analyze src/components/performance src/components/analytics-dashboard.tsx "src/app/(dashboard)/analyze" "src/app/(dashboard)/analytics"
git commit -m "style(analyze): higgsfield-purple bento + sweep"
```

### Task 6: Smart Posts + Create

**Files:** `src/components/smart-posts-dashboard.tsx`, `src/components/smart-posts/**`, `src/components/create/**`, `src/components/post-generator.tsx`, `src/components/post-analyzer.tsx`, `src/components/content-repurposer.tsx`, `src/components/content-calendar.tsx`, `src/components/batch-gallery.tsx`, `src/app/(dashboard)/{smart-posts,create,generate,batch}/page.tsx`

- [ ] **Step 1: Sweep + polish** — apply mapping table; candidate strips/cards → `.surface-card`; generate/primary buttons → `.cta-violet` or `<Button>`; "why this works"/insight chips → `.chip`. (Respect existing memory: `/smart-posts` keeps ONE composite Generate button — do not restructure, visual only.)
- [ ] **Step 2: Verify**
```
"$B" goto http://localhost:3005/smart-posts
"$B" screenshot --viewport /tmp/p4-smart.png
"$B" goto http://localhost:3005/create
"$B" screenshot --viewport /tmp/p4-create.png
"$B" console --errors
```
Read both; fix drift.
- [ ] **Step 3: Commit**
```bash
git add src/components/smart-posts-dashboard.tsx src/components/smart-posts src/components/create src/components/post-generator.tsx src/components/post-analyzer.tsx src/components/content-repurposer.tsx src/components/content-calendar.tsx src/components/batch-gallery.tsx "src/app/(dashboard)/smart-posts" "src/app/(dashboard)/create" "src/app/(dashboard)/generate" "src/app/(dashboard)/batch"
git commit -m "style(create): higgsfield-purple sweep for smart-posts, create, batch"
```

### Task 7: Ads wizard + queue

**Files:** `src/app/(dashboard)/ads/page.tsx`, `src/app/(dashboard)/ads/_components/{StepGoal,StepCreative,StepAudience,StepReview,AdPreview}.tsx`, `src/app/(dashboard)/ads/queue/page.tsx`, `src/components/image-source-selector.tsx`

- [ ] **Step 1: Sweep + polish** — wizard step rail → violet active dots/numbers; step cards → `.surface-card`; the success panel in `StepReview` (currently `border-teal-700 bg-teal-500/10`) → `border-[--violet-24] bg-[--violet-08] text-[--violet-bright]`; "Create Paused Ad" button → `.cta-violet`; PAUSED warning banner keep amber. Apply mapping table everywhere else. **Do not** touch the budget/`is_adset_budget_sharing_enabled` logic — visual only.
- [ ] **Step 2: Verify**
```
"$B" goto http://localhost:3005/ads
"$B" screenshot --viewport /tmp/p4-ads.png
"$B" goto http://localhost:3005/ads/queue
"$B" screenshot --viewport /tmp/p4-adsqueue.png
"$B" console --errors
```
Read both; fix drift.
- [ ] **Step 3: Commit**
```bash
git add "src/app/(dashboard)/ads" src/components/image-source-selector.tsx
git commit -m "style(ads): higgsfield-purple sweep for wizard + queue"
```

### Task 8: Autopilot

**Files:** `src/components/autopilot/**`, `src/app/(dashboard)/autopilot/page.tsx`

- [ ] **Step 1: Sweep + polish** — brand panels/cards → `.surface-card`; status pills → `.chip`/`.chip-cyan` (running) / `.chip-pink` (error); toggles → violet. Per memory, autopilot has heavy zinc usage (`brand-panel.tsx`, `autopilot-card.tsx`) — sweep thoroughly.
- [ ] **Step 2: Verify**
```
"$B" goto http://localhost:3005/autopilot
"$B" screenshot --viewport /tmp/p4-autopilot.png
"$B" console --errors
```
Read; fix drift.
- [ ] **Step 3: Commit**
```bash
git add src/components/autopilot "src/app/(dashboard)/autopilot"
git commit -m "style(autopilot): higgsfield-purple sweep"
```

---

## Phase 5 — Remaining dashboard surfaces

### Task 9: Competitors, Meta, Profile, Settings, Brain, Onboarding, misc components

**Files:** `src/components/competitor-dashboard.tsx`, `src/components/competitor-card.tsx`, `src/components/command-center.tsx`, `src/components/settings-panel.tsx`, `src/components/brand-voice-settings.tsx`, `src/components/brand-manager.tsx`, `src/components/onboarding-wizard.tsx`, `src/components/insight-card.tsx`, `src/components/health-score.tsx`, `src/components/brain/**`, `src/app/(dashboard)/{competitors,meta,profile,settings}/page.tsx`, plus any remaining offenders.

- [ ] **Step 1: Find all remaining offenders**

Run: `git grep -lE "teal-|emerald-|brand-(pacebrain|affectly)|#09090b" src/components src/app | grep -v __tests__`
This is the authoritative remaining list. Sweep each per the mapping table.

- [ ] **Step 2: Sweep + verify each page group**
```
for p in competitors meta profile settings; do
  "$B" goto http://localhost:3005/$p
  "$B" screenshot --viewport /tmp/p5-$p.png
  "$B" console --errors
done
```
Read each screenshot; fix drift.

- [ ] **Step 3: Confirm the accent sweep is complete**

Run: `git grep -nE "teal-|emerald-" src/components src/app | grep -v __tests__ | grep -v node_modules`
Expected: no results (every accent now violet/cyan/pink). If any remain, sweep them.

- [ ] **Step 4: Commit**
```bash
git add src/components src/app
git commit -m "style(app): higgsfield-purple sweep for remaining dashboard surfaces"
```

---

## Phase 6 — Auth + Landing

### Task 10: Auth screens

**Files:** `src/app/{login,register,forgot-password,reset-password}/page.tsx`, `src/components/{login-form,register-form}.tsx`

- [ ] **Step 1: Sweep + polish** — page bg `bg-[--bg]`; centered `.surface-card` (`max-w-sm`); gradient logo (reuse the sidebar logo treatment); inputs inherit primitive styling; submit → violet `<Button>`; links → `text-[--violet-bright]`; error text keep red. Apply mapping table.
- [ ] **Step 2: Verify**
```
for p in login register forgot-password reset-password; do
  "$B" goto http://localhost:3005/$p
  "$B" screenshot --viewport /tmp/p6-$p.png
  "$B" console --errors
done
```
Read each; confirm centered violet card, no errors.
- [ ] **Step 3: Commit**
```bash
git add "src/app/login" "src/app/register" "src/app/forgot-password" "src/app/reset-password" src/components/login-form.tsx src/components/register-form.tsx
git commit -m "style(auth): higgsfield-purple auth screens"
```

### Task 11: Public landing page

**Files:** `src/app/page.tsx`

- [ ] **Step 1: Rework hero + sections to higgsfield language**

In `src/app/page.tsx`: canvas `bg-[--bg]`; replace the teal/cyan/purple `GradientText` with a violet gradient (`from-[--violet] via-[--violet-bright] to-[--violet-deep]`); `SectionLabel` teal → violet; background mesh orbs → violet/cyan/pink at low opacity; feature cards → `rounded-2xl border-[--line] bg-white/[0.02]` with violet hover glow; primary CTAs → `.cta-violet` look (`bg-[--violet]` with violet shadow) instead of the teal→cyan gradient; "Sign in" / nav unchanged in structure. Apply mapping table to all `teal-`/`zinc-`/`emerald-` and the `from-teal-* to-cyan-*` gradients.

- [ ] **Step 2: Verify (desktop + mobile, full page)**
```
"$B" goto http://localhost:3005/
"$B" screenshot /tmp/p6-landing.png
"$B" responsive /tmp/p6-landing
"$B" console --errors
```
Read `/tmp/p6-landing.png` (full page) + mobile; confirm violet hero, bento feature cards, no teal remnants.

- [ ] **Step 3: Commit**
```bash
git add src/app/page.tsx
git commit -m "style(landing): higgsfield-purple public landing page"
```

### Task 12: Legal pages token pass

**Files:** `src/app/{terms,privacy,data-deletion}/page.tsx`

- [ ] **Step 1: Minimal pass** — bg `bg-[--bg]`, body `text-[--muted]`, headings `text-[--txt]`, links `text-[--violet-bright]`. Map any zinc.
- [ ] **Step 2: Verify**
```
for p in terms privacy data-deletion; do "$B" goto http://localhost:3005/$p; "$B" screenshot --viewport /tmp/p6-$p.png; done
```
Read each.
- [ ] **Step 3: Commit**
```bash
git add "src/app/terms" "src/app/privacy" "src/app/data-deletion"
git commit -m "style(legal): higgsfield-purple token pass"
```

---

## Phase 7 — Final verification + ship

### Task 13: Full-app verification

- [ ] **Step 1: Full unit suite green**

Run: `npx vitest run`
Expected: all pass (≈370 tests + updated sidebar/user-menu/snapshot). Fix any class-assertion failures by updating expectations to the new design (never weaken behavior assertions).

- [ ] **Step 2: Typecheck (changed files clean)**

Run: `npx tsc --noEmit`
Expected: no NEW errors in changed files. (Pre-existing errors in `deep-profile.test.ts` and `tests/e2e/brain.spec.ts` are unrelated and may remain.)

- [ ] **Step 3: Zero accent remnants**

Run: `git grep -nE "teal-|emerald-|#09090b|brand-(pacebrain|affectly)" src/components src/app | grep -v __tests__`
Expected: empty. This proves the cascade is complete.

- [ ] **Step 4: Console-error sweep across all routes**
```
for p in "" analyze smart-posts create autopilot ads ads/queue competitors meta profile settings login register; do
  "$B" goto http://localhost:3005/$p
  echo "== /$p =="; "$B" console --errors
done
```
Expected: no errors on any route.

- [ ] **Step 5: Push the branch**
```bash
git push -u origin feat/higgsfield-redesign
```

- [ ] **Step 6: Decide integration**

Use `superpowers:finishing-a-development-branch`: open a PR for review, or (per the handoff's main-flow) `git checkout main && git pull --rebase origin main && git merge --ff-only feat/higgsfield-redesign && git push origin main` to deploy to production (~90s). Confirm the deploy goes READY via the Vercel MCP and screenshot the live `/analyze` to confirm the new look in production.

---

## Self-Review notes (spec coverage)

- Tokens (surfaces, violet washes, cyan/pink, radii) → Task 1. ✔
- shadcn slot remap → Task 1 Step 1. ✔
- Helper classes (`.chip`, `.cta-violet`, `.surface-card`, `.surface-glow`, `.pill-btn`, `.chip-muted/cyan/pink`) → Task 1 Step 3. ✔
- Sidebar (gradient logo, pill nav, glowing active) → Task 2. ✔
- Layout / user-menu / setup-banner → Task 3. ✔
- 12 primitives → Task 4. ✔
- Color sweep (373 teal + 831 zinc) with consistent mapping → Tasks 5-9 (per-group) + Task 13 Step 3 (completeness gate). ✔
- High-traffic hand-polish (Analyze, Create/Smart Posts, Ads, Autopilot) → Tasks 5-8. ✔
- Auth + landing + legal → Tasks 10-12. ✔
- Dark-only (no light-mode investment) → Task 1 keeps `:root` intact, all work in `.dark`. ✔
- Tests/snapshots updated, no behavior change → Tasks 2/3/4 + Task 13. ✔
- Browser verification per phase → every task. ✔
- Per-brand color collapse onto violet (cyan/pink distinguishers) → mapping table + Task 8. ✔
```
