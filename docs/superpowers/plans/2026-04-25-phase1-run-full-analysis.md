# Phase 1: Run Full Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single `/api/analyze/run` endpoint and a "Run Full Analysis" button on `/analyze` that orchestrates all existing analysis sources (deep profile, analytics insights, competitor insights, health delta) into one unified `AnalysisResult` payload that subsequent phases will render and consume.

**Architecture:** Pure orchestrator (`runAnalysis`) takes injected dependencies (one per source) so it's unit-testable without HTTP. The route handler wires real fetchers to the orchestrator and forwards user auth. The client uses a `useAnalysis` hook that posts to the route, blocks on the response, and exposes loading/result/error state. UI is a button at the top of `/analyze` that does NOT remove existing dashboards (Phase 2 will).

**Tech stack:** Next.js App Router (route handlers), drizzle-orm, vitest, React 18 client components.

**Source map (read these before starting):**
- `src/app/api/insights/route.ts` — pattern for compute + cache + route shape
- `src/app/api/smart-posts/history/route.ts` — `current/previous/delta` health score
- `src/app/api/meta/deep-profile/route.ts` — `igUserId` deep profile fetch
- `src/lib/health-score.ts` — `InsightCard` type lives here
- `src/lib/meta/deep-profile.types.ts` — `DeepProfile` type lives here
- `src/components/analyze/analyze-page.tsx` — where the button mounts

---

## File structure

**Create:**
- `src/lib/analyze/types.ts` — `AnalysisResult`, `AnalysisStep`, `AnalysisOpts`, `AnalysisDeps`
- `src/lib/analyze/run-analysis.ts` — orchestrator (pure function, dependency-injected)
- `src/lib/analyze/__tests__/run-analysis.test.ts` — orchestrator unit tests
- `src/app/api/analyze/run/route.ts` — POST endpoint wiring real deps
- `src/app/api/analyze/run/__tests__/route.test.ts` — route handler test
- `src/lib/analyze/use-analysis.ts` — React client hook
- `src/components/analyze/run-analysis-button.tsx` — the button + progress strip

**Modify:**
- `src/components/analyze/analyze-page.tsx` — mount the button above the existing tabs

No deletions. Phase 1 is purely additive.

---

## Task 1: Define types

**Files:**
- Create: `src/lib/analyze/types.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/lib/analyze/types.ts
import type { InsightCard } from '@/lib/health-score';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export type AnalysisStepId =
  | 'analytics'
  | 'competitors'
  | 'deep-profile'
  | 'health-delta';

export type AnalysisStepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'skipped'
  | 'error';

export interface AnalysisStep {
  id: AnalysisStepId;
  label: string;
  status: AnalysisStepStatus;
  durationMs?: number;
  error?: string;
}

export interface AnalysisOpts {
  userId: string;
  brandId: string | null;
  igUserId: string | null;
  origin: string;
  cookie: string;
}

export interface AnalysisDeps {
  fetchAnalyticsInsights: (
    brandId: string | null,
  ) => Promise<{
    insights: InsightCard[];
    healthScore: number | null;
    summary: string | null;
  }>;
  fetchCompetitorInsights: () => Promise<{ insights: InsightCard[] }>;
  fetchDeepProfile: (igUserId: string) => Promise<DeepProfile>;
  fetchHealthDelta: (
    brandId: string | null,
  ) => Promise<{ current: number | null; previous: number | null; delta: number | null }>;
}

export interface AnalysisResult {
  generatedAt: string;
  brandId: string | null;
  igUserId: string | null;
  steps: AnalysisStep[];
  healthScore: number | null;
  healthDelta: number | null;
  summary: string | null;
  analyticsInsights: InsightCard[];
  competitorInsights: InsightCard[];
  deepProfile: DeepProfile | null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "src/lib/analyze"`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyze/types.ts
git commit -m "feat(analyze): add AnalysisResult/AnalysisStep types for run-analysis orchestrator"
```

---

## Task 2: Orchestrator — write failing tests (RED)

**Files:**
- Create: `src/lib/analyze/__tests__/run-analysis.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// src/lib/analyze/__tests__/run-analysis.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runAnalysis } from '../run-analysis';
import type { AnalysisDeps } from '../types';
import type { InsightCard } from '@/lib/health-score';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

const baseInsight: InsightCard = {
  id: 'i1',
  priority: 1,
  type: 'best-content-type',
  icon: '⚡',
  title: 'Reels win',
  verdict: 'positive',
  summary: 'Reels get 2.3x more reach',
  action: 'Make more reels',
  data: {},
};

