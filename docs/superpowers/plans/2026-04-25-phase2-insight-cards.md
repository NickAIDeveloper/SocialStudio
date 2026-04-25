# Phase 2: Insight-First Card Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the data-table-heavy You-tab with a stacked feed of insight cards fed by Phase 1's `AnalysisResult`. Each card surfaces one finding with a verdict color, headline, the action to take, and an optional drill-down pane. Health score + delta becomes a hero card at the top.

**Architecture:** Phase 2 is purely additive to the live `/analyze` page — the existing tabs and `PerformancePage` stay below the new feed for now (Phase 4 removes them). The feed reads `AnalysisResult` from Phase 1's `useAnalysis` hook via callback and renders three card kinds: hero, analytics insight, deep-profile sub-card. The components have no business logic of their own — they're presentational and consume data only.

**Tech stack:** React 18 client components, Tailwind, lucide-react. No charting lib added in this phase — small visual cues come from native CSS / inline SVG.

**Source map (read these before starting):**
- `src/lib/analyze/types.ts` — `AnalysisResult`, fields the feed consumes
- `src/lib/health-score.ts` — `InsightCard` shape (`title`, `verdict`, `summary`, `action`, `data`, `priority`, `type`)
- `src/lib/meta/deep-profile.types.ts` — `DeepProfile` shape
- `src/components/analyze/run-analysis-button.tsx` — already exposes `onComplete(result)`; the feed hooks into that
- `src/components/analyze/analyze-page.tsx` — where the feed mounts
- `src/components/smart-posts-dashboard.tsx` — existing pattern for verdict-tagged cards (`VERDICT_STYLES`); we reuse the same color treatment

---

## File structure

**Create:**
- `src/components/analyze/insights/health-hero.tsx` — score + delta + summary card
- `src/components/analyze/insights/insight-card.tsx` — generic verdict-tagged card with drill-down chevron
- `src/components/analyze/insights/deep-profile-cards.tsx` — exports a function that returns insight cards built from `DeepProfile` (best format, sweet spot, top slot, top hook)
- `src/components/analyze/insights/insight-feed.tsx` — orchestrator that renders the above stacks, given an `AnalysisResult`
- `src/lib/analyze/__tests__/insight-mapper.test.ts` — unit tests for the deep-profile-card builder
- `src/lib/analyze/insight-mapper.ts` — pure function: `(profile: DeepProfile | null) => InsightCardLike[]`

**Modify:**
- `src/components/analyze/run-analysis-button.tsx` — add internal state lifting so parent can read latest result (or alternatively: parent owns the result via callback)
- `src/components/analyze/analyze-page.tsx` — own the `AnalysisResult` state, render `InsightFeed` between `RunAnalysisButton` and the tabs

No deletions. The existing tabs and PerformancePage stay (Phase 4 prunes them).

---

## Decoupling strategy

The feed must not depend on the orchestrator's internal step-status types. It reads only the data fields from `AnalysisResult`. The mapper from `DeepProfile` to display cards lives in `src/lib/analyze/insight-mapper.ts` so it's testable without rendering anything.

The display contract:

```ts
interface InsightCardLike {
  id: string;
  title: string;
  verdict: 'positive' | 'negative' | 'opportunity';
  summary: string;
  action?: string;
  priority: number; // lower = higher
  drillDown?: { label: string; lines: string[] };
}
```

`InsightCard` (from `health-score.ts`) ALREADY satisfies most of this — `title`, `verdict`, `summary`, `action`, `priority` are the same. We only need the mapper for the deep-profile section, which doesn't use `InsightCard`.

---

## Task 1: Define `InsightCardLike` + write deep-profile mapper tests (RED)

**Files:**
- Create: `src/lib/analyze/insight-mapper.ts` (stub only — empty `mapDeepProfileToCards` export)
- Create: `src/lib/analyze/__tests__/insight-mapper.test.ts`

- [ ] **Step 1: Create the empty mapper stub**

