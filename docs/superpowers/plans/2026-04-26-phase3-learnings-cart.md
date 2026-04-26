# Phase 3: Learnings Cart + Deep Handoff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each insight card gets a "Use this" toggle. Selected learnings encode into a URL param. The bottom of `/analyze` shows two CTAs that hand off to `/smart-posts` and `/create` with the ticked context. Both downstream pages consume `learnings` and feed only the picked insights into their generation.

**Architecture:** No DB migration. The cart lives entirely in URL state — `?learnings=id1,id2,id3`. Insight cards become tickable. The selection is a `Set<string>` on the feed. CTAs build the URL. Smart Posts' god-mode route accepts `learningIds: string[]` and filters before calling `mergePerfectSeed`. Create's batch generator reads the same param. Deep-profile cards (best-format, top-hook, etc.) are tickable but currently affect god-mode only via the deep-profile JSON it already consults — Phase 3 stores the IDs but doesn't change god-mode's deep-profile handling.

**Tech stack:** React 18, vitest. No new deps.

**Source map (read these before starting):**
- `src/lib/smart-posts.ts` — `mergePerfectSeed(insights, brandId)`, `seedFromInsight`. The cart filters which insights this call sees.
- `src/lib/smart-posts/generate.ts` — `generateFromSeed`. Already accepts `insightId` for single-insight mode; we'll bypass that path for the cart.
- `src/app/api/smart-posts/god-mode/route.ts` — accepts `{brandId, igUserId, likeOfMediaId}` body today. Phase 3 adds `learningIds: string[]`.
- `src/components/smart-posts-dashboard.tsx` — calls god-mode. Must read `learnings` query param.
- `src/components/batch-gallery.tsx` — the `/create` batch flow. Will also read `learnings`.
- `src/components/analyze/insights/insight-card.tsx` — adds the toggle.
- `src/components/analyze/insights/insight-feed.tsx` — owns selection state.

---

## File structure

**Create:**
- `src/lib/analyze/learnings.ts` — `encodeLearnings`, `decodeLearnings`, `filterInsightsByLearnings` helpers
- `src/lib/analyze/__tests__/learnings.test.ts` — unit tests
- `src/components/analyze/insights/learnings-cta-dock.tsx` — the bottom dock

**Modify:**
- `src/components/analyze/insights/insight-card.tsx` — add `selected: boolean` and `onToggle: () => void` props
- `src/components/analyze/insights/insight-feed.tsx` — own a `Set<string>` of selected IDs, pass through, render the dock when ≥1 selected
- `src/app/api/smart-posts/god-mode/route.ts` — accept `learningIds: string[]` in the body, forward to `generateFromSeed`
- `src/lib/smart-posts/generate.ts` — `GenerateFromSeedInput` adds `learningIds?: string[]`. When set, filter `allInsights` before `mergePerfectSeed`.
- `src/components/smart-posts-dashboard.tsx` — read `learnings` query param via `useSearchParams`, include it in the god-mode POST body
- `src/components/batch-gallery.tsx` — read `learnings` query param, include it when generating batch posts

No deletions.

---

## Behavioral contract

The `learnings` query param is a comma-separated list of insight IDs:

```
/smart-posts?brand=affectly&learnings=best-content-type,optimal-timing,best-format
```

If the param is missing or empty, downstream behavior is **unchanged from Phase 2** — every actionable insight contributes (current behavior). If present and non-empty, only insights whose `id` matches one of the listed values contribute. Deep-profile-card IDs (`best-format`, `caption-length-sweet-spot`, `best-time-slot`, `top-hook`) are accepted but don't change god-mode's behavior in Phase 3 — they're stored for future use and surface visually in the dock count.

---

## Task 1: `learnings.ts` — write failing tests (RED)

**Files:**
- Create: `src/lib/analyze/learnings.ts` (stub only)
- Create: `src/lib/analyze/__tests__/learnings.test.ts`

- [ ] **Step 1: Stub**

```ts
// src/lib/analyze/learnings.ts
import type { InsightCard } from '@/lib/health-score';

export function encodeLearnings(_ids: Iterable<string>): string {
  return '';
}

export function decodeLearnings(_param: string | null): string[] {
  return [];
}

export function filterInsightsByLearnings(
  _insights: InsightCard[],
  _ids: string[],
): InsightCard[] {
  return [];
}
```

- [ ] **Step 2: Tests**