const stubDeps = (overrides: Partial<AnalysisDeps> = {}): AnalysisDeps => ({
  fetchAnalyticsInsights: vi.fn().mockResolvedValue({
    insights: [baseInsight],
    healthScore: 60,
    summary: 'Decent',
  }),
  fetchCompetitorInsights: vi.fn().mockResolvedValue({ insights: [] }),
  fetchDeepProfile: vi.fn().mockResolvedValue({
    handle: 'me',
    sampleSize: 12,
  } as unknown as DeepProfile),
  fetchHealthDelta: vi.fn().mockResolvedValue({ current: 60, previous: 80, delta: -20 }),
  ...overrides,
});

const baseOpts = {
  userId: 'u1',
  brandId: 'b1',
  igUserId: 'ig1',
  origin: 'http://localhost:3000',
  cookie: 'session=x',
};

describe('runAnalysis', () => {
  it('returns combined result with all steps marked success when all deps resolve', async () => {
    const result = await runAnalysis(baseOpts, stubDeps());
    expect(result.healthScore).toBe(60);
    expect(result.healthDelta).toBe(-20);
    expect(result.summary).toBe('Decent');
    expect(result.analyticsInsights).toHaveLength(1);
    expect(result.deepProfile).not.toBeNull();
    expect(result.steps.every((s) => s.status === 'success')).toBe(true);
    expect(result.steps.map((s) => s.id).sort()).toEqual(
      ['analytics', 'competitors', 'deep-profile', 'health-delta'].sort(),
    );
  });

  it('marks deep-profile step as skipped when igUserId is null', async () => {
    const deps = stubDeps();
    const result = await runAnalysis({ ...baseOpts, igUserId: null }, deps);
    expect(result.deepProfile).toBeNull();
    const step = result.steps.find((s) => s.id === 'deep-profile');
    expect(step?.status).toBe('skipped');
    expect(deps.fetchDeepProfile).not.toHaveBeenCalled();
  });

  it('continues on error: one step failure does not break the whole run', async () => {
    const deps = stubDeps({
      fetchCompetitorInsights: vi
        .fn()
        .mockRejectedValue(new Error('competitor service down')),
    });
    const result = await runAnalysis(baseOpts, deps);
    expect(result.healthScore).toBe(60);
    const compStep = result.steps.find((s) => s.id === 'competitors');
    expect(compStep?.status).toBe('error');
    expect(compStep?.error).toContain('competitor service down');
    expect(result.competitorInsights).toEqual([]);
  });

  it('runs the four steps in parallel (combined wall time < sum of step times)', async () => {
    const slow = (ms: number) =>
      vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, ms)));
    const deps: AnalysisDeps = {
      fetchAnalyticsInsights: slow(50).mockResolvedValue({ insights: [], healthScore: 0, summary: '' }),
      fetchCompetitorInsights: slow(50).mockResolvedValue({ insights: [] }),
      fetchDeepProfile: slow(50).mockResolvedValue({} as DeepProfile),
      fetchHealthDelta: slow(50).mockResolvedValue({ current: 0, previous: 0, delta: 0 }),
    };
    const t0 = Date.now();
    await runAnalysis(baseOpts, deps);
    const wall = Date.now() - t0;
    expect(wall).toBeLessThan(150); // 4 × 50ms serial would be 200ms; parallel ~50ms with overhead
  });
});
```

- [ ] **Step 2: Run tests and verify they fail (RED)**

Run: `npx vitest run src/lib/analyze/__tests__/run-analysis.test.ts`
Expected: FAIL — module `'../run-analysis'` not found.

---

## Task 3: Orchestrator — implement (GREEN)

**Files:**
- Create: `src/lib/analyze/run-analysis.ts`

- [ ] **Step 1: Implement the orchestrator**

```ts
// src/lib/analyze/run-analysis.ts
import type {
  AnalysisDeps,
  AnalysisOpts,
  AnalysisResult,
  AnalysisStep,
  AnalysisStepId,
} from './types';

const STEP_LABELS: Record<AnalysisStepId, string> = {
  analytics: 'Analyzing your posts',
  competitors: 'Comparing to competitors',
  'deep-profile': 'Building deep profile',
  'health-delta': 'Computing weekly delta',
};

async function runStep<T>(
  id: AnalysisStepId,
  fn: () => Promise<T>,
): Promise<{ step: AnalysisStep; value: T | null }> {
  const t0 = Date.now();
  try {
    const value = await fn();
    return {
      step: { id, label: STEP_LABELS[id], status: 'success', durationMs: Date.now() - t0 },
      value,
    };
  } catch (err) {
    return {
      step: {
        id,
        label: STEP_LABELS[id],
        status: 'error',
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      },
      value: null,
    };
  }
}

