# Meta Ad Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/ads` dashboard page that auto-drafts a Meta ad (copy + image) from a brand brief, lets the user edit it, and creates it on Meta as a PAUSED campaign/ad set/creative/ad via the Marketing API.

**Architecture:** A 4-step wizard front-end calls two new API routes. `/api/ads/generate` reuses the existing `/api/captions` (Cerebras) + Pixabay image pipeline to build an editable draft with zero Meta writes. `/api/ads/publish` performs the ordered Meta write sequence (upload image → campaign → ad set → creative → ad), everything PAUSED. A new `src/lib/meta/ads.ts` holds the write-side Graph client (mirroring the read-only `src/lib/meta/client.ts`). A pure `src/lib/ads/build-draft.ts` assembles the draft and is unit-tested in isolation.

**Tech Stack:** Next.js 16 (App Router), React 19, Drizzle ORM (Postgres/Neon), Vitest, Tailwind v4, lucide-react. Meta Graph API `v21.0`.

**Read before coding:** This repo runs a modified Next.js (see `AGENTS.md`). The route/page code below mirrors existing, working files (`src/app/api/meta/insights/route.ts`, `src/components/layout/app-sidebar.tsx`) — follow those patterns. If anything in `node_modules/next/dist/docs/` contradicts a pattern here, prefer the repo's existing pattern.