```ts
// src/lib/analyze/insight-mapper.ts
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export interface InsightCardLike {
  id: string;
  title: string;
  verdict: 'positive' | 'negative' | 'opportunity';
  summary: string;
  action?: string;
  priority: number;
  drillDown?: { label: string; lines: string[] };
}

export function mapDeepProfileToCards(_profile: DeepProfile | null): InsightCardLike[] {
  return [];
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/analyze/__tests__/insight-mapper.test.ts
import { describe, it, expect } from 'vitest';
import { mapDeepProfileToCards } from '../insight-mapper';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

const baseProfile: DeepProfile = {
  handle: 'me',
  followerCount: 1000,
  sampleSize: 12,
  medians: { reach: 100, views: 200, likes: 10, comments: 1, saves: 0, shares: 0 },
  formatPerformance: [
    { format: 'REEL', count: 5, medianReach: 230, medianSaves: 4, medianShares: 2, liftVsOverall: 2.3 },
    { format: 'IMAGE', count: 5, medianReach: 80, medianSaves: 1, medianShares: 0, liftVsOverall: 0.8 },
    { format: 'CAROUSEL', count: 2, medianReach: 100, medianSaves: 2, medianShares: 1, liftVsOverall: 1.0 },
  ],
  captionLengthSweetSpot: { shortMedian: 50, mediumMedian: 200, longMedian: 80, winner: 'medium' },
  hookPatterns: [
    { pattern: 'Question hook', avgReach: 240, occurrences: 4, exampleCaptions: ['Why is your...'] },
    { pattern: 'Stat hook', avgReach: 180, occurrences: 3, exampleCaptions: ['9 out of 10...'] },
  ],
  topicSignals: { winning: ['running'], losing: ['tech'] },
  timing: {
    bestSlots: [{ day: 2, hour: 9, medianEngagement: 50 }],
  },
  audience: null,
};

describe('mapDeepProfileToCards', () => {
  it('returns empty array when profile is null', () => {
    expect(mapDeepProfileToCards(null)).toEqual([]);
  });

  it('builds a best-format card from the highest liftVsOverall format', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const formatCard = cards.find((c) => c.id === 'best-format');
    expect(formatCard).toBeTruthy();
    expect(formatCard?.title).toContain('REEL');
    expect(formatCard?.verdict).toBe('positive');
    expect(formatCard?.summary).toContain('2.3');
  });

  it('builds a caption-length card naming the winner', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const lenCard = cards.find((c) => c.id === 'caption-length-sweet-spot');
    expect(lenCard).toBeTruthy();
    expect(lenCard?.title.toLowerCase()).toContain('medium');
  });

  it('builds a top-slot card from the first bestSlot', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const slotCard = cards.find((c) => c.id === 'best-time-slot');
    expect(slotCard).toBeTruthy();
    expect(slotCard?.title.toLowerCase()).toMatch(/tuesday|9/);
  });

  it('builds a top-hook card from hookPatterns[0]', () => {
    const cards = mapDeepProfileToCards(baseProfile);
    const hookCard = cards.find((c) => c.id === 'top-hook');
    expect(hookCard).toBeTruthy();
    expect(hookCard?.summary).toContain('Question hook');
  });

  it('skips cards when source data is missing', () => {
    const stripped: DeepProfile = {
      ...baseProfile,
      formatPerformance: [],
      hookPatterns: [],
      timing: { bestSlots: [] },
    };
    const cards = mapDeepProfileToCards(stripped);
    expect(cards.find((c) => c.id === 'best-format')).toBeUndefined();
    expect(cards.find((c) => c.id === 'top-hook')).toBeUndefined();
    expect(cards.find((c) => c.id === 'best-time-slot')).toBeUndefined();
    // caption-length card still appears since the field is always present
    expect(cards.find((c) => c.id === 'caption-length-sweet-spot')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run vitest, verify the tests fail (mapper returns empty array → multiple expect failures)**

Run: `npx vitest run src/lib/analyze/__tests__/insight-mapper.test.ts`
Expected: FAIL — 4 of 6 tests fail (the two empty-array cases pass, the 4 content-checking cases fail).

---

## Task 2: Implement `mapDeepProfileToCards` (GREEN)

**Files:**
- Modify: `src/lib/analyze/insight-mapper.ts`

- [ ] **Step 1: Replace the stub with the real implementation**

```ts
// src/lib/analyze/insight-mapper.ts
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export interface InsightCardLike {
  id: string;
  title: string;
  verdict: 'positive' | 'negative' | 'opportunity';
  summary: string;
  action?: string;
  priority: number;
  drillDown?: { label: string; lines: string[] };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export function mapDeepProfileToCards(profile: DeepProfile | null): InsightCardLike[] {
  if (!profile) return [];
  const cards: InsightCardLike[] = [];

  // Best format
  const topFormat = [...profile.formatPerformance]
    .filter((f) => f.count > 0)
    .sort((a, b) => b.liftVsOverall - a.liftVsOverall)[0];
  if (topFormat) {
    const lift = topFormat.liftVsOverall.toFixed(1);
    cards.push({
      id: 'best-format',
      title: `${topFormat.format} is your strongest format`,
      verdict: topFormat.liftVsOverall >= 1 ? 'positive' : 'opportunity',
      summary: `${topFormat.format} posts get ${lift}× your overall median reach across ${topFormat.count} samples.`,
      action: `Make more ${topFormat.format.toLowerCase()}s.`,
      priority: 2,
      drillDown: {
        label: 'Format breakdown',
        lines: profile.formatPerformance.map(
          (f) => `${f.format}: ${f.count} posts, ${f.liftVsOverall.toFixed(2)}× lift, median reach ${f.medianReach}`,
        ),
      },
    });
  }

  // Caption length sweet spot
  const len = profile.captionLengthSweetSpot;
  cards.push({
    id: 'caption-length-sweet-spot',
    title: `${len.winner.charAt(0).toUpperCase() + len.winner.slice(1)} captions win for you`,
    verdict: 'opportunity',
    summary: `Your ${len.winner} captions have the highest median reach. Short: ${len.shortMedian}, medium: ${len.mediumMedian}, long: ${len.longMedian}.`,
    action: `Default to ${len.winner}-length captions on the next post.`,
    priority: 3,
  });

  // Best time slot
  const topSlot = profile.timing.bestSlots[0];
  if (topSlot) {
    cards.push({
      id: 'best-time-slot',
      title: `${DAY_NAMES[topSlot.day]} ${formatHour(topSlot.hour)} is your peak`,
      verdict: 'positive',
      summary: `Posts in this slot have median engagement ${topSlot.medianEngagement}. That's your strongest window.`,
      action: 'Schedule next post here.',
      priority: 2,
      drillDown:
        profile.timing.bestSlots.length > 1
          ? {
              label: 'Other strong slots',
              lines: profile.timing.bestSlots
                .slice(1, 5)
                .map((s) => `${DAY_NAMES[s.day]} ${formatHour(s.hour)} → engagement ${s.medianEngagement}`),
            }
          : undefined,
    });
  }

  // Top hook pattern
  const topHook = profile.hookPatterns[0];
  if (topHook) {
    cards.push({
      id: 'top-hook',
      title: `Hook pattern that wins: ${topHook.pattern}`,
      verdict: 'positive',
      summary: `${topHook.pattern} hooks get average reach ${Math.round(topHook.avgReach)} across ${topHook.occurrences} posts.`,
      action: 'Open Smart Posts and seed a new post with this hook.',
      priority: 3,
      drillDown:
        topHook.exampleCaptions.length > 0
          ? {
              label: 'Examples',
              lines: topHook.exampleCaptions.slice(0, 3),
            }
          : undefined,
    });
  }

  return cards;
}
```

- [ ] **Step 2: Run tests and verify they pass**

Run: `npx vitest run src/lib/analyze/__tests__/insight-mapper.test.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyze/insight-mapper.ts src/lib/analyze/__tests__/insight-mapper.test.ts
git commit -m "feat(analyze): add deep-profile-to-card mapper for insight feed"
```

---

## Task 3: `HealthHeroCard` component

**Files:**
- Create: `src/components/analyze/insights/health-hero.tsx`

- [ ] **Step 1: Build the component**

```tsx
// src/components/analyze/insights/health-hero.tsx
'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HealthHeroProps {
  healthScore: number | null;
  healthDelta: number | null;
  summary: string | null;
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-zinc-300';
  if (score >= 70) return 'text-emerald-300';
  if (score >= 40) return 'text-amber-300';
  return 'text-rose-300';
}

