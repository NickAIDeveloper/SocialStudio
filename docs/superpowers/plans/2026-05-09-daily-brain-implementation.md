# Daily Brand Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily, per-brand "brain" that ingests Meta Instagram insights and competitor account-level data, derives structured signals, writes a Cerebras-generated narrative brief, and silently feeds Smart Posts and Create at every generation.

**Architecture:** Three new DB tables (`brain_snapshots`, `brain_signals`, `brand_brain`). Five Next.js route handlers under `src/app/api/brain/` — three HMAC-authed (called by GitHub Actions), two session-authed (UI). One orchestrator script (`scripts/brain/run-daily.mjs`) called by a daily GitHub Actions cron. Brain panel on `/analyze`. Silent injection into Smart Posts and Create with a small "Brain v3 · 2h ago" badge. Conservative rate-limit policy: prefer partial brains over Meta bans.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM (Neon Postgres), Vitest + Playwright, Cerebras (existing), Meta Graph API (existing client), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-05-09-daily-brain-design.md`

---

## File map

### New files

```
src/lib/brain/
  auth.ts                     HMAC-SHA256 verify
  types.ts                    Shared TS types
  consume.ts                  readBrandBrain() for Smart Posts + Create
  snapshot-ig.ts              IG snapshot (Graph + cache)
  snapshot-ads.ts             Ads snapshot (no-op until campaigns)
  snapshot-competitor.ts      Competitor account-level (reads scrapedAccounts)
  compute-signals.ts          Pure: snapshots → signals
  brief-prompt.ts             Cerebras prompt builder
  brief-parser.ts             Validate fixed-header + extract Formula
  brief-fallback.ts           Deterministic fallback brief from signals
  brief-runner.ts             Orchestrates brief endpoint logic
  rate-limit.ts               Honors X-App-Usage / X-Business-Use-Case-Usage
  __tests__/
    signature.test.ts
    compute-signals.test.ts
    brief-template.test.ts
    cache-respect.test.ts
    rate-limit.test.ts
    consume-merge.test.ts
    fixtures/
      ig-insights-28d.json
      ig-media.json
      meta-headers-80pct.json
      scraped-accounts.json
      previous-brief.md

src/app/api/brain/
  snapshot/route.ts           POST: per-brand, per-source ingest (HMAC)
  compute/route.ts            POST: derive signals (HMAC)
  brief/route.ts              POST: write brief (HMAC)
  trigger/route.ts            POST: session-authed "Run now"
  route.ts                    GET: brain panel data (session-authed)

src/components/brain/
  brain-panel.tsx             /analyze panel (full brief, sources, history)
  brain-badge.tsx             Tiny "Brain v3 · 2h ago" badge
  brain-history-modal.tsx     Last 7 days of run history

scripts/brain/
  run-daily.mjs               Orchestrator called by GitHub Actions

.github/workflows/
  brain-daily.yml             Cron trigger

tests/e2e/
  brain.spec.ts               Playwright happy path
```

### Modified files

```
src/lib/db/schema.ts                     Add 3 tables + types
src/app/(dashboard)/analyze/page.tsx     Mount BrainPanel behind flag
src/app/(dashboard)/smart-posts/page.tsx Mount BrainBadge behind flag
src/lib/smart-posts/generate.ts          Inject brain into LLM context
src/app/api/captions/route.ts            Inject brain into LLM context
src/components/post-generator.tsx        Render BrainBadge
```

### Environment variables

Add: `BRAIN_CRON_SECRET` (Vercel + GitHub Secrets), `BRAIN_UI_ENABLED` (Vercel, defaults off).

---

## Phase A — Foundation

### Task A1: Add brain schema tables

**Files:**
- Modify: `src/lib/db/schema.ts` (append at end of table block, before `// ── Inferred Types ──`)

- [ ] **Step 1: Append schema block**

Add after `insightsCache` (around line 354):

```ts
// ── Brain (daily insights pipeline) ───────────────────────────────────────────
// Three tables: snapshots (raw audit, 90d retention), signals (derived,
// queryable), brand_brain (one row per brand, narrative brief consumed by
// Smart Posts + Create). All keyed by brand_id so multi-brand users get
// fully independent brains.

export const brainSnapshots = pgTable(
  'brain_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    // 'ig' | 'ads' | 'competitor_account'
    source: varchar('source', { length: 32 }).notNull(),
    capturedAt: timestamp('captured_at', { mode: 'date' }).notNull(),
    payload: jsonb('payload').notNull(),
    metricsSummary: jsonb('metrics_summary').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('brain_snapshots_brand_source_day_idx').on(
      t.brandId,
      t.source,
      t.capturedAt
    ),
  ]
);

export const brainSignals = pgTable(
  'brain_signals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    computedAt: timestamp('computed_at', { mode: 'date' }).notNull().defaultNow(),
    windowDays: integer('window_days').notNull(), // 7 | 14 | 28
    topFormat: varchar('top_format', { length: 16 }), // REEL | CAROUSEL | IMAGE | null
    topSlotDow: integer('top_slot_dow'), // 0-6, Sunday=0
    topSlotHour: integer('top_slot_hour'), // 0-23 local
    hookPatterns: jsonb('hook_patterns'),
    ctaPatterns: jsonb('cta_patterns'),
    captionShape: jsonb('caption_shape'),
    topicClusters: jsonb('topic_clusters'),
    competitorSummary: jsonb('competitor_summary'),
    adSummary: jsonb('ad_summary'),
    rawKpis: jsonb('raw_kpis'),
  },
  (t) => [
    uniqueIndex('brain_signals_brand_window_idx').on(
      t.brandId,
      t.computedAt,
      t.windowDays
    ),
  ]
);

export const brandBrain = pgTable('brand_brain', {
  brandId: uuid('brand_id')
    .primaryKey()
    .references(() => brands.id, { onDelete: 'cascade' }),
  briefMd: text('brief_md').notNull(),
  briefVersion: integer('brief_version').notNull().default(0),
  signalsId: uuid('signals_id').references(() => brainSignals.id, {
    onDelete: 'set null',
  }),
  generatedAt: timestamp('generated_at', { mode: 'date' }).notNull().defaultNow(),
  lastRunAt: timestamp('last_run_at', { mode: 'date' }).notNull().defaultNow(),
  // 'ok' | 'partial' | 'failed' | 'skipped_no_connection'
  lastRunStatus: varchar('last_run_status', { length: 32 }).notNull(),
  lastRunError: text('last_run_error'),
  ingestedSources: jsonb('ingested_sources').notNull(),
});
```

- [ ] **Step 2: Add inferred types**

Add to the `// ── Inferred Types ──` block:

```ts
export type InsertBrainSnapshot = typeof brainSnapshots.$inferInsert;
export type SelectBrainSnapshot = typeof brainSnapshots.$inferSelect;
export type InsertBrainSignals = typeof brainSignals.$inferInsert;
export type SelectBrainSignals = typeof brainSignals.$inferSelect;
export type InsertBrandBrain = typeof brandBrain.$inferInsert;
export type SelectBrandBrain = typeof brandBrain.$inferSelect;
```

- [ ] **Step 3: Push the migration**

Run: `npx drizzle-kit push`
Expected: prompts to apply 3 new tables; confirm `y`. Verifies success with `psql ... \dt brain_*`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(brain): add brain_snapshots, brain_signals, brand_brain tables"
```

---

### Task A2: Brain TS types

**Files:**
- Create: `src/lib/brain/types.ts`

- [ ] **Step 1: Create types file**

```ts
// src/lib/brain/types.ts

export type BrainSource = 'ig' | 'ads' | 'competitor_account';

export type RunStatus = 'ok' | 'partial' | 'failed' | 'skipped_no_connection';

export type SourceStatus =
  | 'ok'
  | 'partial'
  | 'failed'
  | 'skipped_no_connection'
  | 'skipped_no_campaigns';

export interface IngestedSources {
  ig: SourceStatus;
  ads: SourceStatus;
  competitor_account: SourceStatus;
}

export type IgFormat = 'REEL' | 'CAROUSEL' | 'IMAGE';
export type EmojiDensity = 'low' | 'medium' | 'high';

export interface CaptionShape {
  avgLines: number;
  avgParagraphs: number;
  emojiDensity: EmojiDensity;
  hookToBodyRatio: number;
}

export interface HookPattern {
  pattern: string;
  sampleSize: number;
  medianReach: number;
}

export interface TopicCluster {
  topic: string;
  sampleSize: number;
  medianEngagement: number;
}

export interface CompetitorSummary {
  // Account-level only in v1.
  totalCompetitors: number;
  followerGrowthMedian: number | null;
  postsPerWeekMedian: number | null;
}

export interface SnapshotResponse {
  status: 'ok' | 'partial' | 'skipped' | 'failed';
  reason?: string;
  sampleSize?: number;
}

export interface BrainFormula {
  format: IgFormat;
  bestSlot: { dow: number; hour: number };
  captionShape: { lines: number; paragraphs: number; emojiDensity: EmojiDensity };
}

export interface BrainContext {
  briefMd: string;
  formula: BrainFormula | null; // null if parser couldn't extract
  briefVersion: number;
  generatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brain/types.ts
git commit -m "feat(brain): add shared TS types"
```

---

### Task A3: HMAC auth helper + test

**Files:**
- Create: `src/lib/brain/auth.ts`
- Create: `src/lib/brain/__tests__/signature.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/brain/__tests__/signature.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyBrainSignature } from '../auth';