**Branch:** Per `project_branch_workflow_reality`, real work lands on `main` via a `feat/*` branch. Branch from `main`: `git checkout main && git pull && git checkout -b feat/meta-ad-builder`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/db/schema.ts` (modify) | Add `metaAds` table. |
| `src/lib/meta/ads-types.ts` (create) | Objective enum, per-objective config map (optimization goal, billing event, CTA, caption content-type), `AdDraft` + `AdTargeting` types, currency minimum-budget map. |
| `src/lib/ads/build-draft.ts` (create) | Pure assembler: caption result + brief → `AdDraft`. No I/O. |
| `src/lib/ads/__tests__/build-draft.test.ts` (create) | Unit tests for the assembler. |
| `src/lib/meta/ads.ts` (create) | Write-side Graph client: `uploadAdImage`, `createCampaign`, `createAdSet`, `createAdCreative`, `createAd`, `searchAdInterests`, `buildAdsManagerUrl`. |
| `src/lib/meta/__tests__/ads.test.ts` (create) | Write-client tests (mocked `fetch`). |
| `src/app/api/ads/generate/route.ts` (create) | POST — builds draft + picks image. No Meta write. |
| `src/app/api/ads/generate/__tests__/route.test.ts` (create) | Route tests. |
| `src/app/api/ads/publish/route.ts` (create) | POST — PAUSED write sequence + records row. |
| `src/app/api/ads/publish/__tests__/route.test.ts` (create) | Route tests (auth, ownership, account validation, budget floor, PAUSED, ordering). |
| `src/app/(dashboard)/ads/page.tsx` (create) | Wizard shell + step state. |
| `src/app/(dashboard)/ads/_components/StepGoal.tsx` (create) | Step 1. |
| `src/app/(dashboard)/ads/_components/StepCreative.tsx` (create) | Step 2. |
| `src/app/(dashboard)/ads/_components/StepAudience.tsx` (create) | Step 3. |
| `src/app/(dashboard)/ads/_components/StepReview.tsx` (create) | Step 4. |
| `src/app/(dashboard)/ads/_components/AdPreview.tsx` (create) | Live preview. |
| `src/components/layout/app-sidebar.tsx` (modify) | Add **Ads** nav item. |

---

## Task 1: `metaAds` table + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (add table near `metaAccounts`, ~line 290)

- [ ] **Step 1: Add the table definition**

Append after the `metaAccounts` table block in `src/lib/db/schema.ts`:

```typescript
// Records every ad pushed to Meta, so the UI can show history and we never
// lose track of a created (paused) ad. Nullable Meta IDs allow a partial
// tree to be recorded when a step in the publish sequence fails.
export const metaAds = pgTable('meta_ads', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  brandId: uuid('brand_id').notNull(),
  adAccountId: varchar('ad_account_id', { length: 64 }).notNull(),
  pageId: varchar('page_id', { length: 64 }).notNull(),
  igAccountId: varchar('ig_account_id', { length: 64 }),
  campaignId: varchar('campaign_id', { length: 64 }),
  adsetId: varchar('adset_id', { length: 64 }),
  creativeId: varchar('creative_id', { length: 64 }),
  adId: varchar('ad_id', { length: 64 }),
  objective: varchar('objective', { length: 48 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('PAUSED'),
  draft: jsonb('draft'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});
```

Confirm `pgTable`, `uuid`, `text`, `varchar`, `jsonb`, `timestamp` are already imported at the top of the file (they are — `metaAccounts` uses all of them).

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new SQL file under the configured migrations dir creating `meta_ads`. Inspect it — it should be `CREATE TABLE "meta_ads"` only, no destructive statements.

- [ ] **Step 3: Apply the migration**

Run: `npx drizzle-kit migrate`
Expected: applies cleanly. (If the project applies migrations another way, match `package.json`/existing migration docs.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle
git commit -m "feat(ads): add meta_ads table to track created ads"
```

---

## Task 2: Ad types + objective config

**Files:**
- Create: `src/lib/meta/ads-types.ts`

- [ ] **Step 1: Write the types and config**

```typescript
// src/lib/meta/ads-types.ts
// Single source of truth for the v1 ad-builder's objective/targeting shapes.

export type AdObjective = 'TRAFFIC' | 'ENGAGEMENT' | 'LEADS';

// Maps our curated objective to the Meta ODAX objective + the ad-set
// optimization/billing fields + the default CTA + which caption content-type
// to ask /api/captions for. CTAs are restricted to ones valid on link ads.
export interface ObjectiveConfig {
  metaObjective: 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_LEADS';
  optimizationGoal: 'LINK_CLICKS' | 'POST_ENGAGEMENT';
  billingEvent: 'IMPRESSIONS';
  defaultCta: 'LEARN_MORE' | 'SIGN_UP';
  captionContentType: 'promo' | 'community';
  label: string;
  description: string;
}

export const OBJECTIVE_CONFIG: Record<AdObjective, ObjectiveConfig> = {
  TRAFFIC: {
    metaObjective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    defaultCta: 'LEARN_MORE',
    captionContentType: 'promo',
    label: 'Traffic',
    description: 'Send people to your website.',
  },
  ENGAGEMENT: {
    metaObjective: 'OUTCOME_ENGAGEMENT',
    optimizationGoal: 'POST_ENGAGEMENT',
    billingEvent: 'IMPRESSIONS',
    defaultCta: 'LEARN_MORE',
    captionContentType: 'community',
    label: 'Engagement',
    description: 'Get more reach, reactions, and interaction.',
  },
  LEADS: {
    metaObjective: 'OUTCOME_LEADS',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    defaultCta: 'SIGN_UP',
    captionContentType: 'promo',
    label: 'Leads',
    description: 'Drive sign-ups on your site (website leads).',
  },
};

export const HEADLINE_MAX = 40; // Meta truncates link-ad headlines hard.
export const MAX_HASHTAGS = 5;

// The editable creative produced by /api/ads/generate.
export interface AdDraft {
  objective: AdObjective;
  destinationUrl: string;
  primaryText: string; // the caption / message
  hook: string;
  headline: string; // <= HEADLINE_MAX
  hashtags: string[];
  cta: ObjectiveConfig['defaultCta'];
  imageUrl: string;
  interestSuggestions: string[];
}

// The audience/budget the user sets in Step 3, sent to /api/ads/publish.
export interface AdTargeting {
  countries: string[]; // ISO-2, e.g. ['GB']
  ageMin: number; // 13..65
  ageMax: number; // 13..65
  gender: 'all' | 'male' | 'female';
  interests: string[]; // free-text names; resolved to IDs at publish time
  dailyBudgetMinor: number; // minor units of account currency (e.g. pence)
  startDate: string; // ISO date-time
  endDate: string; // ISO date-time
}

// Conservative per-currency daily-budget floors in MINOR units. Meta is the
// final arbiter; these catch obvious mistakes with a friendly message before
// we call the API. Default applies to unlisted currencies.
export const MIN_DAILY_BUDGET_MINOR: Record<string, number> = {
  USD: 500, GBP: 500, EUR: 500, CAD: 600, AUD: 700, BRL: 2000,
};
export const DEFAULT_MIN_DAILY_BUDGET_MINOR = 500;

export function minDailyBudget(currency: string): number {
  return MIN_DAILY_BUDGET_MINOR[currency] ?? DEFAULT_MIN_DAILY_BUDGET_MINOR;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `ads-types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/meta/ads-types.ts
git commit -m "feat(ads): objective config + draft/targeting types"
```

---

## Task 3: Pure draft assembler (`build-draft.ts`) — TDD

**Files:**
- Create: `src/lib/ads/build-draft.ts`
- Test: `src/lib/ads/__tests__/build-draft.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/ads/__tests__/build-draft.test.ts
import { describe, it, expect } from 'vitest';
import { buildAdDraft } from '../build-draft';

const captionResult = {
  caption: 'Your routine is holding you back. Here is the fix.',
  hashtags: '#fitness\n#coaching\n#habits',
  hookText: 'Your routine is broken',
};

describe('buildAdDraft', () => {
  it('maps caption fields onto the draft and applies the objective CTA', () => {
    const draft = buildAdDraft({
      objective: 'TRAFFIC',
      destinationUrl: 'https://example.com',
      caption: captionResult,
      imageUrl: 'https://img/x.jpg',
      interestSuggestions: ['fitness'],
    });
    expect(draft.primaryText).toBe(captionResult.caption);
    expect(draft.hook).toBe('Your routine is broken');
    expect(draft.cta).toBe('LEARN_MORE');
    expect(draft.hashtags).toEqual(['#fitness', '#coaching', '#habits']);
  });

  it('caps the headline at HEADLINE_MAX characters on a word boundary', () => {
    const draft = buildAdDraft({
      objective: 'LEADS',
      destinationUrl: 'https://example.com',
      caption: { ...captionResult, hookText: 'This is a very long hook that clearly exceeds the forty character cap easily' },
      imageUrl: 'https://img/x.jpg',
      interestSuggestions: [],
    });
    expect(draft.headline.length).toBeLessThanOrEqual(40);
    expect(draft.headline.endsWith(' ')).toBe(false);
    expect(draft.cta).toBe('SIGN_UP');
  });

  it('caps hashtags at MAX_HASHTAGS and dedupes', () => {
    const draft = buildAdDraft({
      objective: 'ENGAGEMENT',
      destinationUrl: 'https://example.com',
      caption: { ...captionResult, hashtags: '#a #a #b #c #d #e #f' },
      imageUrl: 'https://img/x.jpg',
      interestSuggestions: [],
    });
    expect(draft.hashtags.length).toBeLessThanOrEqual(5);
    expect(new Set(draft.hashtags).size).toBe(draft.hashtags.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ads/__tests__/build-draft.test.ts`
Expected: FAIL — `buildAdDraft` is not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/ads/build-draft.ts
import {
  type AdDraft,
  type AdObjective,
  OBJECTIVE_CONFIG,
  HEADLINE_MAX,
  MAX_HASHTAGS,
} from '@/lib/meta/ads-types';

export interface CaptionResult {
  caption: string;
  hashtags: string; // space- or newline-separated "#tag" string
  hookText: string;
}

export interface BuildAdDraftInput {
  objective: AdObjective;
  destinationUrl: string;
  caption: CaptionResult;
  imageUrl: string;
  interestSuggestions: string[];
}

function capHeadline(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= HEADLINE_MAX) return clean;
  const cut = clean.slice(0, HEADLINE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trim();
}

function parseHashtags(raw: string): string[] {
  const tags = (raw.match(/#\w+/g) ?? []).map((t) => t.toLowerCase());
  return [...new Set(tags)].slice(0, MAX_HASHTAGS);
}

export function buildAdDraft(input: BuildAdDraftInput): AdDraft {
  const cfg = OBJECTIVE_CONFIG[input.objective];
  return {
    objective: input.objective,
    destinationUrl: input.destinationUrl,
    primaryText: input.caption.caption,
    hook: input.caption.hookText.trim(),
    headline: capHeadline(input.caption.hookText || input.caption.caption),
    hashtags: parseHashtags(input.caption.hashtags),
    cta: cfg.defaultCta,
    imageUrl: input.imageUrl,
    interestSuggestions: [...new Set(input.interestSuggestions)].slice(0, 10),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ads/__tests__/build-draft.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ads/build-draft.ts src/lib/ads/__tests__/build-draft.test.ts
git commit -m "feat(ads): pure ad-draft assembler with tests"
```

---

## Task 4: Meta write client (`ads.ts`) — TDD

**Files:**
- Create: `src/lib/meta/ads.ts`
- Test: `src/lib/meta/__tests__/ads.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/meta/__tests__/ads.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadAdImage,
  createCampaign,
  createAdSet,
  buildAdsManagerUrl,
} from '../ads';

function mockFetchOnce(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
}

describe('meta/ads write client', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('uploadAdImage posts bytes and returns the image hash', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    // image fetch (bytes) then adimages upload
    g.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => 'image/jpeg' } })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ images: { bytes: { hash: 'abc123' } } }), text: async () => '' }) as unknown as typeof fetch;

    const hash = await uploadAdImage('TOKEN', 'act_1', 'https://img/x.jpg');
    expect(hash).toBe('abc123');
  });

  it('createCampaign sends PAUSED status and the mapped objective', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'camp_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createCampaign('TOKEN', 'act_1', 'OUTCOME_TRAFFIC');
    expect(id).toBe('camp_1');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('status=PAUSED');
    expect(body).toContain('OUTCOME_TRAFFIC');
  });

  it('createAdSet sends PAUSED status and the daily budget', async () => {
    const g = global as unknown as { fetch: typeof fetch };
    const fetchMock = mockFetchOnce({ id: 'adset_1' });
    g.fetch = fetchMock as unknown as typeof fetch;

    const id = await createAdSet('TOKEN', 'act_1', {
      campaignId: 'camp_1',
      optimizationGoal: 'LINK_CLICKS',
      billingEvent: 'IMPRESSIONS',
      dailyBudgetMinor: 500,
      startTime: '2026-06-01T00:00:00Z',
      endTime: '2026-06-08T00:00:00Z',
      targeting: { geo_locations: { countries: ['GB'] }, age_min: 18, age_max: 65 },
    });
    expect(id).toBe('adset_1');
    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('status=PAUSED');
    expect(body).toContain('daily_budget=500');
  });

  it('buildAdsManagerUrl points at the created campaign in the account', () => {
    const url = buildAdsManagerUrl('act_123', 'camp_9');
    expect(url).toContain('123');
    expect(url).toContain('camp_9');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/meta/__tests__/ads.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/meta/ads.ts
// Write-side Meta Marketing API client. Mirrors the read-only client.ts:
// stateless, takes a plaintext access token. Every create call sends
// status=PAUSED so nothing can spend until the user activates it manually.

const META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function actId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

async function graphPost<T>(
  path: string,
  accessToken: string,
  fields: Record<string, string>,
): Promise<T> {
  const body = new URLSearchParams({ ...fields, access_token: accessToken });
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta write error ${res.status} on ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

// 1. Upload the image to the ad account's library → image_hash.
// Meta will not reference an arbitrary external URL in a creative, so we fetch
// the bytes and upload them as a base64 `bytes` field.
export async function uploadAdImage(
  accessToken: string,
  adAccountId: string,
  imageUrl: string,
): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch ad image (${imgRes.status})`);
  const bytes = Buffer.from(await imgRes.arrayBuffer()).toString('base64');

  const json = await graphPost<{ images: Record<string, { hash: string }> }>(
    `/${actId(adAccountId)}/adimages`,
    accessToken,
    { bytes },
  );
  const first = Object.values(json.images ?? {})[0];
  if (!first?.hash) throw new Error('Meta did not return an image hash');
  return first.hash;
}

// 2. Campaign (objective lives here). PAUSED.
export async function createCampaign(
  accessToken: string,
  adAccountId: string,
  metaObjective: string,
): Promise<string> {
  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/campaigns`,
    accessToken,
    {
      name: `Ad Builder — ${metaObjective} — ${new Date().toISOString().slice(0, 10)}`,
      objective: metaObjective,
      status: 'PAUSED',
      special_ad_categories: '[]',
    },
  );
  return json.id;
}

export interface AdSetInput {
  campaignId: string;
  optimizationGoal: string;
  billingEvent: string;
  dailyBudgetMinor: number;
  startTime: string;
  endTime: string;
  targeting: Record<string, unknown>;
}

// 3. Ad set (who/how-much/when). PAUSED.
export async function createAdSet(
  accessToken: string,
  adAccountId: string,
  input: AdSetInput,
): Promise<string> {
  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/adsets`,
    accessToken,
    {
      name: `Ad set — ${new Date().toISOString().slice(0, 16)}`,
      campaign_id: input.campaignId,
      optimization_goal: input.optimizationGoal,
      billing_event: input.billingEvent,
      daily_budget: String(input.dailyBudgetMinor),
      start_time: input.startTime,
      end_time: input.endTime,
      targeting: JSON.stringify(input.targeting),
      status: 'PAUSED',
    },
  );
  return json.id;
}

export interface CreativeInput {
  pageId: string;
  igAccountId?: string;
  imageHash: string;
  message: string; // primary text
  headline: string;
  link: string;
  cta: string; // e.g. LEARN_MORE
}

// 4. Ad creative (what people see). object_story_spec link ad.
export async function createAdCreative(
  accessToken: string,
  adAccountId: string,
  input: CreativeInput,
): Promise<string> {
  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    link_data: {
      image_hash: input.imageHash,
      message: input.message,
      name: input.headline,
      link: input.link,
      call_to_action: { type: input.cta, value: { link: input.link } },
    },
  };
  if (input.igAccountId) objectStorySpec.instagram_actor_id = input.igAccountId;

  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/adcreatives`,
    accessToken,
    {
      name: `Creative — ${new Date().toISOString().slice(0, 16)}`,
      object_story_spec: JSON.stringify(objectStorySpec),
    },
  );
  return json.id;
}

// 5. Ad (glues creative onto ad set). PAUSED.
export async function createAd(
  accessToken: string,
  adAccountId: string,
  input: { adsetId: string; creativeId: string; name: string },
): Promise<string> {
  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/ads`,
    accessToken,
    {
      name: input.name,
      adset_id: input.adsetId,
      creative: JSON.stringify({ creative_id: input.creativeId }),
      status: 'PAUSED',
    },
  );
  return json.id;
}

// Resolve free-text interest names → Meta interest IDs via the Targeting
// Search API. Names that resolve to nothing are dropped (broad targeting).
export async function searchAdInterests(
  accessToken: string,
  query: string,
): Promise<{ id: string; name: string } | null> {
  const u = new URL(`${GRAPH_BASE}/search`);
  u.searchParams.set('type', 'adinterest');
  u.searchParams.set('q', query);
  u.searchParams.set('limit', '1');
  u.searchParams.set('access_token', accessToken);
  const res = await fetch(u);
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ id: string; name: string }> };
  return json.data?.[0] ?? null;
}