function deltaColor(delta: number | null): string {
  if (delta === null || delta === 0) return 'text-zinc-400';
  return delta > 0 ? 'text-emerald-400' : 'text-rose-400';
}

function DeltaIcon({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return <Minus className="h-3.5 w-3.5" />;
  return delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />;
}

export function HealthHeroCard({ healthScore, healthDelta, summary }: HealthHeroProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-6">
      <div className="flex items-baseline gap-3">
        <span className={`text-5xl font-bold tracking-tight ${scoreColor(healthScore)}`}>
          {healthScore ?? '—'}
        </span>
        <span className="text-sm text-zinc-400">/ 100 health</span>
        {healthDelta !== null && (
          <span
            className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${deltaColor(healthDelta)}`}
            title="vs last week"
          >
            <DeltaIcon delta={healthDelta} />
            {healthDelta > 0 ? '+' : ''}
            {healthDelta} vs last week
          </span>
        )}
      </div>
      {summary && <p className="mt-3 text-sm text-zinc-200">{summary}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "components/analyze/insights"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/analyze/insights/health-hero.tsx
git commit -m "feat(analyze): add HealthHeroCard component"
```

---

## Task 4: Generic `InsightCardView` component

**Files:**
- Create: `src/components/analyze/insights/insight-card.tsx`

- [ ] **Step 1: Build the component**

```tsx
// src/components/analyze/insights/insight-card.tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import type { InsightCardLike } from '@/lib/analyze/insight-mapper';

interface InsightCardViewProps {
  card: InsightCardLike;
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

export function InsightCardView({ card }: InsightCardViewProps) {
  const [open, setOpen] = useState(false);
  const Icon = VERDICT_ICON[card.verdict];
  return (
    <div className={`rounded-xl border p-4 ${VERDICT_STYLES[card.verdict]}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${VERDICT_ICON_COLOR[card.verdict]}`} />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">{card.title}</h3>
          <p className="mt-1 text-sm text-zinc-200">{card.summary}</p>
          {card.action && (
            <p className="mt-2 text-xs font-medium text-teal-300">→ {card.action}</p>
          )}
        </div>
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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "components/analyze/insights"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/analyze/insights/insight-card.tsx
git commit -m "feat(analyze): add InsightCardView with verdict styling and drill-down"
```

---

## Task 5: `InsightFeed` orchestrator + bridge from Phase 1 InsightCard to InsightCardLike

**Files:**
- Create: `src/components/analyze/insights/insight-feed.tsx`

The feed converts each `InsightCard` (from `health-score.ts`) into the display contract `InsightCardLike` and stitches together the analytics insights with the deep-profile cards.

- [ ] **Step 1: Build the feed**

```tsx
// src/components/analyze/insights/insight-feed.tsx
'use client';

import type { AnalysisResult } from '@/lib/analyze/types';
import type { InsightCard } from '@/lib/health-score';
import { mapDeepProfileToCards, type InsightCardLike } from '@/lib/analyze/insight-mapper';
import { HealthHeroCard } from './health-hero';
import { InsightCardView } from './insight-card';

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
            <InsightCardView key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "components/analyze/insights\|src/lib/analyze"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/analyze/insights/insight-feed.tsx
git commit -m "feat(analyze): add InsightFeed combining hero, analytics, and deep-profile cards"
```

---

## Task 6: Wire feed into `AnalyzePage` via state lifting

**Files:**
- Modify: `src/components/analyze/analyze-page.tsx`

The `RunAnalysisButton` already accepts an `onComplete` prop. The page now uses it to capture the result and conditionally render the feed.

- [ ] **Step 1: Read the current file**

Confirm `src/components/analyze/analyze-page.tsx` currently looks like this:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';
import { RunAnalysisButton } from './run-analysis-button';

export function AnalyzePage() {
  const searchParams = useSearchParams();
  const tab = readTab(searchParams);
  const brandId = searchParams.get('brand');
  const igUserId = searchParams.get('ig');

  return (
    <div className="space-y-6">
      <RunAnalysisButton brandId={brandId} igUserId={igUserId} />
      <AnalyzeTabs />
      {tab === 'you' && <PerformancePage />}
      {tab === 'competitors' && <CompetitorDashboard />}
      {tab === 'compare' && <CompareSection />}
    </div>
  );
}
```

If different, STOP and ask.

- [ ] **Step 2: Replace the file**

```tsx
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';
import { RunAnalysisButton } from './run-analysis-button';
import { InsightFeed } from './insights/insight-feed';
import type { AnalysisResult } from '@/lib/analyze/types';

export function AnalyzePage() {
  const searchParams = useSearchParams();
  const tab = readTab(searchParams);
  const brandId = searchParams.get('brand');
  const igUserId = searchParams.get('ig');
  const [latest, setLatest] = useState<AnalysisResult | null>(null);

  return (
    <div className="space-y-6">
      <RunAnalysisButton
        brandId={brandId}
        igUserId={igUserId}
        onComplete={(r) => setLatest(r)}
      />
      {latest && <InsightFeed result={latest} />}
      <details className="group rounded-xl border border-zinc-800/60 bg-zinc-900/30">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
          Detailed views (legacy)
        </summary>
        <div className="space-y-6 p-4">
          <AnalyzeTabs />
          {tab === 'you' && <PerformancePage />}
          {tab === 'competitors' && <CompetitorDashboard />}
          {tab === 'compare' && <CompareSection />}
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 3: Run the existing analyze-tabs test (sanity)**

Run: `npx vitest run src/components/analyze/__tests__/analyze-tabs.test.tsx`
Expected: PASS — 4 tests still pass.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit 2>&1 | grep -E "analyze|insights"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/analyze/analyze-page.tsx
git commit -m "feat(analyze): mount InsightFeed and tuck legacy tabs under Detailed views"
```

---

## Task 7: Browser verification

- [ ] **Step 1: Start dev server**

Kill any existing Next dev process for this codebase, then `npm run dev`.

- [ ] **Step 2: Navigate to `/analyze`**

Expected: see the Run Full Analysis card, then a collapsed "Detailed views (legacy)" section. No InsightFeed yet (no result).

- [ ] **Step 3: Click Run Full Analysis**

Expected: step strip animates → on success, an InsightFeed appears between the button and the Detailed views accordion. Should contain:
- A health hero card with the score in green/amber/red, the delta vs last week, and the summary
- One card per analytics insight (sorted by priority)
- One card each for best format / caption sweet spot / best time slot / top hook (only those backed by deep-profile data)

- [ ] **Step 4: Click a drill-down chevron on a card with extra data**

Expected: the panel expands to show the detail lines (e.g. for best-format, the format breakdown). Click again to collapse.

- [ ] **Step 5: Open the "Detailed views (legacy)" expander**

Expected: existing You/Competitors/Compare tabs and dashboards still render. No regression.

- [ ] **Step 6: No commit needed.**

---

## Task 8: Push develop, summary

- [ ] **Step 1: Push**

```bash
git push origin develop
```

- [ ] **Step 2: Confirm new commits**

Run: `git log --oneline origin/main..develop`
Expected: 6 new `feat(analyze):` commits from this phase.

- [ ] **Step 3: Stop here.**

Phase 3 (learnings cart) writes its own plan when we reach it.

---

## Self-review checklist

- [x] Spec coverage — every bullet in the roadmap Phase 2 description has a task.
- [x] No placeholders — every code block is complete.
- [x] Type consistency — `InsightCardLike` matches across mapper, card, and feed.
- [x] Tests run before implementation in TDD task (RED → GREEN).
- [x] Phase 2 is purely additive — old tabs are tucked under an expander, not deleted.
- [x] Commits are scoped per task with `feat(analyze):` prefix.