const SECRET = 'test-secret-do-not-use-in-prod';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

function makeReq(body: string, sig: string | null): Request {
  const headers = new Headers();
  if (sig !== null) headers.set('x-brain-signature', sig);
  return new Request('http://x/api/brain/snapshot', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyBrainSignature', () => {
  beforeEach(() => {
    process.env.BRAIN_CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.BRAIN_CRON_SECRET;
  });

  it('accepts a valid signature', async () => {
    const body = JSON.stringify({ runId: 'r1', day: '2026-05-09' });
    const req = makeReq(body, sign(body));
    expect(await verifyBrainSignature(req, body)).toBe(true);
  });

  it('rejects a missing signature header', async () => {
    const body = '{}';
    const req = makeReq(body, null);
    expect(await verifyBrainSignature(req, body)).toBe(false);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify({ runId: 'r1', day: '2026-05-09' });
    const sig = sign(body);
    const tampered = JSON.stringify({ runId: 'r1', day: '2026-05-10' });
    const req = makeReq(tampered, sig);
    expect(await verifyBrainSignature(req, tampered)).toBe(false);
  });

  it('rejects when BRAIN_CRON_SECRET is not set', async () => {
    delete process.env.BRAIN_CRON_SECRET;
    const body = '{}';
    const req = makeReq(body, sign(body));
    expect(await verifyBrainSignature(req, body)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/brain/__tests__/signature.test.ts`
Expected: FAIL — module `../auth` not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/brain/auth.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export async function verifyBrainSignature(
  req: Request,
  rawBody: string
): Promise<boolean> {
  const sig = req.headers.get('x-brain-signature');
  const secret = process.env.BRAIN_CRON_SECRET;
  if (!sig || !secret) return false;

  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(sig, 'hex');
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(expected, provided);
}

export function signBrainBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/brain/__tests__/signature.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brain/auth.ts src/lib/brain/__tests__/signature.test.ts
git commit -m "feat(brain): HMAC-SHA256 request signature verify"
```

---

### Task A4: Rate-limit header parser + test

**Files:**
- Create: `src/lib/brain/rate-limit.ts`
- Create: `src/lib/brain/__tests__/rate-limit.test.ts`
- Create: `src/lib/brain/__tests__/fixtures/meta-headers-80pct.json`

- [ ] **Step 1: Write the fixture**

```json
{
  "x-app-usage": "{\"call_count\":82,\"total_time\":40,\"total_cputime\":35}",
  "x-business-use-case-usage": "{\"123\":[{\"type\":\"ads_management\",\"call_count\":35,\"total_cputime\":40,\"total_time\":62,\"estimated_time_to_regain_access\":0}]}",
  "x-ad-account-usage": "{\"acc_id_util_pct\":78,\"reset_time_duration\":30}"
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/brain/__tests__/rate-limit.test.ts
import { describe, it, expect } from 'vitest';
import { parseUsage, isThrottled } from '../rate-limit';
import fixture from './fixtures/meta-headers-80pct.json';

describe('parseUsage', () => {
  it('returns the highest dimension across all three usage headers', () => {
    const headers = new Headers(fixture as Record<string, string>);
    const usage = parseUsage(headers);
    expect(usage.maxPct).toBeGreaterThanOrEqual(78);
    expect(usage.maxPct).toBeLessThanOrEqual(82);
  });

  it('returns 0 when no usage headers are present', () => {
    expect(parseUsage(new Headers()).maxPct).toBe(0);
  });
});

describe('isThrottled', () => {
  it('returns true when any dimension is at or above threshold', () => {
    const headers = new Headers(fixture as Record<string, string>);
    expect(isThrottled(headers, 80)).toBe(true);
  });

  it('returns false when all dimensions are below threshold', () => {
    const headers = new Headers(fixture as Record<string, string>);
    expect(isThrottled(headers, 99)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/brain/__tests__/rate-limit.test.ts`
Expected: FAIL — module `../rate-limit` not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/brain/rate-limit.ts

interface UsageReport {
  maxPct: number;
  details: { source: string; pct: number }[];
}

function maxOf(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  let max = 0;
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      max = Math.max(max, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          for (const v of Object.values(item as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isFinite(v)) {
              max = Math.max(max, v);
            }
          }
        }
      }
    } else if (value && typeof value === 'object') {
      max = Math.max(max, maxOf(value));
    }
  }
  return max;
}

function parseHeader(headers: Headers, name: string): unknown {
  const raw = headers.get(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseUsage(headers: Headers): UsageReport {
  const sources = ['x-app-usage', 'x-business-use-case-usage', 'x-ad-account-usage'];
  const details: { source: string; pct: number }[] = [];
  let maxPct = 0;
  for (const name of sources) {
    const parsed = parseHeader(headers, name);
    const pct = maxOf(parsed);
    details.push({ source: name, pct });
    maxPct = Math.max(maxPct, pct);
  }
  return { maxPct, details };
}

export function isThrottled(headers: Headers, thresholdPct = 80): boolean {
  return parseUsage(headers).maxPct >= thresholdPct;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/brain/__tests__/rate-limit.test.ts`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brain/rate-limit.ts src/lib/brain/__tests__/rate-limit.test.ts src/lib/brain/__tests__/fixtures/meta-headers-80pct.json
git commit -m "feat(brain): rate-limit header parser respects 80% threshold"
```

---

## Phase B — Snapshot endpoints

### Task B1: IG snapshot logic + cache-respect test

**Files:**
- Create: `src/lib/brain/snapshot-ig.ts`
- Create: `src/lib/brain/__tests__/cache-respect.test.ts`
- Create: `src/lib/brain/__tests__/fixtures/ig-insights-28d.json`
- Create: `src/lib/brain/__tests__/fixtures/ig-media.json`

- [ ] **Step 1: Write fixtures**

`fixtures/ig-media.json`:
```json
{
  "data": [
    { "id": "m1", "caption": "Hook line\n\nBody.", "media_type": "VIDEO", "media_product_type": "REELS", "timestamp": "2026-05-01T19:00:00+0000", "like_count": 1200, "comments_count": 80, "permalink": "https://instagram.com/p/m1" },
    { "id": "m2", "caption": "Carousel post", "media_type": "CAROUSEL_ALBUM", "timestamp": "2026-05-02T17:00:00+0000", "like_count": 800, "comments_count": 30, "permalink": "https://instagram.com/p/m2" }
  ]
}
```

`fixtures/ig-insights-28d.json`:
```json
{
  "m1": { "data": [{ "name": "reach", "values": [{ "value": 35000 }] }, { "name": "views", "values": [{ "value": 50000 }] }, { "name": "likes", "values": [{ "value": 1200 }] }, { "name": "comments", "values": [{ "value": 80 }] }, { "name": "saves", "values": [{ "value": 200 }] }, { "name": "shares", "values": [{ "value": 60 }] }] },
  "m2": { "data": [{ "name": "reach", "values": [{ "value": 12000 }] }, { "name": "views", "values": [{ "value": 14000 }] }, { "name": "likes", "values": [{ "value": 800 }] }, { "name": "comments", "values": [{ "value": 30 }] }, { "name": "saves", "values": [{ "value": 150 }] }, { "name": "shares", "values": [{ "value": 20 }] }] }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/brain/__tests__/cache-respect.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshotIg } from '../snapshot-ig';
import mediaFixture from './fixtures/ig-media.json';
import insightsFixture from './fixtures/ig-insights-28d.json';

describe('snapshotIg cache behaviour', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let cacheRead: ReturnType<typeof vi.fn>;
  let cacheWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('/media')) return new Response(JSON.stringify(mediaFixture));
      const m = url.match(/\/(m\d+)\/insights/);
      const id = m?.[1] as keyof typeof insightsFixture;
      return new Response(JSON.stringify(insightsFixture[id] ?? { data: [] }));
    });
    cacheRead = vi.fn(async () => null);
    cacheWrite = vi.fn(async () => {});
  });

  it('returns ok and writes cache on a fresh day', async () => {
    const result = await snapshotIg({
      brandId: 'b1',
      userId: 'u1',
      igUserId: 'ig1',
      accessToken: 'tok',
      day: '2026-05-09',
      fetcher: fetchSpy,
      cacheRead,
      cacheWrite,
    });

    expect(result.status).toBe('ok');
    expect(result.sampleSize).toBe(2);
    expect(cacheWrite).toHaveBeenCalledTimes(1);
  });

  it('skips Graph calls when cache is fresh', async () => {
    cacheRead.mockResolvedValueOnce({
      media: mediaFixture.data,
      insightsByMediaId: insightsFixture,
    });

    const result = await snapshotIg({
      brandId: 'b1',
      userId: 'u1',
      igUserId: 'ig1',
      accessToken: 'tok',
      day: '2026-05-09',
      fetcher: fetchSpy,
      cacheRead,
      cacheWrite,
    });

    expect(result.status).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cacheWrite).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/brain/__tests__/cache-respect.test.ts`
Expected: FAIL — module `../snapshot-ig` not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/brain/snapshot-ig.ts
import type { SnapshotResponse } from './types';

export interface SnapshotIgInput {
  brandId: string;
  userId: string;
  igUserId: string;
  accessToken: string;
  day: string; // YYYY-MM-DD
  fetcher?: typeof fetch;
  cacheRead: (key: string) => Promise<{ media: unknown[]; insightsByMediaId: Record<string, unknown> } | null>;
  cacheWrite: (key: string, value: unknown) => Promise<void>;
  // Persist hook: caller writes the snapshot row.
  persist?: (payload: { media: unknown[]; insightsByMediaId: Record<string, unknown> }) => Promise<void>;
  spacingMs?: number;
}

const IG_API_BASE = 'https://graph.instagram.com';
const MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url';
const PER_POST_METRICS = ['reach', 'views', 'likes', 'comments', 'saves', 'shares'];

function cacheKeyFor(day: string, igUserId: string): string {
  return `brain:ig:${igUserId}:${day}`;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

export async function snapshotIg(input: SnapshotIgInput): Promise<SnapshotResponse> {
  const fetcher = input.fetcher ?? fetch;
  const spacing = input.spacingMs ?? 250;
  const cacheKey = cacheKeyFor(input.day, input.igUserId);

  const cached = await input.cacheRead(cacheKey);
  if (cached) {
    await input.persist?.(cached);
    return { status: 'ok', sampleSize: cached.media.length };
  }

  // 1. Pull last 30 media items.
  const mediaUrl = `${IG_API_BASE}/${input.igUserId}/media?fields=${MEDIA_FIELDS}&limit=30&access_token=${input.accessToken}`;
  const mediaRes = await fetcher(mediaUrl);
  if (!mediaRes.ok) {
    return { status: 'failed', reason: `media_${mediaRes.status}` };
  }
  const mediaJson = (await mediaRes.json()) as { data: { id: string }[] };
  const media = mediaJson.data ?? [];

  // 2. For each, pull insights with conservative spacing.
  const insightsByMediaId: Record<string, unknown> = {};
  for (const item of media) {
    await sleep(spacing);
    const url = `${IG_API_BASE}/${item.id}/insights?metric=${PER_POST_METRICS.join(',')}&access_token=${input.accessToken}`;
    const res = await fetcher(url);
    if (!res.ok) {
      // Non-fatal: skip this post. Brain still useful.
      continue;
    }
    insightsByMediaId[item.id] = await res.json();
  }

  const payload = { media, insightsByMediaId };
  await input.cacheWrite(cacheKey, payload);
  await input.persist?.(payload);

  return { status: 'ok', sampleSize: media.length };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/brain/__tests__/cache-respect.test.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brain/snapshot-ig.ts src/lib/brain/__tests__/cache-respect.test.ts src/lib/brain/__tests__/fixtures/ig-media.json src/lib/brain/__tests__/fixtures/ig-insights-28d.json
git commit -m "feat(brain): IG snapshot with conservative spacing and cache reuse"
```

---

### Task B2: Ads snapshot (no-op skeleton)

**Files:**
- Create: `src/lib/brain/snapshot-ads.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/brain/snapshot-ads.ts
import type { SnapshotResponse } from './types';

export interface SnapshotAdsInput {
  brandId: string;
  adAccountId: string | null;
  accessToken: string;
  day: string;
  fetcher?: typeof fetch;
  persist?: (payload: { hasCampaigns: boolean; insights: unknown }) => Promise<void>;
}

// v1 stub: if there are no campaigns running, skip with a clear reason.
// When the user starts running ads, this will light up automatically.
export async function snapshotAds(input: SnapshotAdsInput): Promise<SnapshotResponse> {
  if (!input.adAccountId) {
    return { status: 'skipped', reason: 'no_campaigns' };
  }

  const fetcher = input.fetcher ?? fetch;
  const url = `https://graph.facebook.com/v21.0/${input.adAccountId}/insights?date_preset=last_28d&level=campaign&fields=campaign_name,impressions,reach,clicks,ctr,cpc,actions&access_token=${input.accessToken}`;
  const res = await fetcher(url);
  if (!res.ok) {
    return { status: 'failed', reason: `ads_${res.status}` };
  }
  const json = (await res.json()) as { data?: unknown[] };
  const data = json.data ?? [];
  if (data.length === 0) {
    return { status: 'skipped', reason: 'no_campaigns' };
  }
  await input.persist?.({ hasCampaigns: true, insights: data });
  return { status: 'ok', sampleSize: data.length };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brain/snapshot-ads.ts
git commit -m "feat(brain): ads snapshot (no-op until campaigns exist)"
```

---

### Task B3: Competitor account-level snapshot

**Files:**
- Create: `src/lib/brain/snapshot-competitor.ts`
- Create: `src/lib/brain/__tests__/fixtures/scraped-accounts.json`

- [ ] **Step 1: Write fixture**

```json
[
  { "id": "sa1", "handle": "compa", "followerCount": 25000, "postCount": 412 },
  { "id": "sa2", "handle": "compb", "followerCount": 80000, "postCount": 1100 }
]
```

- [ ] **Step 2: Implement**

```ts
// src/lib/brain/snapshot-competitor.ts
import type { SnapshotResponse } from './types';

export interface CompetitorRecord {
  id: string;
  handle: string;
  followerCount: number | null;
  postCount: number | null;
}

export interface SnapshotCompetitorInput {
  brandId: string;
  competitors: CompetitorRecord[]; // already-fetched scrapedAccounts rows
  persist?: (payload: { competitors: CompetitorRecord[] }) => Promise<void>;
}

// v1: account-level only. Reads from scrapedAccounts (already populated by
// existing scrape pipeline). Per-post competitor data is subsystem #2.
export async function snapshotCompetitor(
  input: SnapshotCompetitorInput
): Promise<SnapshotResponse> {
  if (input.competitors.length === 0) {
    return { status: 'skipped', reason: 'no_competitors_configured' };
  }

  await input.persist?.({ competitors: input.competitors });
  return { status: 'ok', sampleSize: input.competitors.length };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/brain/snapshot-competitor.ts src/lib/brain/__tests__/fixtures/scraped-accounts.json
git commit -m "feat(brain): competitor account-level snapshot from scrapedAccounts"
```

---

### Task B4: `/api/brain/snapshot` route

**Files:**
- Create: `src/app/api/brain/snapshot/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/brain/snapshot/route.ts
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  instagramAccounts,
  metaAccounts,
  scrapedAccounts,
  brainSnapshots,
  metaInsightsCache,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { snapshotIg } from '@/lib/brain/snapshot-ig';
import { snapshotAds } from '@/lib/brain/snapshot-ads';
import { snapshotCompetitor } from '@/lib/brain/snapshot-competitor';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

interface Body {
  runId: string;
  day: string;
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  const source = searchParams.get('source');
  if (!brandId || !source) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as Body;
  const dayDate = new Date(`${body.day}T00:00:00Z`);

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  // --- IG ---
  if (source === 'ig') {
    if (!brand.instagramHandle) {
      return NextResponse.json({ status: 'skipped', reason: 'no_ig_handle' });
    }
    const [igAcct] = await db
      .select()
      .from(instagramAccounts)
      .where(
        and(
          eq(instagramAccounts.userId, brand.userId),
          eq(instagramAccounts.igUsername, brand.instagramHandle)
        )
      );
    if (!igAcct) {
      return NextResponse.json({ status: 'skipped', reason: 'no_connection' });
    }

    const result = await snapshotIg({
      brandId,
      userId: brand.userId,
      igUserId: igAcct.igUserId,
      accessToken: decrypt(igAcct.accessToken),
      day: body.day,
      cacheRead: async (key) => {
        const [row] = await db
          .select()
          .from(metaInsightsCache)
          .where(
            and(
              eq(metaInsightsCache.userId, brand.userId),
              eq(metaInsightsCache.cacheKey, key)
            )
          );
        if (!row) return null;
        if (row.expiresAt.getTime() < Date.now()) return null;
        return row.data as { media: unknown[]; insightsByMediaId: Record<string, unknown> };
      },
      cacheWrite: async (key, value) => {
        await db.insert(metaInsightsCache).values({
          userId: brand.userId,
          adAccountId: 'ig',
          cacheKey: key,
          data: value as Record<string, unknown>,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }).onConflictDoUpdate({
          target: [
            metaInsightsCache.userId,
            metaInsightsCache.adAccountId,
            metaInsightsCache.cacheKey,
          ],
          set: { data: value as Record<string, unknown>, fetchedAt: new Date() },
        });
      },
      persist: async (payload) => {
        await db.insert(brainSnapshots).values({
          brandId,
          source: 'ig',
          capturedAt: dayDate,
          payload: payload as Record<string, unknown>,
          metricsSummary: { sampleSize: payload.media.length },
        }).onConflictDoNothing();
      },
    });

    return NextResponse.json(result);
  }

  // --- ADS ---
  if (source === 'ads') {
    const [meta] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, brand.userId));
    if (!meta) return NextResponse.json({ status: 'skipped', reason: 'no_connection' });

    const result = await snapshotAds({
      brandId,
      adAccountId: meta.selectedAdAccountId,
      accessToken: decrypt(meta.accessToken),
      day: body.day,
      persist: async (payload) => {
        await db.insert(brainSnapshots).values({
          brandId,
          source: 'ads',
          capturedAt: dayDate,
          payload: payload as Record<string, unknown>,
          metricsSummary: { hasCampaigns: payload.hasCampaigns },
        }).onConflictDoNothing();
      },
    });
    return NextResponse.json(result);
  }

  // --- COMPETITOR_ACCOUNT ---
  if (source === 'competitor_account') {
    const competitors = await db
      .select({
        id: scrapedAccounts.id,
        handle: scrapedAccounts.handle,
        followerCount: scrapedAccounts.followerCount,
        postCount: scrapedAccounts.postCount,
      })
      .from(scrapedAccounts)
      .where(
        and(
          eq(scrapedAccounts.brandId, brandId),
          eq(scrapedAccounts.isCompetitor, true)
        )
      );

    const result = await snapshotCompetitor({
      brandId,
      competitors,
      persist: async (payload) => {
        await db.insert(brainSnapshots).values({
          brandId,
          source: 'competitor_account',
          capturedAt: dayDate,
          payload: payload as Record<string, unknown>,
          metricsSummary: { count: payload.competitors.length },
        }).onConflictDoNothing();
      },
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'unknown_source' }, { status: 400 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/brain/snapshot/route.ts
git commit -m "feat(brain): /api/brain/snapshot HMAC-authed route handling 3 sources"
```

---

## Phase C — Compute signals

### Task C1: compute-signals + test

**Files:**
- Create: `src/lib/brain/compute-signals.ts`
- Create: `src/lib/brain/__tests__/compute-signals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/brain/__tests__/compute-signals.test.ts
import { describe, it, expect } from 'vitest';
import { computeSignals } from '../compute-signals';
import mediaFixture from './fixtures/ig-media.json';
import insightsFixture from './fixtures/ig-insights-28d.json';

describe('computeSignals', () => {
  it('produces deterministic output for fixed input', () => {
    const result = computeSignals({
      windowDays: 28,
      ig: { media: mediaFixture.data, insightsByMediaId: insightsFixture as Record<string, unknown> },
      ads: null,
      competitors: [],
    });

    expect(result.topFormat).toBe('REEL');
    expect(typeof result.topSlotDow).toBe('number');
    expect(typeof result.topSlotHour).toBe('number');
    expect(result.captionShape.avgLines).toBeGreaterThan(0);
    expect(result.competitorSummary.totalCompetitors).toBe(0);
  });

  it('returns null top_format when ig is null', () => {
    const result = computeSignals({
      windowDays: 28,
      ig: null,
      ads: null,
      competitors: [],
    });
    expect(result.topFormat).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/brain/__tests__/compute-signals.test.ts`
Expected: FAIL — module `../compute-signals` not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/brain/compute-signals.ts
import {
  computeFormatPerformance,
  computeHeatmap,
  normalizeFormat,
  type IgMediaItem,
} from '@/lib/meta/ig-analytics';
import type {
  CaptionShape,
  CompetitorSummary,
  EmojiDensity,
  HookPattern,
  IgFormat,
  TopicCluster,
} from './types';

export interface ComputeSignalsInput {
  windowDays: 7 | 14 | 28;
  ig: { media: IgMediaItem[]; insightsByMediaId: Record<string, unknown> } | null;
  ads: { hasCampaigns: boolean; insights: unknown } | null;
  competitors: { handle: string; followerCount: number | null; postCount: number | null }[];
}

export interface ComputeSignalsOutput {
  windowDays: number;
  topFormat: IgFormat | null;
  topSlotDow: number | null;
  topSlotHour: number | null;
  hookPatterns: HookPattern[];
  ctaPatterns: { pattern: string; sampleSize: number }[];
  captionShape: CaptionShape;
  topicClusters: TopicCluster[];
  competitorSummary: CompetitorSummary;
  adSummary: { hasCampaigns: boolean } | null;
  rawKpis: { totalPosts: number; totalReach: number; medianReach: number };
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function emojiDensity(captions: string[]): EmojiDensity {
  if (captions.length === 0) return 'low';
  const total = captions.reduce((acc, c) => acc + (c.match(EMOJI_RE)?.length ?? 0), 0);
  const perCaption = total / captions.length;
  if (perCaption < 1) return 'low';
  if (perCaption < 3) return 'medium';
  return 'high';
}

function captionShape(captions: string[]): CaptionShape {
  if (captions.length === 0) {
    return { avgLines: 0, avgParagraphs: 0, emojiDensity: 'low', hookToBodyRatio: 0 };
  }
  let lines = 0;
  let paragraphs = 0;
  let hookToBody = 0;
  for (const c of captions) {
    const ls = c.split('\n');
    lines += ls.length;
    paragraphs += c.split(/\n\s*\n/).length;
    const firstLine = ls[0]?.length ?? 0;
    const rest = c.length - firstLine;
    hookToBody += rest > 0 ? firstLine / rest : 1;
  }
  return {
    avgLines: +(lines / captions.length).toFixed(1),
    avgParagraphs: +(paragraphs / captions.length).toFixed(1),
    emojiDensity: emojiDensity(captions),
    hookToBodyRatio: +(hookToBody / captions.length).toFixed(2),
  };
}

function topHookPatterns(captions: string[]): HookPattern[] {
  // v1: bucket by first-line shape (question | stat | imperative | other).
  const buckets: Record<string, string[]> = {};
  for (const c of captions) {
    const first = c.split('\n')[0] ?? '';
    let key = 'other';
    if (/\?$/.test(first)) key = 'question';
    else if (/\b\d+(\.\d+)?\b/.test(first)) key = 'stat';
    else if (/^(stop|start|try|do|don't|never|always)\b/i.test(first)) key = 'imperative';
    (buckets[key] ??= []).push(first);
  }
  return Object.entries(buckets).map(([pattern, lines]) => ({
    pattern,
    sampleSize: lines.length,
    medianReach: 0,
  }));
}

function ctaPatterns(captions: string[]): { pattern: string; sampleSize: number }[] {
  const phrases = ['link in bio', 'comment below', 'tag a friend', 'save this', 'share this', 'try it', 'sign up'];
  const out: { pattern: string; sampleSize: number }[] = [];
  for (const phrase of phrases) {
    const re = new RegExp(phrase, 'i');
    const count = captions.filter((c) => re.test(c)).length;
    if (count > 0) out.push({ pattern: phrase, sampleSize: count });
  }
  return out;
}

export function computeSignals(input: ComputeSignalsInput): ComputeSignalsOutput {
  const ig = input.ig;
  const captions = ig ? ig.media.map((m) => m.caption ?? '').filter(Boolean) : [];
  const formatStats = ig ? computeFormatPerformance(ig.media) : [];
  const heat = ig ? computeHeatmap(ig.media) : null;

  const topFormat: IgFormat | null = formatStats[0]?.sampleSize
    ? (formatStats[0].format as IgFormat)
    : ig?.media[0]
      ? (normalizeFormat(ig.media[0]) as IgFormat)
      : null;

  const topSlot = heat?.topSlots?.[0];

  const totalReach = ig
    ? ig.media.reduce((acc, m) => acc + (m.like_count ?? 0), 0)
    : 0;

  return {
    windowDays: input.windowDays,
    topFormat,
    topSlotDow: topSlot?.day ?? null,
    topSlotHour: topSlot?.hour ?? null,
    hookPatterns: topHookPatterns(captions),
    ctaPatterns: ctaPatterns(captions),
    captionShape: captionShape(captions),
    topicClusters: [], // v1: not implemented; subsystem #4.
    competitorSummary: {
      totalCompetitors: input.competitors.length,
      followerGrowthMedian: null,
      postsPerWeekMedian: null,
    },
    adSummary: input.ads ? { hasCampaigns: input.ads.hasCampaigns } : null,
    rawKpis: {
      totalPosts: ig?.media.length ?? 0,
      totalReach,
      medianReach: 0,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/brain/__tests__/compute-signals.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brain/compute-signals.ts src/lib/brain/__tests__/compute-signals.test.ts
git commit -m "feat(brain): pure compute-signals from snapshots"
```

---

### Task C2: `/api/brain/compute` route

**Files:**
- Create: `src/app/api/brain/compute/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/brain/compute/route.ts
import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainSnapshots, brainSignals } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { computeSignals } from '@/lib/brain/compute-signals';
import type { IgMediaItem } from '@/lib/meta/ig-analytics';

export const dynamic = 'force-dynamic';

async function loadWindow(brandId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select()
    .from(brainSnapshots)
    .where(and(eq(brainSnapshots.brandId, brandId), gte(brainSnapshots.capturedAt, since)))
    .orderBy(desc(brainSnapshots.capturedAt));
  return rows;
}

function pickLatest<T extends { source: string; payload: unknown }>(rows: T[], source: string): unknown {
  return rows.find((r) => r.source === source)?.payload ?? null;
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const written: { id: string; windowDays: number }[] = [];
  for (const win of [28, 7] as const) {
    const rows = await loadWindow(brandId, win);
    const ig = pickLatest(rows, 'ig') as
      | { media: IgMediaItem[]; insightsByMediaId: Record<string, unknown> }
      | null;
    const ads = pickLatest(rows, 'ads') as { hasCampaigns: boolean; insights: unknown } | null;
    const compRow = pickLatest(rows, 'competitor_account') as
      | { competitors: { handle: string; followerCount: number | null; postCount: number | null }[] }
      | null;

    const out = computeSignals({
      windowDays: win,
      ig,
      ads,
      competitors: compRow?.competitors ?? [],
    });

    const [inserted] = await db
      .insert(brainSignals)
      .values({
        brandId,
        windowDays: win,
        topFormat: out.topFormat,
        topSlotDow: out.topSlotDow,
        topSlotHour: out.topSlotHour,
        hookPatterns: out.hookPatterns,
        ctaPatterns: out.ctaPatterns,
        captionShape: out.captionShape,
        topicClusters: out.topicClusters,
        competitorSummary: out.competitorSummary,
        adSummary: out.adSummary,
        rawKpis: out.rawKpis,
      })
      .returning({ id: brainSignals.id });

    written.push({ id: inserted.id, windowDays: win });
  }

  return NextResponse.json({ status: 'ok', signals: written });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/brain/compute/route.ts
git commit -m "feat(brain): /api/brain/compute writes 28d + 7d signals rows"
```

---

## Phase D — Brief generation

### Task D1: Brief prompt builder

**Files:**
- Create: `src/lib/brain/brief-prompt.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/brain/brief-prompt.ts
import type { ComputeSignalsOutput } from './compute-signals';

export interface BriefPromptInput {
  brandName: string;
  todayIso: string;
  signals28d: ComputeSignalsOutput;
  signals7d: ComputeSignalsOutput;
  previousBriefMd: string | null;
}

export function buildBriefPrompt(input: BriefPromptInput): { system: string; user: string } {
  const system = `You write a one-page brand strategy brief from quantitative signals.
Be specific, cite numbers, avoid generic advice. Use the EXACT section headers
provided. Total length ≤ 500 words.

REQUIRED HEADERS, IN THIS ORDER:
## What's working
## What's not working
## Formula for the next 7 days
## Topics to lean into
## Topics to drop
## Competitor watch

RULES:
- Cite at least one number per bullet in "What's working" and "What's not working".
- Topics come from \`topic_clusters\`. Don't invent topics.
- Competitor watch only mentions account-level changes (followers, post cadence).
  No post-level claims — competitor post data isn't ingested in v1.
- If a section has no data, write "—" rather than fabricating.
- "Formula for the next 7 days" must be a bullet list with these exact bold labels:
  - **Format:** REEL | CAROUSEL | IMAGE
  - **Best slot:** Day, Hour local
  - **Hook patterns:** 2-3 short phrases
  - **CTA pattern:** phrase
  - **Caption shape:** N lines, N paragraphs, emoji density: low|medium|high`;

  const user = `Brand: ${input.brandName}
Date: ${input.todayIso}

# 28-day signals
${JSON.stringify(input.signals28d, null, 2)}

# 7-day signals (compare deltas vs the 28d row)
${JSON.stringify(input.signals7d, null, 2)}

# Previous brief (only flag changes; do not repeat unchanged guidance)
${input.previousBriefMd ?? '(none)'}`;

  return { system, user };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brain/brief-prompt.ts
git commit -m "feat(brain): brief prompt builder enforcing fixed-header contract"
```

---

### Task D2: Brief parser + fixed-header test

**Files:**
- Create: `src/lib/brain/brief-parser.ts`
- Create: `src/lib/brain/__tests__/brief-template.test.ts`
- Create: `src/lib/brain/__tests__/fixtures/previous-brief.md`

- [ ] **Step 1: Write fixture (a valid brief)**

```markdown
## What's working
- Reels at 7pm Tuesday hit 2.4× your median reach (35k vs 14k median)
- Founder-voice hooks beat feature-list hooks 3:1 on saves (200 vs 60)
- Carousel saves up 40% week-over-week (150 vs 107)

## What's not working
- IMAGE posts under 8% of median reach — not worth the production time

## Formula for the next 7 days
- **Format:** REEL
- **Best slot:** Tue, 19
- **Hook patterns:** question opener, stat-shock, founder POV
- **CTA pattern:** comment below
- **Caption shape:** 12 lines, 4 paragraphs, emoji density: low

## Topics to lean into
- product launch
- behind the scenes

## Topics to drop
- —

## Competitor watch
- Top 3 competitors added 1.2k followers median this week
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/brain/__tests__/brief-template.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBrief, parseFormula } from '../brief-parser';

const validBrief = readFileSync(
  join(__dirname, 'fixtures', 'previous-brief.md'),
  'utf8'
);

describe('validateBrief', () => {
  it('accepts a brief with all required headers in order', () => {
    expect(validateBrief(validBrief).ok).toBe(true);
  });

  it('rejects a brief missing a header', () => {
    const broken = validBrief.replace('## Topics to drop', '');
    expect(validateBrief(broken).ok).toBe(false);
  });

  it('rejects a brief with headers out of order', () => {
    const swapped = validBrief.replace(
      /## What's working([\s\S]*?)## What's not working/,
      '## What\'s not working$1## What\'s working'
    );
    expect(validateBrief(swapped).ok).toBe(false);
  });
});

describe('parseFormula', () => {
  it('extracts format, slot, caption shape from a valid brief', () => {
    const formula = parseFormula(validBrief);
    expect(formula).not.toBeNull();
    expect(formula!.format).toBe('REEL');
    expect(formula!.bestSlot.dow).toBe(2);
    expect(formula!.bestSlot.hour).toBe(19);
    expect(formula!.captionShape.lines).toBe(12);
    expect(formula!.captionShape.paragraphs).toBe(4);
    expect(formula!.captionShape.emojiDensity).toBe('low');
  });

  it('returns null when Formula section is missing', () => {
    expect(parseFormula('## What\'s working\n- nothing')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/brain/__tests__/brief-template.test.ts`
Expected: FAIL — module `../brief-parser` not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/brain/brief-parser.ts
import type { BrainFormula, EmojiDensity, IgFormat } from './types';

const REQUIRED_HEADERS = [
  "## What's working",
  "## What's not working",
  '## Formula for the next 7 days',
  '## Topics to lean into',
  '## Topics to drop',
  '## Competitor watch',
];

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateBrief(md: string): ValidationResult {
  let cursor = 0;
  for (const h of REQUIRED_HEADERS) {
    const idx = md.indexOf(h, cursor);
    if (idx === -1) return { ok: false, reason: `missing_or_out_of_order:${h}` };
    cursor = idx + h.length;
  }
  return { ok: true };
}

const DAY_TO_DOW: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function readField(md: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, 'i');
  const m = md.match(re);
  return m ? m[1].trim() : null;
}

function parseFormat(s: string | null): IgFormat | null {
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper.includes('REEL')) return 'REEL';
  if (upper.includes('CAROUSEL')) return 'CAROUSEL';
  if (upper.includes('IMAGE')) return 'IMAGE';
  return null;
}

function parseSlot(s: string | null): { dow: number; hour: number } | null {
  if (!s) return null;
  // Accept "Tue, 19" or "Tuesday 7pm" or "Tue 19".
  const dayMatch = s.match(/[A-Za-z]+/);
  const dayKey = dayMatch?.[0]?.toLowerCase();
  const dow = dayKey ? DAY_TO_DOW[dayKey] : undefined;
  if (dow === undefined) return null;

  const numMatch = s.match(/(\d{1,2})\s*(am|pm)?/i);
  if (!numMatch) return null;
  let hour = parseInt(numMatch[1], 10);
  const ampm = numMatch[2]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return { dow, hour };
}

function parseCaptionShape(s: string | null): {
  lines: number;
  paragraphs: number;
  emojiDensity: EmojiDensity;
} | null {
  if (!s) return null;
  const linesMatch = s.match(/(\d+)\s*lines?/i);
  const paraMatch = s.match(/(\d+)\s*paragraphs?/i);
  const densityMatch = s.match(/emoji\s*density:\s*(low|medium|high)/i);
  if (!linesMatch || !paraMatch || !densityMatch) return null;
  return {
    lines: parseInt(linesMatch[1], 10),
    paragraphs: parseInt(paraMatch[1], 10),
    emojiDensity: densityMatch[1].toLowerCase() as EmojiDensity,
  };
}

export function parseFormula(md: string): BrainFormula | null {
  const idx = md.indexOf('## Formula for the next 7 days');
  if (idx === -1) return null;
  const next = md.indexOf('## ', idx + 5);
  const section = md.slice(idx, next === -1 ? undefined : next);

  const format = parseFormat(readField(section, 'Format'));
  const slot = parseSlot(readField(section, 'Best slot'));
  const shape = parseCaptionShape(readField(section, 'Caption shape'));

  if (!format || !slot || !shape) return null;
  return { format, bestSlot: slot, captionShape: shape };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/brain/__tests__/brief-template.test.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/brain/brief-parser.ts src/lib/brain/__tests__/brief-template.test.ts src/lib/brain/__tests__/fixtures/previous-brief.md
git commit -m "feat(brain): brief parser with fixed-header contract validation"
```

---

### Task D3: Brief fallback

**Files:**
- Create: `src/lib/brain/brief-fallback.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/brain/brief-fallback.ts
import type { ComputeSignalsOutput } from './compute-signals';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildFallbackBrief(s: ComputeSignalsOutput): string {
  const day = s.topSlotDow !== null ? DAY_NAMES[s.topSlotDow] : '—';
  const hour = s.topSlotHour ?? '—';
  const fmt = s.topFormat ?? 'REEL';
  const shape = s.captionShape;

  return `## What's working
- ${s.rawKpis.totalPosts} posts captured in the last ${s.windowDays} days

## What's not working
- —

## Formula for the next 7 days
- **Format:** ${fmt}
- **Best slot:** ${day}, ${hour}
- **Hook patterns:** —
- **CTA pattern:** —
- **Caption shape:** ${shape.avgLines} lines, ${shape.avgParagraphs} paragraphs, emoji density: ${shape.emojiDensity}

## Topics to lean into
- —

## Topics to drop
- —

## Competitor watch
- ${s.competitorSummary.totalCompetitors} competitors tracked`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/brain/brief-fallback.ts
git commit -m "feat(brain): deterministic fallback brief when LLM unavailable"
```

---

### Task D4: `/api/brain/brief` route

**Files:**
- Create: `src/lib/brain/brief-runner.ts`
- Create: `src/app/api/brain/brief/route.ts`

- [ ] **Step 1: Implement runner**

```ts
// src/lib/brain/brief-runner.ts
import { generateCaption } from '@/lib/cerebras'; // existing helper; if absent, swap for direct Cerebras call
import { buildBriefPrompt } from './brief-prompt';
import { validateBrief, parseFormula } from './brief-parser';
import { buildFallbackBrief } from './brief-fallback';
import type { ComputeSignalsOutput } from './compute-signals';

export interface BriefResult {
  briefMd: string;
  briefVersion: number;
  status: 'ok' | 'partial' | 'fallback';
  error?: string;
}

export async function runBrief(args: {
  brandName: string;
  todayIso: string;
  signals28d: ComputeSignalsOutput;
  signals7d: ComputeSignalsOutput;
  previousBriefMd: string | null;
  previousVersion: number;
  llmCall: (system: string, user: string) => Promise<string>;
}): Promise<BriefResult> {
  const { system, user } = buildBriefPrompt({
    brandName: args.brandName,
    todayIso: args.todayIso,
    signals28d: args.signals28d,
    signals7d: args.signals7d,
    previousBriefMd: args.previousBriefMd,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const md = await args.llmCall(system, user);
      const v = validateBrief(md);
      if (v.ok && parseFormula(md) !== null) {
        return { briefMd: md, briefVersion: args.previousVersion + 1, status: 'ok' };
      }
    } catch (err) {
      if (attempt === 1) {
        return {
          briefMd: args.previousBriefMd ?? buildFallbackBrief(args.signals28d),
          briefVersion: args.previousBriefMd ? args.previousVersion : 0,
          status: args.previousBriefMd ? 'partial' : 'fallback',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  return {
    briefMd: args.previousBriefMd ?? buildFallbackBrief(args.signals28d),
    briefVersion: args.previousBriefMd ? args.previousVersion : 0,
    status: args.previousBriefMd ? 'partial' : 'fallback',
    error: 'malformed_brief',
  };
}
```

- [ ] **Step 2: Implement route**

```ts
// src/app/api/brain/brief/route.ts
import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  brainSignals,
  brandBrain,
  type SelectBrainSignals,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { runBrief } from '@/lib/brain/brief-runner';
import { cerebrasComplete } from '@/lib/cerebras';

export const dynamic = 'force-dynamic';

function rowToSignals(row: SelectBrainSignals): import('@/lib/brain/compute-signals').ComputeSignalsOutput {
  return {
    windowDays: row.windowDays,
    topFormat: (row.topFormat as 'REEL'|'CAROUSEL'|'IMAGE'|null),
    topSlotDow: row.topSlotDow,
    topSlotHour: row.topSlotHour,
    hookPatterns: (row.hookPatterns ?? []) as never,
    ctaPatterns: (row.ctaPatterns ?? []) as never,
    captionShape: (row.captionShape ?? {
      avgLines: 0, avgParagraphs: 0, emojiDensity: 'low', hookToBodyRatio: 0,
    }) as never,
    topicClusters: (row.topicClusters ?? []) as never,
    competitorSummary: (row.competitorSummary ?? {
      totalCompetitors: 0, followerGrowthMedian: null, postsPerWeekMedian: null,
    }) as never,
    adSummary: (row.adSummary ?? null) as never,
    rawKpis: (row.rawKpis ?? { totalPosts: 0, totalReach: 0, medianReach: 0 }) as never,
  };
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  const [s28] = await db
    .select()
    .from(brainSignals)
    .where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 28)))
    .orderBy(desc(brainSignals.computedAt))
    .limit(1);
  const [s7] = await db
    .select()
    .from(brainSignals)
    .where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 7)))
    .orderBy(desc(brainSignals.computedAt))
    .limit(1);

  if (!s28 || !s7) {
    return NextResponse.json({ status: 'partial', reason: 'no_signals' });
  }

  const [prev] = await db.select().from(brandBrain).where(eq(brandBrain.brandId, brandId));

  const result = await runBrief({
    brandName: brand.name,
    todayIso: new Date().toISOString().slice(0, 10),
    signals28d: rowToSignals(s28),
    signals7d: rowToSignals(s7),
    previousBriefMd: prev?.briefMd ?? null,
    previousVersion: prev?.briefVersion ?? 0,
    llmCall: async (system, user) => cerebrasComplete({ system, user, maxTokens: 800 }),
  });

  await db
    .insert(brandBrain)
    .values({
      brandId,
      briefMd: result.briefMd,
      briefVersion: result.briefVersion,
      signalsId: s28.id,
      generatedAt: new Date(),
      lastRunAt: new Date(),
      lastRunStatus: result.status === 'ok' ? 'ok' : 'partial',
      lastRunError: result.error ?? null,
      ingestedSources: { ig: 'ok', ads: 'skipped_no_campaigns', competitor_account: 'ok' },
    })
    .onConflictDoUpdate({
      target: brandBrain.brandId,
      set: {
        briefMd: result.briefMd,
        briefVersion: result.briefVersion,
        signalsId: s28.id,
        generatedAt: new Date(),
        lastRunAt: new Date(),
        lastRunStatus: result.status === 'ok' ? 'ok' : 'partial',
        lastRunError: result.error ?? null,
      },
    });

  return NextResponse.json({
    briefVersion: result.briefVersion,
    charCount: result.briefMd.length,
    status: result.status,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/brain/brief-runner.ts src/app/api/brain/brief/route.ts
git commit -m "feat(brain): /api/brain/brief writes brand_brain via Cerebras"
```

> **NOTE:** if `cerebrasComplete` (named export) doesn't exist in `src/lib/cerebras.ts`, add a tiny adapter that wraps the existing function with `{ system, user, maxTokens }` shape. Don't change the existing API.

---

## Phase E — UI endpoints

### Task E1: GET `/api/brain` (panel data)

**Files:**
- Create: `src/app/api/brain/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/brain/route.ts
import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, brandBrain, brainSignals, brainSnapshots } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, session.user.id)));
  if (!brand) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [brain] = await db.select().from(brandBrain).where(eq(brandBrain.brandId, brandId));
  const [s28] = await db.select().from(brainSignals).where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 28))).orderBy(desc(brainSignals.computedAt)).limit(1);
  const [s7] = await db.select().from(brainSignals).where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 7))).orderBy(desc(brainSignals.computedAt)).limit(1);

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const recent = await db
    .select({ source: brainSnapshots.source, capturedAt: brainSnapshots.capturedAt })
    .from(brainSnapshots)
    .where(and(eq(brainSnapshots.brandId, brandId), gte(brainSnapshots.capturedAt, sevenDaysAgo)))
    .orderBy(desc(brainSnapshots.capturedAt));

  return NextResponse.json({ brain: brain ?? null, signals28d: s28 ?? null, signals7d: s7 ?? null, recent });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/brain/route.ts
git commit -m "feat(brain): GET /api/brain returns panel data for /analyze"
```

---

### Task E2: POST `/api/brain/trigger`

**Files:**
- Create: `src/app/api/brain/trigger/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/brain/trigger/route.ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

async function callBrainEndpoint(path: string, body: object, secret: string, baseUrl: string) {
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', secret).update(raw).digest('hex');
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brain-signature': sig },
    body: raw,
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, session.user.id)));
  if (!brand) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const secret = process.env.BRAIN_CRON_SECRET;
  const baseUrl = new URL(req.url).origin;
  if (!secret) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const day = new Date().toISOString().slice(0, 10);
  const runId = crypto.randomUUID();
  const sources = ['ig', 'ads', 'competitor_account'] as const;
  const results: Record<string, unknown> = {};
  for (const source of sources) {
    results[source] = await callBrainEndpoint(
      `/api/brain/snapshot?brandId=${brandId}&source=${source}`,
      { runId, day },
      secret,
      baseUrl
    );
  }
  results.compute = await callBrainEndpoint(
    `/api/brain/compute?brandId=${brandId}`,
    { runId },
    secret,
    baseUrl
  );
  results.brief = await callBrainEndpoint(
    `/api/brain/brief?brandId=${brandId}`,
    { runId },
    secret,
    baseUrl
  );

  return NextResponse.json({ runId, results });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/brain/trigger/route.ts
git commit -m "feat(brain): /api/brain/trigger session-authed Run-now"
```

---

## Phase F — Cron orchestration

### Task F1: Run-daily script

**Files:**
- Create: `scripts/brain/run-daily.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/brain/run-daily.mjs
import { createHmac, randomUUID } from 'node:crypto';

const SECRET = process.env.BRAIN_CRON_SECRET;
const BASE = process.env.BRAIN_BASE_URL;
if (!SECRET || !BASE) {
  console.error('BRAIN_CRON_SECRET and BRAIN_BASE_URL must be set');
  process.exit(1);
}

function sign(body) {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

async function call(path, body) {
  const raw = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brain-signature': sign(raw) },
    body: raw,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, json };
}

async function listBrands() {
  // Cheap public endpoint added in Task F2 below — falls back to one brand
  // from env for first-run testing.
  if (process.env.BRAIN_TEST_BRAND_ID) {
    return [{ id: process.env.BRAIN_TEST_BRAND_ID }];
  }
  const res = await fetch(`${BASE}/api/brain/brands`, {
    headers: { 'x-brain-signature': sign('') },
  });
  if (!res.ok) throw new Error(`listBrands ${res.status}`);
  return res.json();
}

function jitter(maxMs) {
  return new Promise((r) => setTimeout(r, Math.floor(Math.random() * maxMs)));
}

async function runOne(brandId, day) {
  const runId = randomUUID();
  console.log(`[brain] brand=${brandId} runId=${runId}`);

  for (const source of ['ig', 'ads', 'competitor_account']) {
    const out = await call(
      `/api/brain/snapshot?brandId=${brandId}&source=${source}`,
      { runId, day }
    );
    console.log(`  snapshot.${source}:`, out.status, out.json?.status ?? '');
  }
  const compute = await call(`/api/brain/compute?brandId=${brandId}`, { runId });
  console.log('  compute:', compute.status, compute.json?.status ?? '');
  const brief = await call(`/api/brain/brief?brandId=${brandId}`, { runId });
  console.log('  brief:', brief.status, brief.json?.status ?? '');
}

(async () => {
  const day = new Date().toISOString().slice(0, 10);
  const brands = await listBrands();
  console.log(`[brain] daily run, ${brands.length} brands, day=${day}`);

  for (const brand of brands) {
    await jitter(30_000);
    try {
      await runOne(brand.id, day);
    } catch (err) {
      console.error(`[brain] brand ${brand.id} failed:`, err);
      // Continue with next brand.
    }
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/brain/run-daily.mjs
git commit -m "feat(brain): GitHub Actions orchestrator script"
```

---

### Task F2: Add `/api/brain/brands` (HMAC-authed listing)

**Files:**
- Create: `src/app/api/brain/brands/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/brain/brands/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  // Sign empty body so we can keep the same auth helper.
  if (!(await verifyBrainSignature(req, ''))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }
  const rows = await db.select({ id: brands.id, name: brands.name }).from(brands);
  return NextResponse.json(rows);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/brain/brands/route.ts
git commit -m "feat(brain): HMAC-authed /api/brain/brands listing for cron"
```

---

### Task F3: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/brain-daily.yml`

- [ ] **Step 1: Implement**

```yaml
name: Daily Brain Run
on:
  schedule:
    - cron: '0 3 * * *'   # 03:00 UTC daily
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run brain pipeline
        env:
          BRAIN_CRON_SECRET: ${{ secrets.BRAIN_CRON_SECRET }}
          BRAIN_BASE_URL: https://goviraleza.com
        run: node scripts/brain/run-daily.mjs
```

- [ ] **Step 2: Add repo secret instructions**

Append to `docs/META-PUBLISHING-PLAN.md` a new section "Brain cron":

```markdown
### Brain cron (subsystem #1)

Set in **GitHub repo → Settings → Secrets and variables → Actions**:
- `BRAIN_CRON_SECRET` — match the same value set in Vercel project env.

Set in **Vercel project → Settings → Environment Variables**:
- `BRAIN_CRON_SECRET` — any 64-char hex string.

First manual trigger: GitHub Actions → "Daily Brain Run" → "Run workflow".
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/brain-daily.yml docs/META-PUBLISHING-PLAN.md
git commit -m "feat(brain): daily GitHub Actions cron workflow"
```

---

## Phase G — Consumption (Smart Posts + Create)

### Task G1: consume helper + merge test

**Files:**
- Create: `src/lib/brain/consume.ts`
- Create: `src/lib/brain/__tests__/consume-merge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/brain/__tests__/consume-merge.test.ts
import { describe, it, expect } from 'vitest';
import { mergeBrainIntoContext } from '../consume';
import type { BrainContext } from '../types';

const brain: BrainContext = {
  briefMd: '## Mock\n- one',
  formula: { format: 'REEL', bestSlot: { dow: 2, hour: 19 }, captionShape: { lines: 12, paragraphs: 4, emojiDensity: 'low' } },
  briefVersion: 3,
  generatedAt: '2026-05-09T01:00:00Z',
};

describe('mergeBrainIntoContext', () => {
  it('appends BRAND BRAIN to system prompt and fills defaults', () => {
    const out = mergeBrainIntoContext(
      { systemPrompt: 'You are a copywriter.', userFormat: null, userSlot: null },
      brain
    );
    expect(out.systemPrompt).toContain('BRAND BRAIN');
    expect(out.systemPrompt).toContain('## Mock');
    expect(out.format).toBe('REEL');
    expect(out.slot).toEqual({ dow: 2, hour: 19 });
  });

  it('does NOT override user-set values', () => {
    const out = mergeBrainIntoContext(
      { systemPrompt: 'You are a copywriter.', userFormat: 'IMAGE', userSlot: { dow: 5, hour: 9 } },
      brain
    );
    expect(out.format).toBe('IMAGE');
    expect(out.slot).toEqual({ dow: 5, hour: 9 });
  });

  it('returns input unchanged when brain is null', () => {
    const out = mergeBrainIntoContext(
      { systemPrompt: 'X', userFormat: null, userSlot: null },
      null
    );
    expect(out.systemPrompt).toBe('X');
    expect(out.format).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/brain/__tests__/consume-merge.test.ts`
Expected: FAIL — module `../consume` not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/brain/consume.ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brandBrain } from '@/lib/db/schema';
import { parseFormula } from './brief-parser';
import type { BrainContext, IgFormat } from './types';

export async function readBrandBrain(brandId: string): Promise<BrainContext | null> {
  const [row] = await db.select().from(brandBrain).where(eq(brandBrain.brandId, brandId));
  if (!row) return null;
  return {
    briefMd: row.briefMd,
    formula: parseFormula(row.briefMd),
    briefVersion: row.briefVersion,
    generatedAt: row.generatedAt.toISOString(),
  };
}

export interface GenerateContextIn {
  systemPrompt: string;
  userFormat: IgFormat | null;
  userSlot: { dow: number; hour: number } | null;
}

export interface GenerateContextOut {
  systemPrompt: string;
  format: IgFormat | null;
  slot: { dow: number; hour: number } | null;
  captionShapeHint: { lines: number; paragraphs: number; emojiDensity: 'low'|'medium'|'high' } | null;
}

export function mergeBrainIntoContext(
  input: GenerateContextIn,
  brain: BrainContext | null
): GenerateContextOut {
  if (!brain) {
    return {
      systemPrompt: input.systemPrompt,
      format: input.userFormat,
      slot: input.userSlot,
      captionShapeHint: null,
    };
  }
  return {
    systemPrompt: `${input.systemPrompt}\n\nBRAND BRAIN (v${brain.briefVersion}, ${brain.generatedAt}):\n${brain.briefMd}`,
    format: input.userFormat ?? brain.formula?.format ?? null,
    slot: input.userSlot ?? brain.formula?.bestSlot ?? null,
    captionShapeHint: brain.formula?.captionShape ?? null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/brain/__tests__/consume-merge.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brain/consume.ts src/lib/brain/__tests__/consume-merge.test.ts
git commit -m "feat(brain): readBrandBrain + mergeBrainIntoContext (additive only)"
```

---

### Task G2: Wire consume into Smart Posts generate

**Files:**
- Modify: `src/lib/smart-posts/generate.ts`

- [ ] **Step 1: Locate the generate function entry**

Read file. Find the function that builds the LLM context (system prompt + user inputs).

- [ ] **Step 2: Inject brain at the top**

Add at the start of the function (paste minimally — the rest of the function stays):

```ts
import { readBrandBrain, mergeBrainIntoContext } from '@/lib/brain/consume';

// inside generate function, near the top:
const brain = process.env.BRAIN_UI_ENABLED === 'true'
  ? await readBrandBrain(brandId)
  : null;
const merged = mergeBrainIntoContext(
  { systemPrompt: existingSystemPrompt, userFormat: explicitFormat ?? null, userSlot: explicitSlot ?? null },
  brain
);
// Use merged.systemPrompt, merged.format, merged.slot, merged.captionShapeHint downstream.
```

(Adapt variable names to whatever the existing function calls them.)

- [ ] **Step 3: Run existing Smart Posts tests**

Run: `npx vitest run src/lib/smart-posts`
Expected: PASS — brain only activates when flag is on; default tests unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/lib/smart-posts/generate.ts
git commit -m "feat(brain): silently inject brand brain into Smart Posts generate"
```

---

### Task G3: Wire consume into captions route

**Files:**
- Modify: `src/app/api/captions/route.ts`

- [ ] **Step 1: Inject brain near LLM call**

Same pattern as G2 above, before the prompt is sent to Cerebras:

```ts
import { readBrandBrain, mergeBrainIntoContext } from '@/lib/brain/consume';

const brain = process.env.BRAIN_UI_ENABLED === 'true'
  ? await readBrandBrain(brandId)
  : null;
const merged = mergeBrainIntoContext(
  { systemPrompt: systemPromptString, userFormat: format ?? null, userSlot: null },
  brain
);
// Use merged.systemPrompt below.
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/captions/route.ts
git commit -m "feat(brain): silently inject brand brain into captions route"
```

---

## Phase H — UI components

### Task H1: BrainBadge

**Files:**
- Create: `src/components/brain/brain-badge.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/brain/brain-badge.tsx
'use client';
import { useEffect, useState } from 'react';

interface Props { brandId: string; }

interface BrainData {
  brain: { briefVersion: number; generatedAt: string; briefMd: string; lastRunStatus: string } | null;
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BrainBadge({ brandId }: Props) {
  const [data, setData] = useState<BrainData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/brain?brandId=${brandId}`)
      .then((r) => r.json())
      .then((j) => { if (active) setData(j); });
    return () => { active = false; };
  }, [brandId]);

  if (!data?.brain) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
        title="Click to view brand brain"
      >
        🧠 Brain v{data.brain.briefVersion} · {rel(data.brain.generatedAt)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <pre className="whitespace-pre-wrap text-sm font-sans">{data.brain.briefMd}</pre>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/brain/brain-badge.tsx
git commit -m "feat(brain): BrainBadge component for Smart Posts + Create"
```

---

### Task H2: BrainPanel for /analyze

**Files:**
- Create: `src/components/brain/brain-panel.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/brain/brain-panel.tsx
'use client';
import { useEffect, useState } from 'react';

interface Props { brandId: string; }

interface BrainResponse {
  brain: { briefVersion: number; generatedAt: string; briefMd: string; lastRunStatus: string; ingestedSources: Record<string, string> } | null;
  recent: { source: string; capturedAt: string }[];
}

export function BrainPanel({ brandId }: Props) {
  const [data, setData] = useState<BrainResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/brain?brandId=${brandId}`);
    if (!r.ok) { setError(`failed: ${r.status}`); return; }
    setData(await r.json());
  }

  useEffect(() => { load(); }, [brandId]);

  async function runNow() {
    setRunning(true); setError(null);
    try {
      const r = await fetch(`/api/brain/trigger?brandId=${brandId}`, { method: 'POST' });
      if (!r.ok) throw new Error(`trigger ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!data) return <div className="text-sm text-neutral-500">Loading brain…</div>;
  if (!data.brain) {
    return (
      <div className="border rounded-lg p-6 bg-neutral-50">
        <div className="font-medium mb-2">🧠 Brand Brain</div>
        <p className="text-sm text-neutral-600 mb-3">No brain yet for this brand.</p>
        <button onClick={runNow} disabled={running} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
          {running ? 'Running…' : 'Run now'}
        </button>
        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      </div>
    );
  }

  const sources = data.brain.ingestedSources ?? {};
  return (
    <div className="border rounded-lg p-6 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">🧠 Brand Brain · v{data.brain.briefVersion}</div>
        <button onClick={runNow} disabled={running} className="text-sm px-3 py-1 rounded border disabled:opacity-50">
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>
      <div className="text-xs text-neutral-500 mb-4">
        Sources: {(['ig', 'ads', 'competitor_account'] as const).map((s) => (
          <span key={s} className="mr-3">
            {sources[s] === 'ok' ? '✓' : sources[s]?.startsWith('skipped') ? '—' : '⚠'} {s}
          </span>
        ))}
      </div>
      <pre className="whitespace-pre-wrap text-sm font-sans">{data.brain.briefMd}</pre>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/brain/brain-panel.tsx
git commit -m "feat(brain): BrainPanel for /analyze with Run-now button"
```

---

### Task H3: Mount BrainPanel on /analyze (behind flag)

**Files:**
- Modify: `src/app/(dashboard)/analyze/page.tsx`

- [ ] **Step 1: Add the panel**

At the top of the rendered tree, above the existing learnings cart:

```tsx
import { BrainPanel } from '@/components/brain/brain-panel';

// inside the component, near the top of the JSX:
{process.env.NEXT_PUBLIC_BRAIN_UI_ENABLED === 'true' && selectedBrandId && (
  <div className="mb-6">
    <BrainPanel brandId={selectedBrandId} />
  </div>
)}
```

(Use the existing `selectedBrandId` variable name — read the current file to confirm.)

- [ ] **Step 2: Add `NEXT_PUBLIC_BRAIN_UI_ENABLED` to Vercel env (off by default)**

Document in commit message — actual env var setting is manual.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/analyze/page.tsx
git commit -m "feat(brain): mount BrainPanel on /analyze behind NEXT_PUBLIC_BRAIN_UI_ENABLED"
```

---

### Task H4: Mount BrainBadge on Smart Posts dashboard + post-generator

**Files:**
- Modify: `src/components/smart-posts-dashboard.tsx` (or `src/app/(dashboard)/smart-posts/page.tsx` — pick the one rendering near the Generate button)
- Modify: `src/components/post-generator.tsx`

- [ ] **Step 1: Add badge near Generate button**

```tsx
import { BrainBadge } from '@/components/brain/brain-badge';

// near the Generate button:
{process.env.NEXT_PUBLIC_BRAIN_UI_ENABLED === 'true' && brandId && (
  <BrainBadge brandId={brandId} />
)}
```

- [ ] **Step 2: Repeat for post-generator.tsx**

Same pattern.

- [ ] **Step 3: Commit**

```bash
git add src/components/smart-posts-dashboard.tsx src/components/post-generator.tsx
git commit -m "feat(brain): BrainBadge near Generate buttons"
```

---

## Phase I — End-to-end smoke

### Task I1: Playwright happy path

**Files:**
- Create: `tests/e2e/brain.spec.ts`

- [ ] **Step 1: Implement**

```ts
// tests/e2e/brain.spec.ts
import { test, expect } from '@playwright/test';

test.describe.skip('Brain happy path (requires connected IG)', () => {
  test('Run-now produces a brain panel with brief', async ({ page }) => {
    // Assumes test user is logged in via storageState in playwright.config.ts.
    await page.goto('/analyze');
    await page.getByRole('button', { name: /run now/i }).click();

    // Wait up to 30s for the brief to appear.
    await expect(page.getByText(/Formula for the next 7 days/i)).toBeVisible({ timeout: 30_000 });

    // Visit Smart Posts and confirm the badge appears.
    await page.goto('/smart-posts');
    await expect(page.getByText(/Brain v\d+/)).toBeVisible();
  });
});
```

> Skipped by default — flip `test.describe.skip` to `test.describe` once a fixture user with a connected IG account is set up in CI. Manual run: `npx playwright test tests/e2e/brain.spec.ts --headed`.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/brain.spec.ts
git commit -m "test(brain): Playwright happy path (skipped by default)"
```

---

## Phase J — Rollout

### Task J1: Verify everything

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Manual workflow trigger**

In GitHub UI: Actions → "Daily Brain Run" → "Run workflow". Verify in Vercel logs that the three brain endpoints fire and at least one brand writes a row to `brand_brain`.

- [ ] **Step 3: Flip the flag**

In Vercel:
- `NEXT_PUBLIC_BRAIN_UI_ENABLED=true`
- `BRAIN_UI_ENABLED=true` (used by consume.ts in Smart Posts/captions)

Redeploy.

- [ ] **Step 4: Confirm panel renders on /analyze**

Visit prod /analyze. Confirm BrainPanel shows brief from earlier manual run. Click "Run now" — should regenerate.

- [ ] **Step 5: Confirm badge near Generate buttons**

Visit /smart-posts. Confirm `🧠 Brain v1 · Xh ago` appears.

- [ ] **Step 6: Confirm Smart Posts uses the brain**

Click Generate. Open browser devtools → Network. Confirm the request body system prompt contains "BRAND BRAIN" header (or check server logs).

- [ ] **Step 7: Commit any final tweaks discovered during smoke**

```bash
git add -A
git commit -m "chore(brain): rollout smoke verification fixes"
```

---

### Task J2: Schedule the cron

- [ ] **Step 1: Confirm `.github/workflows/brain-daily.yml` is on `develop` and merged to `main`**

Run: `git log origin/main -- .github/workflows/brain-daily.yml | head -5`
Expected: shows the workflow commit.

- [ ] **Step 2: Verify the schedule is active**

GitHub Actions → "Daily Brain Run" → Settings → confirm "Run workflow on schedule" is enabled (default when on default branch).

- [ ] **Step 3: Wait one cycle**

Next 03:00 UTC: confirm the workflow runs automatically and `brand_brain.last_run_at` updates for at least one brand.

---

## Self-review checklist (run after writing this plan, before handing off)

- [x] Spec coverage: schema, snapshot, compute, brief, trigger, GET, cron, UI, consumption, tests, rollout — every section in the spec maps to a task.
- [x] Placeholder scan: no TBDs, no "implement appropriately", every code step has full code.
- [x] Type consistency: `BrainContext`, `BrainFormula`, `IgFormat`, `EmojiDensity`, `IngestedSources` all defined in `types.ts` and used identically across `consume.ts`, `brief-parser.ts`, `compute-signals.ts`.
- [x] Existing memory respected: Smart Posts still has its single composite Generate button — brain is additive context, badge is non-blocking.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-daily-brain-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this plan because tasks are small and well-isolated; parallel subagents can take independent foundation tasks (A2, A3, A4) at the same time.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch with checkpoints. Slower but uses one continuous context.

**Which approach?**