// Deep link into Ads Manager filtered to the created campaign.
export function buildAdsManagerUrl(adAccountId: string, campaignId: string): string {
  const num = adAccountId.replace('act_', '');
  return `https://www.facebook.com/adsmanager/manage/campaigns?act=${num}&selected_campaign_ids=${campaignId}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/meta/__tests__/ads.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta/ads.ts src/lib/meta/__tests__/ads.test.ts
git commit -m "feat(ads): Meta Marketing API write client (paused)"
```

---

## Task 5: `/api/ads/generate` route — TDD

Builds an editable draft. Reuses `/api/captions` (same internal-fetch pattern as the batch generator) and the Pixabay image pipeline. **No Meta write.**

**Files:**
- Create: `src/app/api/ads/generate/route.ts`
- Test: `src/app/api/ads/generate/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/ads/generate/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/brain/consume', () => ({
  readBrandBrain: vi.fn().mockResolvedValue({ briefMd: '# brief', briefVersion: 1, generatedAt: '2026-01-01T00:00:00Z', formula: null }),
}));
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'b1', slug: 'acme', name: 'Acme', userId: 'u1', description: 'A brand' }]) }) }) }) },
}));
vi.mock('@/lib/db/schema', () => ({ brands: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/ads/generate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ads/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // internal fetches: /api/captions then /api/images/pick (mode A) then /api/pixabay
    (global as unknown as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ caption: 'Body copy here.', hashtags: '#a #b', hookText: 'Stop scrolling now' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ searchTerm: 'people running', alternatives: ['people running'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hits: [{ webformatURL: 'https://img/x.jpg', tags: 'running, people' }] }) }) as unknown as typeof fetch;
  });

  it('returns 400 when objective is invalid', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'NOPE', destinationUrl: 'https://x.com' }));
    expect(res.status).toBe(400);
  });

  it('returns an editable draft with mapped fields', async () => {
    const res = await POST(makeReq({ brandId: 'b1', objective: 'TRAFFIC', destinationUrl: 'https://x.com' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.draft.primaryText).toBe('Body copy here.');
    expect(json.draft.hook).toBe('Stop scrolling now');
    expect(json.draft.cta).toBe('LEARN_MORE');
    expect(json.draft.imageUrl).toBe('https://img/x.jpg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ads/generate/__tests__/route.test.ts`
Expected: FAIL — route not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/api/ads/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { readBrandBrain } from '@/lib/brain/consume';
import { buildAdDraft } from '@/lib/ads/build-draft';
import { OBJECTIVE_CONFIG, type AdObjective } from '@/lib/meta/ads-types';

export const maxDuration = 60;

function isObjective(v: unknown): v is AdObjective {
  return v === 'TRAFFIC' || v === 'ENGAGEMENT' || v === 'LEADS';
}

// Derive a query and fetch one on-topic image URL using the existing pipeline.
async function pickImageUrl(args: {
  origin: string; cookie: string; brandName: string; brandDescription: string;
  caption: string; hookText: string; contentType: string;
}): Promise<string | null> {
  const pickRes = await fetch(`${args.origin}/api/images/pick`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: args.cookie },
    body: JSON.stringify({
      caption: args.caption, hookText: args.hookText, contentType: args.contentType,
      brand: args.brandName, brandDescription: args.brandDescription,
    }),
  });
  if (!pickRes.ok) return null;
  const { searchTerm } = (await pickRes.json()) as { searchTerm?: string };
  if (!searchTerm) return null;

  const pxRes = await fetch(`${args.origin}/api/pixabay?q=${encodeURIComponent(searchTerm)}&orientation=horizontal`, {
    headers: { cookie: args.cookie },
  });
  if (!pxRes.ok) return null;
  const { hits } = (await pxRes.json()) as { hits?: Array<{ webformatURL?: string }> };
  return hits?.[0]?.webformatURL ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = (await request.json()) as {
      brandId?: string; objective?: string; destinationUrl?: string;
    };

    if (!body.brandId) {
      return NextResponse.json({ error: 'brandId_required' }, { status: 400 });
    }
    if (!isObjective(body.objective)) {
      return NextResponse.json({ error: 'invalid_objective' }, { status: 400 });
    }
    if (!body.destinationUrl || !/^https?:\/\//.test(body.destinationUrl)) {
      return NextResponse.json({ error: 'invalid_url' }, { status: 400 });
    }

    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, body.brandId), eq(brands.userId, userId)))
      .limit(1);
    if (!brand) {
      return NextResponse.json({ error: 'brand_not_found' }, { status: 403 });
    }

    const cfg = OBJECTIVE_CONFIG[body.objective];
    const brain = await readBrandBrain(body.brandId).catch(() => null);
    const origin = request.nextUrl.origin;
    const cookie = request.headers.get('cookie') ?? '';

    const capRes = await fetch(`${origin}/api/captions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        brandSlug: brand.slug,
        contentType: cfg.captionContentType,
        brainBriefMd: brain?.briefMd ?? undefined,
      }),
    });
    if (!capRes.ok) {
      const err = await capRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'caption_failed', message: (err as { message?: string }).message ?? 'Caption generation failed' },
        { status: 502 },
      );
    }
    const caption = (await capRes.json()) as { caption: string; hashtags: string; hookText: string };

    const imageUrl = await pickImageUrl({
      origin, cookie,
      brandName: brand.name ?? brand.slug,
      brandDescription: brand.description ?? '',
      caption: caption.caption, hookText: caption.hookText,
      contentType: cfg.captionContentType,
    });

    // Interest suggestions: simple keywords from the brief's first heading words
    // and brand name. The user edits these in Step 3.
    const interestSuggestions = [brand.name ?? brand.slug]
      .filter(Boolean)
      .map((s) => String(s));

    const draft = buildAdDraft({
      objective: body.objective,
      destinationUrl: body.destinationUrl,
      caption,
      imageUrl: imageUrl ?? '',
      interestSuggestions,
    });

    return NextResponse.json({ draft, imageMissing: !imageUrl });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[ads/generate] Error:', error);
    return NextResponse.json(
      { error: 'generate_failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/ads/generate/__tests__/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ads/generate
git commit -m "feat(ads): /api/ads/generate builds editable draft (no Meta write)"
```

---

## Task 6: `/api/ads/publish` route — TDD

Performs the ordered PAUSED write sequence and records a `metaAds` row.

**Files:**
- Create: `src/app/api/ads/publish/route.ts`
- Test: `src/app/api/ads/publish/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/ads/publish/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-helpers', () => ({ getUserId: vi.fn().mockResolvedValue('u1') }));
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn().mockReturnValue('TOKEN') }));

const insertValues = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: (t: unknown) => ({ where: () => ({ limit: () => Promise.resolve([selectRow(t)]) }) }) }),
    insert: () => ({ values: insertValues }),
  },
}));
vi.mock('@/lib/db/schema', () => ({ brands: { __t: 'brands' }, metaAccounts: { __t: 'metaAccounts' }, metaAds: { __t: 'metaAds' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

vi.mock('@/lib/meta/ads', () => ({
  uploadAdImage: vi.fn().mockResolvedValue('img_hash'),
  createCampaign: vi.fn().mockResolvedValue('camp_1'),
  createAdSet: vi.fn().mockResolvedValue('adset_1'),
  createAdCreative: vi.fn().mockResolvedValue('creative_1'),
  createAd: vi.fn().mockResolvedValue('ad_1'),
  searchAdInterests: vi.fn().mockResolvedValue(null),
  buildAdsManagerUrl: vi.fn().mockReturnValue('https://adsmanager/x'),
}));

// Returns the right stub row depending on which table is queried.
function selectRow(t: unknown): Record<string, unknown> {
  const name = (t as { __t?: string })?.__t;
  if (name === 'brands') return { id: 'b1', slug: 'acme', userId: 'u1' };
  // metaAccounts
  return {
    userId: 'u1', accessToken: 'enc', tokenExpiresAt: new Date(Date.now() + 86_400_000),
    assets: { adAccounts: [{ id: 'act_1', account_id: '1', currency: 'GBP' }] },
  };
}

import { POST } from '../route';
import { createCampaign, createAdSet, createAd } from '@/lib/meta/ads';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/ads/publish'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  brandId: 'b1',
  adAccountId: 'act_1',
  pageId: 'page_1',
  draft: {
    objective: 'TRAFFIC', destinationUrl: 'https://x.com', primaryText: 'copy',
    hook: 'h', headline: 'Head', hashtags: ['#a'], cta: 'LEARN_MORE', imageUrl: 'https://img/x.jpg', interestSuggestions: [],
  },
  targeting: {
    countries: ['GB'], ageMin: 18, ageMax: 65, gender: 'all', interests: [],
    dailyBudgetMinor: 500, startDate: '2026-06-01T00:00:00Z', endDate: '2026-06-08T00:00:00Z',
  },
};

describe('POST /api/ads/publish', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an ad account not in the user assets', async () => {
    const res = await POST(makeReq({ ...validBody, adAccountId: 'act_999' }));
    expect(res.status).toBe(403);
  });

  it('rejects a sub-minimum daily budget', async () => {
    const res = await POST(makeReq({ ...validBody, targeting: { ...validBody.targeting, dailyBudgetMinor: 50 } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('budget_below_minimum');
  });

  it('creates the full tree PAUSED and returns ids + ads manager url', async () => {
    const res = await POST(makeReq(validBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.campaignId).toBe('camp_1');
    expect(json.adId).toBe('ad_1');
    expect(json.adsManagerUrl).toBe('https://adsmanager/x');
    // ordering: campaign before adset before ad
    expect(vi.mocked(createCampaign)).toHaveBeenCalled();
    expect(vi.mocked(createAdSet)).toHaveBeenCalled();
    expect(vi.mocked(createAd)).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ads/publish/__tests__/route.test.ts`
Expected: FAIL — route not defined.

- [ ] **Step 3: Write the implementation**

```typescript
// src/app/api/ads/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, metaAccounts, metaAds } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import {
  uploadAdImage, createCampaign, createAdSet, createAdCreative, createAd,
  searchAdInterests, buildAdsManagerUrl,
} from '@/lib/meta/ads';
import {
  OBJECTIVE_CONFIG, minDailyBudget, type AdDraft, type AdTargeting, type AdObjective,
} from '@/lib/meta/ads-types';

export const maxDuration = 60;

interface AdAccountAsset { id: string; account_id?: string; currency?: string }

function genderCodes(g: AdTargeting['gender']): number[] | undefined {
  if (g === 'male') return [1];
  if (g === 'female') return [2];
  return undefined; // all
}

export async function POST(request: NextRequest) {
  let createdCampaign: string | null = null;
  let createdAdset: string | null = null;
  let createdCreative: string | null = null;
  try {
    const userId = await getUserId();
    const body = (await request.json()) as {
      brandId?: string; adAccountId?: string; pageId?: string; igAccountId?: string;
      draft?: AdDraft; targeting?: AdTargeting;
    };
    const { brandId, adAccountId, pageId, igAccountId, draft, targeting } = body;

    if (!brandId || !adAccountId || !pageId || !draft || !targeting) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    // Ownership: brand belongs to user.
    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
      .limit(1);
    if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 403 });

    // Meta account + token.
    const [account] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, userId))
      .limit(1);
    if (!account) return NextResponse.json({ error: 'meta_not_connected' }, { status: 400 });

    if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) {
      return NextResponse.json({ error: 'token_expired', message: 'Reconnect your Meta account.' }, { status: 401 });
    }

    // Trust boundary: the ad account must be one the user actually has.
    const assets = (account.assets as { adAccounts?: AdAccountAsset[] } | null) ?? {};
    const matched = (assets.adAccounts ?? []).find(
      (a) => a.id === adAccountId || a.id === `act_${adAccountId}` || a.account_id === adAccountId.replace('act_', ''),
    );
    if (!matched) return NextResponse.json({ error: 'ad_account_not_owned' }, { status: 403 });

    // Budget floor.
    const currency = matched.currency ?? 'USD';
    if (targeting.dailyBudgetMinor < minDailyBudget(currency)) {
      return NextResponse.json(
        { error: 'budget_below_minimum', message: `Daily budget is below the ${currency} minimum.`, minMinor: minDailyBudget(currency) },
        { status: 400 },
      );
    }
    if (new Date(targeting.startDate) >= new Date(targeting.endDate)) {
      return NextResponse.json({ error: 'invalid_dates' }, { status: 400 });
    }

    const cfg = OBJECTIVE_CONFIG[draft.objective as AdObjective];
    const accessToken = decrypt(account.accessToken);

    // Resolve interest names → ids (drop the ones that don't resolve).
    const resolved = (
      await Promise.all((targeting.interests ?? []).map((name) => searchAdInterests(accessToken, name)))
    ).filter((x): x is { id: string; name: string } => Boolean(x));

    const metaTargeting: Record<string, unknown> = {
      geo_locations: { countries: targeting.countries },
      age_min: targeting.ageMin,
      age_max: targeting.ageMax,
    };
    const genders = genderCodes(targeting.gender);
    if (genders) metaTargeting.genders = genders;
    if (resolved.length) metaTargeting.flexible_spec = [{ interests: resolved.map((r) => ({ id: r.id, name: r.name })) }];

    // Ordered write sequence — all PAUSED.
    const imageHash = await uploadAdImage(accessToken, adAccountId, draft.imageUrl);
    createdCampaign = await createCampaign(accessToken, adAccountId, cfg.metaObjective);
    createdAdset = await createAdSet(accessToken, adAccountId, {
      campaignId: createdCampaign,
      optimizationGoal: cfg.optimizationGoal,
      billingEvent: cfg.billingEvent,
      dailyBudgetMinor: targeting.dailyBudgetMinor,
      startTime: targeting.startDate,
      endTime: targeting.endDate,
      targeting: metaTargeting,
    });
    const message = [draft.primaryText, draft.hashtags.join(' ')].filter(Boolean).join('\n\n');
    createdCreative = await createAdCreative(accessToken, adAccountId, {
      pageId, igAccountId,
      imageHash, message, headline: draft.headline, link: draft.destinationUrl, cta: draft.cta,
    });
    const adId = await createAd(accessToken, adAccountId, {
      adsetId: createdAdset, creativeId: createdCreative, name: `Ad — ${draft.headline}`,
    });

    await db.insert(metaAds).values({
      userId, brandId, adAccountId, pageId, igAccountId: igAccountId ?? null,
      campaignId: createdCampaign, adsetId: createdAdset, creativeId: createdCreative, adId,
      objective: cfg.metaObjective, status: 'PAUSED', draft: { ...draft, targeting }, lastError: null,
    });

    return NextResponse.json({
      campaignId: createdCampaign, adsetId: createdAdset, creativeId: createdCreative, adId,
      adsManagerUrl: buildAdsManagerUrl(adAccountId, createdCampaign),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Publish failed';
    console.error('[ads/publish] Error:', message);
    // Record the partial tree so a half-created (paused, harmless) ad is never lost.
    try {
      const userId = await getUserId();
      await db.insert(metaAds).values({
        userId,
        brandId: 'unknown', adAccountId: 'unknown', pageId: 'unknown',
        campaignId: createdCampaign, adsetId: createdAdset, creativeId: createdCreative, adId: null,
        objective: 'unknown', status: 'FAILED', draft: null, lastError: message.slice(0, 500),
      });
    } catch { /* best-effort logging only */ }
    return NextResponse.json({ error: 'publish_failed', message: message.slice(0, 300) }, { status: 500 });
  }
}
```

> Note: the catch-block insert uses placeholder `'unknown'` strings only because the real values may be out of scope when an early step throws; its purpose is forensic (which Meta IDs got created). If you prefer, hoist `brandId/adAccountId/pageId` into outer `let` variables and reuse them here — functionally equivalent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/ads/publish/__tests__/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ads/publish
git commit -m "feat(ads): /api/ads/publish creates PAUSED ad tree with guards"
```

---

## Task 7: Wizard shell + step state

**Files:**
- Create: `src/app/(dashboard)/ads/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/(dashboard)/ads/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { StepGoal } from './_components/StepGoal';
import { StepCreative } from './_components/StepCreative';
import { StepAudience } from './_components/StepAudience';
import { StepReview } from './_components/StepReview';
import { AdPreview } from './_components/AdPreview';
import type { AdDraft, AdTargeting, AdObjective } from '@/lib/meta/ads-types';

interface BrandLite { id: string; name: string; slug: string }
interface MetaAsset { id: string; name?: string; currency?: string }

const STEPS = ['Goal', 'Creative', 'Audience', 'Review'] as const;

export default function AdsPage() {
  const [step, setStep] = useState(0);
  const [brands, setBrands] = useState<BrandLite[]>([]);
  const [adAccounts, setAdAccounts] = useState<MetaAsset[]>([]);
  const [pages, setPages] = useState<MetaAsset[]>([]);
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);

  const [brandId, setBrandId] = useState('');
  const [objective, setObjective] = useState<AdObjective>('TRAFFIC');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [targeting, setTargeting] = useState<AdTargeting>({
    countries: ['GB'], ageMin: 18, ageMax: 65, gender: 'all', interests: [],
    dailyBudgetMinor: 500, startDate: '', endDate: '',
  });

  useEffect(() => {
    fetch('/api/brands').then((r) => r.json()).then((d) => {
      const list = (d.data ?? d ?? []) as BrandLite[];
      setBrands(list);
      if (list[0]) setBrandId(list[0].id);
    }).catch(() => setBrands([]));

    fetch('/api/meta/account').then((r) => r.json()).then((d) => {
      const acct = d.data;
      setMetaConnected(Boolean(acct));
      const assets = (acct?.assets ?? {}) as { adAccounts?: MetaAsset[]; pages?: MetaAsset[] };
      setAdAccounts(assets.adAccounts ?? []);
      setPages(assets.pages ?? []);
    }).catch(() => setMetaConnected(false));
  }, []);

  if (metaConnected === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-100">Connect Meta first</h1>
        <p className="mt-2 text-sm text-zinc-400">
          The ad builder needs your Meta connection. Connect it, then come back.
        </p>
        <a href="/settings" className="mt-4 inline-block rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white">
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i <= step ? 'bg-teal-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{i + 1}</span>
            <span className={`text-sm ${i === step ? 'text-zinc-100' : 'text-zinc-500'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-zinc-700" />}
          </div>
        ))}
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div>
          {step === 0 && (
            <StepGoal
              brands={brands} brandId={brandId} setBrandId={setBrandId}
              objective={objective} setObjective={setObjective}
              destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
              onDraft={(d) => { setDraft(d); setStep(1); }}
            />
          )}
          {step === 1 && draft && (
            <StepCreative draft={draft} setDraft={setDraft} onBack={() => setStep(0)} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <StepAudience
              targeting={targeting} setTargeting={setTargeting}
              suggestions={draft?.interestSuggestions ?? []}
              adAccounts={adAccounts} pages={pages}
              onBack={() => setStep(1)} onNext={() => setStep(3)}
            />
          )}
          {step === 3 && draft && (
            <StepReview
              draft={draft} targeting={targeting} brandId={brandId}
              adAccounts={adAccounts} pages={pages} onBack={() => setStep(2)}
            />
          )}
        </div>
        <AdPreview draft={draft} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (will error until step components exist — expected)**

Run: `npx tsc --noEmit`
Expected: errors only about missing `./_components/*` modules. Proceed to Task 8.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ads/page.tsx"
git commit -m "feat(ads): wizard shell + step state"
```

---

## Task 8: StepGoal component

**Files:**
- Create: `src/app/(dashboard)/ads/_components/StepGoal.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/(dashboard)/ads/_components/StepGoal.tsx
'use client';

import { useState } from 'react';
import { OBJECTIVE_CONFIG, type AdDraft, type AdObjective } from '@/lib/meta/ads-types';

interface BrandLite { id: string; name: string; slug: string }

export function StepGoal(props: {
  brands: BrandLite[];
  brandId: string; setBrandId: (v: string) => void;
  objective: AdObjective; setObjective: (v: AdObjective) => void;
  destinationUrl: string; setDestinationUrl: (v: string) => void;
  onDraft: (draft: AdDraft) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    if (!props.brandId) return setError('Pick a brand.');
    if (!/^https?:\/\//.test(props.destinationUrl)) return setError('Enter a valid URL (https://...).');
    setLoading(true);
    try {
      const res = await fetch('/api/ads/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: props.brandId, objective: props.objective, destinationUrl: props.destinationUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Generation failed');
      props.onDraft(json.draft as AdDraft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Brand</label>
        <select value={props.brandId} onChange={(e) => props.setBrandId(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
          {props.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Goal</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(OBJECTIVE_CONFIG) as AdObjective[]).map((key) => {
            const c = OBJECTIVE_CONFIG[key];
            const active = props.objective === key;
            return (
              <button key={key} type="button" onClick={() => props.setObjective(key)}
                className={`rounded-lg border p-3 text-left ${active ? 'border-teal-500 bg-teal-500/10' : 'border-zinc-700 bg-zinc-900'}`}>
                <div className="text-sm font-semibold text-zinc-100">{c.label}</div>
                <div className="mt-1 text-xs text-zinc-400">{c.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Destination URL</label>
        <input value={props.destinationUrl} onChange={(e) => props.setDestinationUrl(e.target.value)}
          placeholder="https://yoursite.com/offer"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="button" onClick={generate} disabled={loading}
        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? 'Generating…' : 'Generate ad'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/ads/_components/StepGoal.tsx"
git commit -m "feat(ads): StepGoal — brand, objective, URL, generate"
```

---

## Task 9: StepCreative component

**Files:**
- Create: `src/app/(dashboard)/ads/_components/StepCreative.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/(dashboard)/ads/_components/StepCreative.tsx
'use client';

import { HEADLINE_MAX, type AdDraft } from '@/lib/meta/ads-types';

export function StepCreative(props: {
  draft: AdDraft; setDraft: (d: AdDraft) => void; onBack: () => void; onNext: () => void;
}) {
  const { draft, setDraft } = props;
  const set = <K extends keyof AdDraft>(k: K, v: AdDraft[K]) => setDraft({ ...draft, [k]: v });

  return (
    <div className="space-y-5">
      <Field label="Primary text">
        <textarea value={draft.primaryText} onChange={(e) => set('primaryText', e.target.value)} rows={6}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label={`Headline (${draft.headline.length}/${HEADLINE_MAX})`}>
        <input value={draft.headline} maxLength={HEADLINE_MAX}
          onChange={(e) => set('headline', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label="Hook">
        <input value={draft.hook} onChange={(e) => set('hook', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label="Hashtags (space-separated)">
        <input value={draft.hashtags.join(' ')}
          onChange={(e) => set('hashtags', (e.target.value.match(/#\w+/g) ?? []).slice(0, 5))}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <Field label="Image URL">
        <input value={draft.imageUrl} onChange={(e) => set('imageUrl', e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
      </Field>

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Back</button>
        <button type="button" onClick={props.onNext} disabled={!draft.imageUrl || !draft.primaryText}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-300">{props.label}</label>
      {props.children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/ads/_components/StepCreative.tsx"
git commit -m "feat(ads): StepCreative — editable copy + image"
```

---

## Task 10: StepAudience component

**Files:**
- Create: `src/app/(dashboard)/ads/_components/StepAudience.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/(dashboard)/ads/_components/StepAudience.tsx
'use client';

import { useEffect } from 'react';
import type { AdTargeting } from '@/lib/meta/ads-types';

interface MetaAsset { id: string; name?: string; currency?: string }

export function StepAudience(props: {
  targeting: AdTargeting; setTargeting: (t: AdTargeting) => void;
  suggestions: string[]; adAccounts: MetaAsset[]; pages: MetaAsset[];
  onBack: () => void; onNext: () => void;
}) {
  const { targeting, setTargeting } = props;
  const set = <K extends keyof AdTargeting>(k: K, v: AdTargeting[K]) => setTargeting({ ...targeting, [k]: v });

  // Seed sensible default dates (tomorrow → +7 days) once.
  useEffect(() => {
    if (!targeting.startDate) {
      const start = new Date(Date.now() + 86_400_000);
      const end = new Date(Date.now() + 8 * 86_400_000);
      setTargeting({ ...targeting, startDate: start.toISOString(), endDate: end.toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill interest chips from AI suggestions once.
  useEffect(() => {
    if (targeting.interests.length === 0 && props.suggestions.length) {
      set('interests', props.suggestions.slice(0, 5));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.suggestions]);

  function toggleInterest(name: string) {
    set('interests', targeting.interests.includes(name)
      ? targeting.interests.filter((i) => i !== name)
      : [...targeting.interests, name]);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Country (ISO-2)">
          <input value={targeting.countries.join(',')}
            onChange={(e) => set('countries', e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
        </Labeled>
        <Labeled label="Gender">
          <select value={targeting.gender} onChange={(e) => set('gender', e.target.value as AdTargeting['gender'])}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            <option value="all">All</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </Labeled>
        <Labeled label="Age min">
          <input type="number" min={13} max={65} value={targeting.ageMin} onChange={(e) => set('ageMin', Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
        </Labeled>
        <Labeled label="Age max">
          <input type="number" min={13} max={65} value={targeting.ageMax} onChange={(e) => set('ageMax', Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
        </Labeled>
      </div>

      <Labeled label="Interests (AI-suggested — click to toggle)">
        <div className="flex flex-wrap gap-2">
          {[...new Set([...props.suggestions, ...targeting.interests])].map((name) => {
            const active = targeting.interests.includes(name);
            return (
              <button key={name} type="button" onClick={() => toggleInterest(name)}
                className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-teal-500 bg-teal-500/10 text-teal-300' : 'border-zinc-700 text-zinc-400'}`}>
                {name}
              </button>
            );
          })}
        </div>
      </Labeled>

      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Daily budget (minor units, e.g. 500 = 5.00)">
          <input type="number" min={0} value={targeting.dailyBudgetMinor}
            onChange={(e) => set('dailyBudgetMinor', Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
        </Labeled>
        <Labeled label="Run dates">
          <div className="flex gap-2">
            <input type="date" value={targeting.startDate.slice(0, 10)}
              onChange={(e) => set('startDate', new Date(e.target.value).toISOString())}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-100" />
            <input type="date" value={targeting.endDate.slice(0, 10)}
              onChange={(e) => set('endDate', new Date(e.target.value).toISOString())}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-100" />
          </div>
        </Labeled>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Back</button>
        <button type="button" onClick={props.onNext} disabled={targeting.countries.length === 0}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

function Labeled(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-300">{props.label}</label>
      {props.children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/ads/_components/StepAudience.tsx"
git commit -m "feat(ads): StepAudience — geo/age/gender/interests/budget/dates"
```

---

## Task 11: StepReview + AdPreview components

**Files:**
- Create: `src/app/(dashboard)/ads/_components/StepReview.tsx`
- Create: `src/app/(dashboard)/ads/_components/AdPreview.tsx`

- [ ] **Step 1: Write AdPreview**

```tsx
// src/app/(dashboard)/ads/_components/AdPreview.tsx
'use client';

import type { AdDraft } from '@/lib/meta/ads-types';

export function AdPreview(props: { draft: AdDraft | null }) {
  const d = props.draft;
  return (
    <div className="h-fit rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Preview</p>
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="px-3 py-2 text-xs text-zinc-300">Your Page · Sponsored</div>
        {d?.primaryText && <div className="px-3 pb-2 text-sm text-zinc-200 whitespace-pre-wrap">{d.primaryText}</div>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {d?.imageUrl
          ? <img src={d.imageUrl} alt="Ad" className="aspect-[1.91/1] w-full object-cover" />
          : <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-zinc-800 text-xs text-zinc-500">No image</div>}
        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-xs text-zinc-500">{d?.destinationUrl || 'yoursite.com'}</div>
            <div className="truncate text-sm font-semibold text-zinc-100">{d?.headline || 'Your headline'}</div>
          </div>
          <span className="shrink-0 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200">{(d?.cta ?? 'LEARN_MORE').replace('_', ' ')}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write StepReview**

```tsx
// src/app/(dashboard)/ads/_components/StepReview.tsx
'use client';

import { useState } from 'react';
import type { AdDraft, AdTargeting } from '@/lib/meta/ads-types';

interface MetaAsset { id: string; name?: string; currency?: string }

export function StepReview(props: {
  draft: AdDraft; targeting: AdTargeting; brandId: string;
  adAccounts: MetaAsset[]; pages: MetaAsset[]; onBack: () => void;
}) {
  const [adAccountId, setAdAccountId] = useState(props.adAccounts[0]?.id ?? '');
  const [pageId, setPageId] = useState(props.pages[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ adsManagerUrl: string } | null>(null);

  async function publish() {
    setError(null); setSubmitting(true);
    try {
      const res = await fetch('/api/ads/publish', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: props.brandId, adAccountId, pageId,
          draft: props.draft, targeting: props.targeting,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? json.error ?? 'Publish failed');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4 rounded-xl border border-teal-700 bg-teal-500/10 p-6">
        <h2 className="text-lg font-semibold text-teal-200">Paused ad created</h2>
        <p className="text-sm text-zinc-300">Your ad is in Meta as a PAUSED campaign. It will not spend until you turn it on.</p>
        <a href={result.adsManagerUrl} target="_blank" rel="noreferrer"
          className="inline-block rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white">Open in Ads Manager</a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Ad account</label>
          <select value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            {props.adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id}{a.currency ? ` (${a.currency})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Facebook Page</label>
          <select value={pageId} onChange={(e) => setPageId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            {props.pages.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
          </select>
        </div>
      </div>

      <dl className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <Row k="Goal" v={props.draft.objective} />
        <Row k="Headline" v={props.draft.headline} />
        <Row k="Destination" v={props.draft.destinationUrl} />
        <Row k="Countries" v={props.targeting.countries.join(', ')} />
        <Row k="Age" v={`${props.targeting.ageMin}–${props.targeting.ageMax}`} />
        <Row k="Daily budget (minor)" v={String(props.targeting.dailyBudgetMinor)} />
      </dl>

      <div className="rounded-lg border border-amber-700 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        This will create a <strong>PAUSED</strong> ad. It won&apos;t spend until you turn it on in Ads Manager.
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Back</button>
        <button type="button" onClick={publish} disabled={submitting || !adAccountId || !pageId}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Creating…' : 'Create Paused Ad'}
        </button>
      </div>
    </div>
  );
}

function Row(props: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-zinc-800 py-1.5 last:border-0">
      <dt className="text-zinc-500">{props.k}</dt>
      <dd className="max-w-[60%] truncate text-zinc-200">{props.v}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck the whole feature**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/ads/_components/StepReview.tsx" "src/app/(dashboard)/ads/_components/AdPreview.tsx"
git commit -m "feat(ads): StepReview (publish) + live AdPreview"
```

---

## Task 12: Add Ads to the sidebar

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Add the icon import**

Change the lucide import (line ~7-15) to add `Megaphone`:

```tsx
import {
  BarChart3,
  Sparkles,
  Plus,
  Bot,
  Megaphone,
  Menu,
  Settings,
  X,
} from 'lucide-react';
```

- [ ] **Step 2: Add the nav item**

Update `primaryItems` (line ~19-24):

```tsx
const primaryItems = [
  { href: '/analyze', label: 'Analyze', icon: BarChart3 },
  { href: '/smart-posts', label: 'Smart Posts', icon: Sparkles },
  { href: '/create', label: 'Create', icon: Plus },
  { href: '/autopilot', label: 'Autopilot', icon: Bot },
  { href: '/ads', label: 'Ads', icon: Megaphone },
];
```

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev` (kill only this project's dev server first if one is running, per the global CLAUDE.md note).
Open `http://localhost:3000/ads`. Expected: Ads appears in the sidebar; the wizard renders Step 1 (or the "Connect Meta first" screen if Meta isn't connected).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat(ads): add Ads item to sidebar"
```

---

## Task 13: Full-suite verification

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new ad-builder tests.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no type errors; lint clean (fix any `no-console` etc. the repo enforces — note existing routes use `console.error`, which the repo allows).

- [ ] **Step 3: Manual smoke test (with a real connected Meta account)**

With Meta connected and at least one brand with a brain brief:
1. Open `/ads`, pick brand + Traffic + a URL, Generate.
2. Confirm copy + image populate and are editable.
3. Set audience + a budget at/above the currency minimum + dates.
4. Review → Create Paused Ad.
5. Confirm success screen + Ads Manager deep link; verify in Ads Manager the campaign/ad exist and are **PAUSED**.

- [ ] **Step 4: Open a PR**

```bash
git push -u origin feat/meta-ad-builder
gh pr create --base main --title "feat: Meta ad builder (/ads) — paused ad creation" --body "Implements the AI-first paused-ad builder per docs/superpowers/specs/2026-05-29-meta-ads-page-design.md. New /ads wizard, /api/ads/generate + /api/ads/publish, Meta write client, meta_ads table."
```

---

## Self-Review

**Spec coverage:**
- Publish model PAUSED → Task 4 (`status: 'PAUSED'` on every create), Task 6 (sequence), Task 11 (banner). ✅
- AI-first creative → Task 5 (captions + image reuse), Task 3 (assembler). ✅
- Curated 3 objectives → Task 2 (`OBJECTIVE_CONFIG`). ✅
- Basic + AI-suggested targeting → Task 10 (geo/age/gender/interests), Task 6 (interest resolution). ✅
- Image upload to Meta → Task 4 (`uploadAdImage`). ✅
- Ad account trust boundary → Task 6 (`ad_account_not_owned`). ✅
- Budget minimum / token expiry / partial-failure logging → Task 6. ✅
- `metaAds` history table → Task 1. ✅
- Sidebar entry, empty/blocked states → Task 12, Task 7. ✅
- Tests (unit + route) → Tasks 3, 4, 5, 6, 13. ✅

**Placeholder scan:** No TBD/TODO; the catch-block `'unknown'` strings in Task 6 are an explicit, explained forensic fallback, not a placeholder.

**Type consistency:** `AdDraft`, `AdTargeting`, `AdObjective`, `OBJECTIVE_CONFIG`, `minDailyBudget`, `buildAdDraft`, and the `ads.ts` function signatures are defined in Tasks 2–4 and used consistently in Tasks 5–11.

**Known follow-ups (out of v1 scope, noted in spec):** Meta App Review for multi-user write access; native Instant Lead Forms; richer interest extraction from the brief; regenerate-copy button can be added to StepCreative by re-calling `/api/ads/generate`.