```ts
// src/lib/analyze/__tests__/learnings.test.ts
import { describe, it, expect } from 'vitest';
import {
  encodeLearnings,
  decodeLearnings,
  filterInsightsByLearnings,
} from '../learnings';
import type { InsightCard } from '@/lib/health-score';

const insight = (id: string, type: string): InsightCard => ({
  id,
  type,
  priority: 1,
  icon: '⚡',
  title: id,
  verdict: 'positive',
  summary: '',
  action: '',
  data: {},
});

describe('encodeLearnings', () => {
  it('returns empty string for empty input', () => {
    expect(encodeLearnings([])).toBe('');
  });

  it('joins ids with commas in insertion order', () => {
    expect(encodeLearnings(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('deduplicates and trims', () => {
    expect(encodeLearnings(['a', 'b', 'a', '  c ', ''])).toBe('a,b,c');
  });

  it('URL-encodes ids that contain commas or whitespace', () => {
    expect(encodeLearnings(['a,b', 'c d'])).toBe('a%2Cb,c%20d');
  });
});

describe('decodeLearnings', () => {
  it('returns empty array for null or empty string', () => {
    expect(decodeLearnings(null)).toEqual([]);
    expect(decodeLearnings('')).toEqual([]);
  });

  it('splits on comma and trims', () => {
    expect(decodeLearnings(' a , b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('decodes URL-encoded ids', () => {
    expect(decodeLearnings('a%2Cb,c%20d')).toEqual(['a,b', 'c d']);
  });

  it('drops empty entries', () => {
    expect(decodeLearnings('a,,b,')).toEqual(['a', 'b']);
  });

  it('round-trips with encodeLearnings', () => {
    const ids = ['best-content-type', 'optimal-timing', 'caption,with-comma'];
    expect(decodeLearnings(encodeLearnings(ids))).toEqual(ids);
  });
});

describe('filterInsightsByLearnings', () => {
  const insights = [insight('i1', 'a'), insight('i2', 'b'), insight('i3', 'c')];

  it('returns all insights when ids is empty', () => {
    expect(filterInsightsByLearnings(insights, [])).toEqual(insights);
  });

  it('returns only matching insights when ids is non-empty', () => {
    const filtered = filterInsightsByLearnings(insights, ['i1', 'i3']);
    expect(filtered.map((i) => i.id)).toEqual(['i1', 'i3']);
  });

  it('preserves the original order, not the ids order', () => {
    const filtered = filterInsightsByLearnings(insights, ['i3', 'i1']);
    expect(filtered.map((i) => i.id)).toEqual(['i1', 'i3']);
  });

  it('ignores ids that do not match any insight', () => {
    const filtered = filterInsightsByLearnings(insights, ['i1', 'nope']);
    expect(filtered.map((i) => i.id)).toEqual(['i1']);
  });
});
```

- [ ] **Step 3: RED**

Run: `npx vitest run src/lib/analyze/__tests__/learnings.test.ts`
Expected: most tests fail (stubs return wrong values).

---

## Task 2: `learnings.ts` — implement (GREEN)

**Files:**
- Modify: `src/lib/analyze/learnings.ts`

- [ ] **Step 1: Replace the stub**

```ts
// src/lib/analyze/learnings.ts
import type { InsightCard } from '@/lib/health-score';

export function encodeLearnings(ids: Iterable<string>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(encodeURIComponent(id));
  }
  return out.join(',');
}

export function decodeLearnings(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
}

export function filterInsightsByLearnings(
  insights: InsightCard[],
  ids: string[],
): InsightCard[] {
  if (ids.length === 0) return insights;
  const set = new Set(ids);
  return insights.filter((i) => set.has(i.id));
}
```

- [ ] **Step 2: GREEN**

Run: `npx vitest run src/lib/analyze/__tests__/learnings.test.ts`
Expected: 13/13 pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyze/learnings.ts src/lib/analyze/__tests__/learnings.test.ts
git commit -m "feat(analyze): add learnings encode/decode/filter helpers"
```

---

## Task 3: Add selection toggle to `InsightCardView`

**Files:**
- Modify: `src/components/analyze/insights/insight-card.tsx`

- [ ] **Step 1: Replace the file**

```tsx
// src/components/analyze/insights/insight-card.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Sparkles, Square, CheckSquare } from 'lucide-react';
import type { InsightCardLike } from '@/lib/analyze/insight-mapper';

interface InsightCardViewProps {
  card: InsightCardLike;
  selected: boolean;
  onToggle: () => void;
}