export async function runAnalysis(
  opts: AnalysisOpts,
  deps: AnalysisDeps,
): Promise<AnalysisResult> {
  const { brandId, igUserId } = opts;

  const analyticsP = runStep('analytics', () => deps.fetchAnalyticsInsights(brandId));
  const competitorsP = runStep('competitors', () => deps.fetchCompetitorInsights());
  const healthDeltaP = runStep('health-delta', () => deps.fetchHealthDelta(brandId));
  const deepProfileP = igUserId
    ? runStep('deep-profile', () => deps.fetchDeepProfile(igUserId))
    : Promise.resolve({
        step: {
          id: 'deep-profile' as const,
          label: STEP_LABELS['deep-profile'],
          status: 'skipped' as const,
        },
        value: null,
      });

  const [analytics, competitors, healthDelta, deepProfile] = await Promise.all([
    analyticsP,
    competitorsP,
    healthDeltaP,
    deepProfileP,
  ]);

  return {
    generatedAt: new Date().toISOString(),
    brandId,
    igUserId,
    steps: [analytics.step, competitors.step, deepProfile.step, healthDelta.step],
    healthScore: analytics.value?.healthScore ?? null,
    healthDelta: healthDelta.value?.delta ?? null,
    summary: analytics.value?.summary ?? null,
    analyticsInsights: analytics.value?.insights ?? [],
    competitorInsights: competitors.value?.insights ?? [],
    deepProfile: deepProfile.value,
  };
}
```

- [ ] **Step 2: Run tests and verify they pass (GREEN)**

Run: `npx vitest run src/lib/analyze/__tests__/run-analysis.test.ts`
Expected: PASS — 4 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyze/run-analysis.ts src/lib/analyze/__tests__/run-analysis.test.ts
git commit -m "feat(analyze): add run-analysis orchestrator with parallel step execution"
```

---

## Task 4: API route — write failing test (RED)

**Files:**
- Create: `src/app/api/analyze/run/__tests__/route.test.ts`

- [ ] **Step 1: Write the route test**