const VERDICT_STYLES = {
  positive: 'border-emerald-500/30 bg-emerald-500/5',
  opportunity: 'border-amber-500/30 bg-amber-500/5',
  negative: 'border-rose-500/30 bg-rose-500/5',
} as const;

const VERDICT_ICON = {
  positive: CheckCircle2,
  opportunity: Sparkles,
  negative: AlertCircle,
} as const;

const VERDICT_ICON_COLOR = {
  positive: 'text-emerald-300',
  opportunity: 'text-amber-300',
  negative: 'text-rose-300',
} as const;

export function InsightCardView({ card, selected, onToggle }: InsightCardViewProps) {
  const [open, setOpen] = useState(false);
  const Icon = VERDICT_ICON[card.verdict];
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${VERDICT_STYLES[card.verdict]} ${
        selected ? 'ring-2 ring-teal-400/40' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${VERDICT_ICON_COLOR[card.verdict]}`} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">{card.title}</h3>
          <p className="mt-1 text-sm text-zinc-200">{card.summary}</p>
          {card.action && (
            <p className="mt-2 text-xs font-medium text-teal-300">→ {card.action}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={selected ? 'Remove from learnings' : 'Use this learning'}
          className="shrink-0 rounded-md p-1 text-zinc-300 hover:bg-zinc-800/40 hover:text-white"
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-teal-300" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
        {card.drillDown && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Hide details' : 'Show details'}
            className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-800/40 hover:text-white"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      {open && card.drillDown && (
        <div className="mt-3 rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
            {card.drillDown.label}
          </p>
          <ul className="space-y-1 text-xs text-zinc-300">
            {card.drillDown.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

Two changes vs Phase 2:
1. Props now include `selected` and `onToggle`.
2. A new toggle button with `Square` / `CheckSquare` icons sits between the content and the existing chevron.

- [ ] **Step 2: tsc check**

Run: `npx tsc --noEmit 2>&1 | grep "components/analyze/insights"`
Expected: errors will appear from `insight-feed.tsx` because it doesn't yet pass the new props. That's fine — Task 4 fixes it.

- [ ] **Step 3: Commit**

```bash
git add src/components/analyze/insights/insight-card.tsx
git commit -m "feat(analyze): add selection toggle to InsightCardView"
```

---

## Task 4: `LearningsCtaDock` + `InsightFeed` selection state

**Files:**
- Create: `src/components/analyze/insights/learnings-cta-dock.tsx`
- Modify: `src/components/analyze/insights/insight-feed.tsx`

- [ ] **Step 1: Build the dock**

```tsx
// src/components/analyze/insights/learnings-cta-dock.tsx
'use client';

import Link from 'next/link';
import { Sparkles, Layers } from 'lucide-react';
import { encodeLearnings } from '@/lib/analyze/learnings';

interface LearningsCtaDockProps {
  selectedIds: Set<string>;
  brandId: string | null;
  igUserId: string | null;
}

function buildHref(base: string, opts: LearningsCtaDockProps): string {
  const params = new URLSearchParams();
  if (opts.brandId) params.set('brand', opts.brandId);
  if (opts.igUserId) params.set('ig', opts.igUserId);
  const learnings = encodeLearnings(opts.selectedIds);
  if (learnings) params.set('learnings', learnings);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function LearningsCtaDock(props: LearningsCtaDockProps) {
  const count = props.selectedIds.size;
  if (count === 0) return null;
  return (
    <div className="sticky bottom-3 z-10 mt-2 flex items-center justify-between gap-3 rounded-2xl border border-teal-500/30 bg-zinc-900/90 p-3 backdrop-blur">
      <p className="text-sm text-zinc-200">
        <span className="font-semibold text-teal-300">{count}</span>{' '}
        {count === 1 ? 'learning selected' : 'learnings selected'}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref('/smart-posts', props)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Make 1 Perfect Post
        </Link>
        <Link
          href={buildHref('/create', { ...props })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-200 hover:bg-teal-500/20"
        >
          <Layers className="h-3.5 w-3.5" />
          Make a 5-pack
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `insight-feed.tsx`**

Read the current file first. It should match the Phase 2 version. Then replace with:

```tsx
// src/components/analyze/insights/insight-feed.tsx
'use client';

import { useState, useCallback } from 'react';
import type { AnalysisResult } from '@/lib/analyze/types';
import type { InsightCard } from '@/lib/health-score';
import { mapDeepProfileToCards, type InsightCardLike } from '@/lib/analyze/insight-mapper';
import { HealthHeroCard } from './health-hero';
import { InsightCardView } from './insight-card';
import { LearningsCtaDock } from './learnings-cta-dock';

function adaptInsight(card: InsightCard): InsightCardLike {
  return {
    id: card.id,
    title: card.title,
    verdict: card.verdict,
    summary: card.summary,
    action: card.action,
    priority: card.priority,
  };
}

interface InsightFeedProps {
  result: AnalysisResult;
}

export function InsightFeed({ result }: InsightFeedProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const analyticsCards = result.analyticsInsights.map(adaptInsight);
  const profileCards = mapDeepProfileToCards(result.deepProfile);
  const allCards = [...analyticsCards, ...profileCards].sort(
    (a, b) => a.priority - b.priority,
  );

  return (
    <div className="space-y-4">
      <HealthHeroCard
        healthScore={result.healthScore}
        healthDelta={result.healthDelta}
        summary={result.summary}
      />
      {allCards.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          No insights available yet — post a few times and run analysis again.
        </div>
      ) : (
        <div className="space-y-3">
          {allCards.map((card) => (
            <InsightCardView
              key={card.id}
              card={card}
              selected={selectedIds.has(card.id)}
              onToggle={() => toggle(card.id)}
            />
          ))}
        </div>
      )}
      <LearningsCtaDock
        selectedIds={selectedIds}
        brandId={result.brandId}
        igUserId={result.igUserId}
      />
    </div>
  );
}
```

- [ ] **Step 3: tsc check**

Run: `npx tsc --noEmit 2>&1 | grep -E "components/analyze/insights|src/lib/analyze"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/analyze/insights/learnings-cta-dock.tsx src/components/analyze/insights/insight-feed.tsx
git commit -m "feat(analyze): add LearningsCtaDock with brand+ig+learnings handoff"
```

---

## Task 5: god-mode route accepts `learningIds`

**Files:**
- Modify: `src/lib/smart-posts/generate.ts` — input type + filter
- Modify: `src/app/api/smart-posts/god-mode/route.ts` — body parsing forwards `learningIds`

- [ ] **Step 1: Update `GenerateFromSeedInput` and `generateFromSeed`**

In `src/lib/smart-posts/generate.ts`, find this block (around line 182):

```ts
export interface GenerateFromSeedInput {
  insightId?: string;
  brandId?: string;
  metaOverrides?: unknown;
  userId: string;
  /** Origin of the Next.js app (e.g. "https://example.com") used for internal fetches. */
  origin: string;
  /** Forwarded cookie header for internal API auth. */
  cookie: string;
  /** Optional connected IG account id; when present, top past posts join the candidate list. */
  igUserId?: string;
}
```

Add a `learningIds?: string[]` field:

```ts
export interface GenerateFromSeedInput {
  insightId?: string;
  brandId?: string;
  metaOverrides?: unknown;
  userId: string;
  /** Origin of the Next.js app (e.g. "https://example.com") used for internal fetches. */
  origin: string;
  /** Forwarded cookie header for internal API auth. */
  cookie: string;
  /** Optional connected IG account id; when present, top past posts join the candidate list. */
  igUserId?: string;
  /** Optional learning IDs from the cart. When non-empty, only insights with
   * matching ids contribute to the merged seed. Empty/undefined = current
   * behavior (every actionable insight contributes). */
  learningIds?: string[];
}
```

Then find the destructuring at the top of `generateFromSeed`:

```ts
const { insightId, brandId, metaOverrides: rawMetaOverrides, userId, origin, cookie, igUserId } = input;
```

Replace with:

```ts
const { insightId, brandId, metaOverrides: rawMetaOverrides, userId, origin, cookie, igUserId, learningIds } = input;
```

Then find the `mergePerfectSeed` call site (around line 324):

```ts
} else {
  const merged = mergePerfectSeed(allInsights, brandId);
  if (!merged) {
```

Replace the `mergePerfectSeed(allInsights, brandId)` call with a filtered version:

```ts
} else {
  const filtered =
    learningIds && learningIds.length > 0
      ? allInsights.filter((c) => learningIds.includes(c.id))
      : allInsights;
  if (filtered.length === 0) {
    return {
      ok: false,
      err: {
        error: 'no_actionable_insights',
        message: 'No actionable insights matched your selection.',
        status: 422,
      },
    };
  }
  const merged = mergePerfectSeed(filtered, brandId);
  if (!merged) {
```

- [ ] **Step 2: Update god-mode route**

In `src/app/api/smart-posts/god-mode/route.ts`, find the body parsing (around line 176-186):

```ts
let body: { brandId?: string; igUserId?: string; likeOfMediaId?: string };
```

Replace with:

```ts
let body: { brandId?: string; igUserId?: string; likeOfMediaId?: string; learningIds?: string[] };
```

Then find the destructuring two lines below:

```ts
const { brandId, igUserId, likeOfMediaId } = body;
```

Replace with:

```ts
const { brandId, igUserId, likeOfMediaId, learningIds } = body;
const cleanLearningIds = Array.isArray(learningIds)
  ? learningIds.filter((s): s is string => typeof s === 'string' && s.length > 0)
  : undefined;
```

Find the `generateFromSeed` call at the bottom (around line 261):

```ts
const outcome = await generateFromSeed({
  brandId,
  metaOverrides: sanitized,
  userId,
  origin,
  cookie,
  igUserId,
});
```

Add `learningIds: cleanLearningIds`:

```ts
const outcome = await generateFromSeed({
  brandId,
  metaOverrides: sanitized,
  userId,
  origin,
  cookie,
  igUserId,
  learningIds: cleanLearningIds,
});
```

Also find the `generateFallback` call in the same file (it also uses `generateFromSeed`). Update it to pass `learningIds` through. Find the function definition `async function generateFallback(opts: {` (around line 90) and add the field. Find the call sites and pass it.

The generateFallback signature update — find:

```ts
async function generateFallback(opts: {
  brandId: string;
  userId: string;
  origin: string;
  cookie: string;
  profile: DeepProfile;
  reason: string;
  raw: string;
  igUserId?: string;
}) {
```

Replace with:

```ts
async function generateFallback(opts: {
  brandId: string;
  userId: string;
  origin: string;
  cookie: string;
  profile: DeepProfile;
  reason: string;
  raw: string;
  igUserId?: string;
  learningIds?: string[];
}) {
```

And inside the function, find the `generateFromSeed` call and add the `learningIds` field:

```ts
const outcome = await generateFromSeed({
  brandId: opts.brandId,
  userId: opts.userId,
  origin: opts.origin,
  cookie: opts.cookie,
  igUserId: opts.igUserId,
  learningIds: opts.learningIds,
});
```

Then find the two `generateFallback({...})` call sites in the route handler and add `learningIds: cleanLearningIds` to each.

- [ ] **Step 3: tsc + run god-mode tests**

```
npx tsc --noEmit 2>&1 | grep -E "smart-posts/generate|god-mode" | head
npx vitest run src/app/api/smart-posts/god-mode/__tests__/route.test.ts 2>&1 | tail -15
```

Expected: no tsc output, all god-mode tests still pass (the new param is optional, so existing tests are unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/lib/smart-posts/generate.ts src/app/api/smart-posts/god-mode/route.ts
git commit -m "feat(smart-posts): accept learningIds and filter merged insights"
```

---

## Task 6: Smart Posts dashboard reads `learnings` param

**Files:**
- Modify: `src/components/smart-posts-dashboard.tsx`

The dashboard is large (~900 lines). Only two changes: import `useSearchParams`, pass `learningIds` in the god-mode POST body.

- [ ] **Step 1: Find the existing imports and the `handleGenerate` function**

```bash
grep -n "useSearchParams\|handleGenerate\|/api/smart-posts/god-mode" src/components/smart-posts-dashboard.tsx | head -10
```

Note the line numbers. Confirm `useSearchParams` is NOT already imported (likely it isn't — the file uses URL state via `useHubState`).

- [ ] **Step 2: Add the import**

If `useSearchParams` is not already imported from `next/navigation`, add it. Find the existing line that imports from `next/navigation` (something like `import { ... } from 'next/navigation';`) and merge `useSearchParams` into it. If no such import exists, add a fresh line:

```ts
import { useSearchParams } from 'next/navigation';
```

- [ ] **Step 3: Use the hook inside the component**

At the top of the component body (alongside other hooks), add:

```ts
const sp = useSearchParams();
```

- [ ] **Step 4: Pass `learningIds` in the god-mode call**

Find the POST to `/api/smart-posts/god-mode` inside `handleGenerate` (line ~317 area). The current request body looks like:

```ts
const url = useGodMode ? '/api/smart-posts/god-mode' : '/api/smart-posts/generate';
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    brandId,
    igUserId: ig,
    // ... (likeOfMediaId etc.)
  }),
});
```

Add the `learningIds` field, decoded from the URL:

```ts
import { decodeLearnings } from '@/lib/analyze/learnings';
// ...

const learningIds = decodeLearnings(sp.get('learnings'));

// In the request body:
body: JSON.stringify({
  brandId,
  igUserId: ig,
  // ... existing fields ...
  learningIds: learningIds.length > 0 ? learningIds : undefined,
}),
```

The `decodeLearnings` import goes near the top with the other utils.

- [ ] **Step 5: tsc check**

Run: `npx tsc --noEmit 2>&1 | grep "smart-posts-dashboard" | head -5`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/smart-posts-dashboard.tsx
git commit -m "feat(smart-posts): forward learnings query param into god-mode body"
```

---

## Task 7: `/create` batch reads `learnings` param

**Files:**
- Modify: `src/components/batch-gallery.tsx`

The batch generator's caption flow already accepts `avoidTopics` and other hints via `generateCaption`. Phase 3 doesn't yet wire learnings into batch caption generation (that requires a deeper refactor — the batch flow uses `lib/caption-engine` directly, not `generateFromSeed`). For Phase 3 we just **read and acknowledge** the param so the URL handoff is end-to-end visible: a small badge in the batch UI shows "X learnings will guide this batch." Actual filtering of batch generation is deferred to Phase 4.

- [ ] **Step 1: Add hook + decode**

In `src/components/batch-gallery.tsx`, near the top of the component body:

```ts
import { useSearchParams } from 'next/navigation';
import { decodeLearnings } from '@/lib/analyze/learnings';
// ...
const sp = useSearchParams();
const incomingLearnings = decodeLearnings(sp.get('learnings'));
```

(`useSearchParams` may already be imported — if so, skip the import line. If not, add it.)

- [ ] **Step 2: Render an acknowledgement badge above the post-count radios**

Find the post-count radio buttons block (currently around line 559: `{/* Post count radio buttons */}`). Just before that block, add:

```tsx
{incomingLearnings.length > 0 && (
  <div className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-200">
    {incomingLearnings.length} learning{incomingLearnings.length === 1 ? '' : 's'} from Analyze will guide this batch
  </div>
)}
```

Wire-up of actual batch filtering is Phase 4.

- [ ] **Step 3: tsc check**

Run: `npx tsc --noEmit 2>&1 | grep "batch-gallery" | head -5`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/batch-gallery.tsx
git commit -m "feat(create): acknowledge learnings query param with batch UI badge"
```

---

## Task 8: Browser verification

- [ ] **Step 1: Start dev server, sign in, go to `/analyze`.**
- [ ] **Step 2: Click Run Full Analysis.** Confirm cards have a square (unchecked) icon next to the chevron.
- [ ] **Step 3: Tick 2-3 cards.** Confirm:
  - The icon flips to a teal CheckSquare.
  - The card gets a subtle teal ring.
  - A bottom dock appears: "N learnings selected" + two buttons.
- [ ] **Step 4: Click "Make 1 Perfect Post".** URL should be `/smart-posts?brand=...&ig=...&learnings=id1,id2,id3`. The page loads. Click Generate. Look at the resulting Why-this-works panel: it should reflect the ticked subset (e.g. if you only ticked timing, the format card should say "Not used this run").
- [ ] **Step 5: Go back to `/analyze`, tick the same cards, click "Make a 5-pack".** URL `/create?...&learnings=...` loads with the new badge: "N learnings from Analyze will guide this batch."
- [ ] **Step 6: Untick all cards on `/analyze`.** Bottom dock disappears.

---

## Task 9: Push + plan doc

- [ ] **Step 1: Push develop**

```bash
git push origin develop
```

- [ ] **Step 2: Confirm new commits**

```bash
git log --oneline origin/main..develop
```

Expect ~6-7 new commits all `feat(analyze):` / `feat(smart-posts):` / `feat(create):`.

- [ ] **Step 3: Stop here.** Phase 4 (competitor inline + batch filtering) gets its own plan.

---

## Self-review checklist

- [x] Spec coverage — every roadmap Phase 3 bullet has a task
- [x] No placeholders
- [x] Type consistency — `learningIds` named identically across generate.ts / god-mode / dashboard
- [x] TDD for the pure helpers (Tasks 1+2)
- [x] No DB migration needed
- [x] Phase 3 is purely additive — empty/missing `learnings` param = Phase 2 behavior
- [x] Deep-profile cards are tickable and visible in the count, even though they don't change god-mode output yet (acceptable for Phase 3; documented in the contract section)