```ts
// src/app/api/analyze/run/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({
  getUserId: vi.fn().mockResolvedValue('u1'),
}));

const runAnalysisMock = vi.fn();
vi.mock('@/lib/analyze/run-analysis', () => ({
  runAnalysis: (...args: unknown[]) => runAnalysisMock(...args),
}));

import { POST } from '../route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost:3000/api/analyze/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analyze/run', () => {
  beforeEach(() => {
    runAnalysisMock.mockReset();
  });

  it('returns 200 with the orchestrator result', async () => {
    runAnalysisMock.mockResolvedValue({
      generatedAt: '2026-04-25T00:00:00.000Z',
      brandId: 'b1',
      igUserId: null,
      steps: [],
      healthScore: 50,
      healthDelta: 5,
      summary: 'ok',
      analyticsInsights: [],
      competitorInsights: [],
      deepProfile: null,
    });
    const res = await POST(makeReq({ brandId: 'b1', igUserId: null }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.healthScore).toBe(50);
    expect(runAnalysisMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', brandId: 'b1', igUserId: null }),
      expect.any(Object),
    );
  });

  it('coerces missing brandId to null', async () => {
    runAnalysisMock.mockResolvedValue({
      generatedAt: 't', brandId: null, igUserId: null, steps: [],
      healthScore: null, healthDelta: null, summary: null,
      analyticsInsights: [], competitorInsights: [], deepProfile: null,
    });
    await POST(makeReq({}) as never);
    expect(runAnalysisMock).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: null, igUserId: null }),
      expect.any(Object),
    );
  });

  it('returns 401 when getUserId throws Unauthorized', async () => {
    const { getUserId } = await import('@/lib/auth-helpers');
    (getUserId as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error('Unauthorized'),
    );
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test and verify it fails (RED)**

Run: `npx vitest run src/app/api/analyze/run/__tests__/route.test.ts`
Expected: FAIL — module `'../route'` not found.

---

## Task 5: API route — implement (GREEN)

**Files:**
- Create: `src/app/api/analyze/run/route.ts`

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/analyze/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { runAnalysis } from '@/lib/analyze/run-analysis';
import type { AnalysisDeps } from '@/lib/analyze/types';
import type { InsightCard } from '@/lib/health-score';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export const maxDuration = 60;

function buildDeps(origin: string, cookie: string): AnalysisDeps {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${origin}${path}`, { headers: { cookie } });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return (await res.json()) as T;
  };
  const post = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { cookie },
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    fetchAnalyticsInsights: (brandId) =>
      post<{
        insights: InsightCard[];
        healthScore: number | null;
        summary: string | null;
      }>(
        `/api/insights?type=analytics${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}`,
      ),
    fetchCompetitorInsights: () =>
      post<{ insights: InsightCard[] }>(`/api/insights?type=competitors`),
    fetchDeepProfile: (igUserId) =>
      get<DeepProfile>(`/api/meta/deep-profile?igUserId=${encodeURIComponent(igUserId)}`),
    fetchHealthDelta: (brandId) =>
      get<{ current: number | null; previous: number | null; delta: number | null }>(
        `/api/smart-posts/history${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''}`,
      ),
  };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    let body: { brandId?: string | null; igUserId?: string | null } = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine — treat as no filter
    }
    const brandId = typeof body.brandId === 'string' && body.brandId ? body.brandId : null;
    const igUserId = typeof body.igUserId === 'string' && body.igUserId ? body.igUserId : null;
    const origin = req.nextUrl.origin;
    const cookie = req.headers.get('cookie') ?? '';

    const result = await runAnalysis(
      { userId, brandId, igUserId, origin, cookie },
      buildDeps(origin, cookie),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'analysis_failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run test and verify it passes (GREEN)**

Run: `npx vitest run src/app/api/analyze/run/__tests__/route.test.ts`
Expected: PASS — 3 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analyze/run/route.ts src/app/api/analyze/run/__tests__/route.test.ts
git commit -m "feat(analyze): add POST /api/analyze/run wiring real fetchers to orchestrator"
```

---

## Task 6: Client hook `useAnalysis`

**Files:**
- Create: `src/lib/analyze/use-analysis.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/lib/analyze/use-analysis.ts
'use client';

import { useCallback, useState } from 'react';
import type { AnalysisResult } from './types';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'success'; result: AnalysisResult; finishedAt: number }
  | { status: 'error'; message: string };

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });

  const run = useCallback(
    async (opts: { brandId: string | null; igUserId: string | null }) => {
      setState({ status: 'running', startedAt: Date.now() });
      try {
        const res = await fetch('/api/analyze/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(opts),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        const result = (await res.json()) as AnalysisResult;
        setState({ status: 'success', result, finishedAt: Date.now() });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        setState({ status: 'error', message });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, reset };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "src/lib/analyze"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analyze/use-analysis.ts
git commit -m "feat(analyze): add useAnalysis client hook"
```

---

## Task 7: `RunAnalysisButton` component

**Files:**
- Create: `src/components/analyze/run-analysis-button.tsx`

- [ ] **Step 1: Build the button + step strip**

```tsx
// src/components/analyze/run-analysis-button.tsx
'use client';

import { Sparkles, Loader2, CheckCircle2, AlertCircle, MinusCircle } from 'lucide-react';
import { useAnalysis } from '@/lib/analyze/use-analysis';
import type { AnalysisStep } from '@/lib/analyze/types';

interface RunAnalysisButtonProps {
  brandId: string | null;
  igUserId: string | null;
  onComplete?: (result: import('@/lib/analyze/types').AnalysisResult) => void;
}

const STEP_ICON = {
  pending: MinusCircle,
  running: Loader2,
  success: CheckCircle2,
  skipped: MinusCircle,
  error: AlertCircle,
} as const;

const STEP_COLOR = {
  pending: 'text-zinc-500',
  running: 'text-teal-300 animate-spin',
  success: 'text-emerald-400',
  skipped: 'text-zinc-500',
  error: 'text-rose-400',
} as const;

function StepRow({ step }: { step: AnalysisStep }) {
  const Icon = STEP_ICON[step.status];
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${STEP_COLOR[step.status]}`} />
      <span className="flex-1">{step.label}</span>
      {step.durationMs != null && step.status === 'success' && (
        <span className="text-zinc-500">{(step.durationMs / 1000).toFixed(1)}s</span>
      )}
      {step.status === 'error' && step.error && (
        <span className="text-rose-400 truncate max-w-[200px]" title={step.error}>
          {step.error}
        </span>
      )}
    </div>
  );
}

export function RunAnalysisButton({ brandId, igUserId, onComplete }: RunAnalysisButtonProps) {
  const { state, run } = useAnalysis();
  const running = state.status === 'running';

  const handleClick = async () => {
    const result = await run({ brandId, igUserId });
    if (result && onComplete) onComplete(result);
  };

  return (
    <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-900/20 to-zinc-900/50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15">
          <Sparkles className="h-5 w-5 text-teal-300" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-white">Run Full Analysis</h2>
          <p className="mt-0.5 text-sm text-zinc-300">
            One-tap refresh of your insights, deep profile, competitor benchmarks, and health delta.
          </p>
        </div>
        <button
          onClick={() => void handleClick()}
          disabled={running}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? 'Running...' : 'Run Full Analysis'}
        </button>
      </div>

      {state.status === 'success' && (
        <div className="mt-4 space-y-1.5 rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-3">
          {state.result.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
          {state.result.summary && (
            <p className="mt-2 border-t border-zinc-800/60 pt-2 text-sm text-zinc-200">
              {state.result.summary}
            </p>
          )}
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />
          {state.message}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep "src/components/analyze\|src/lib/analyze"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/analyze/run-analysis-button.tsx
git commit -m "feat(analyze): add RunAnalysisButton with step progress strip"
```

---

## Task 8: Mount the button on `/analyze`

**Files:**
- Modify: `src/components/analyze/analyze-page.tsx`

- [ ] **Step 1: Replace the existing component body**

Read the current file first (`src/components/analyze/analyze-page.tsx`) — confirm it currently is:

```tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { PerformancePage } from '@/components/performance/performance-page';
import { CompetitorDashboard } from '@/components/competitor-dashboard';
import { AnalyzeTabs, readTab } from './analyze-tabs';
import { CompareSection } from './compare-section';

export function AnalyzePage() {
  const searchParams = useSearchParams();
  const tab = readTab(searchParams);

  return (
    <div className="space-y-6">
      <AnalyzeTabs />
      {tab === 'you' && <PerformancePage />}
      {tab === 'competitors' && <CompetitorDashboard />}
      {tab === 'compare' && <CompareSection />}
    </div>
  );
}
```

Replace with:

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

- [ ] **Step 2: Run the existing analyze-tabs test to confirm we didn't break it**

Run: `npx vitest run src/components/analyze/__tests__/analyze-tabs.test.tsx`
Expected: PASS — both tests still passing.

- [ ] **Step 3: Run the full type check**

Run: `npx tsc --noEmit 2>&1 | grep -E "analyze|run-analysis" | head -10`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/analyze/analyze-page.tsx
git commit -m "feat(analyze): mount RunAnalysisButton above the existing tabs"
```

---

## Task 9: Browser verification

- [ ] **Step 1: Start the dev server**

Kill any existing Next dev process for this codebase first, then:

Run: `npm run dev`
Expected: server up at http://localhost:3000.

- [ ] **Step 2: Sign in and navigate to `/analyze`**

In a browser, sign in, then go to `http://localhost:3000/analyze`.
Expected: see the new "Run Full Analysis" card above the You/Competitors/Compare tabs.

- [ ] **Step 3: Click "Run Full Analysis" with no brand selected**

Expected: spinner spins for a few seconds, then a step strip appears showing 4 rows:
- Analyzing your posts ✅
- Comparing to competitors ✅
- Building deep profile (skipped if no IG account, otherwise ✅)
- Computing weekly delta ✅
Plus a summary line.

- [ ] **Step 4: Click "Run Full Analysis" again with an IG account selected from the picker**

Expected: deep-profile step now shows ✅ (not skipped).

- [ ] **Step 5: Force one source to error and verify graceful degradation**

Temporarily break `/api/insights` by stopping its DB or by editing the route to throw. Click Run. Expected: the analytics step shows ❌ with the error text, but the other three still complete; no crash.

Revert the temporary break.

- [ ] **Step 6: No commit needed for this task** — verification only.

---

## Task 10: Final wrap

- [ ] **Step 1: Push develop**

```bash
git push origin develop
```

- [ ] **Step 2: Open the diff one more time and skim**

Run: `git log --oneline origin/main..develop`
Expected: 6 new commits from this phase, all `feat(analyze):` prefix.

- [ ] **Step 3: Stop here.**

Phase 2 (insight-first card layout) consumes the `AnalysisResult` shape this phase added. Do **not** proceed to Phase 2 in the same session — write `2026-04-25-phase2-*.md` first.

---

## Self-review checklist

- [x] Spec coverage — every bullet in roadmap Phase 1 description has a task.
- [x] No placeholders — every code block is complete, no TODO/TBD.
- [x] Type consistency — `AnalysisResult` / `AnalysisStep` / `AnalysisDeps` names match across all files.
- [x] Tests run before implementation in every TDD task (RED → GREEN).
- [x] Commits are scoped per task and message-prefixed `feat(analyze):`.
- [x] Phase 1 is purely additive — no existing UI is removed (Phase 2's job).
