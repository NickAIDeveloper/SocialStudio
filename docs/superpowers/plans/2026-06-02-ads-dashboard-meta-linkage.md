# Ad Dashboard + Meta Linkage Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every ad the `/ads` builder publishes valid + runnable by Meta and kept in sync, and add an in-app dashboard showing each ad's preview, live performance, what's working/not, and next-step suggestions.

**Architecture:** Pure, unit-tested logic modules (`geo-overlap`, `signals`, insights result-mapping) sit under `src/lib`; thin best-effort API routes (`dashboard`, `advice`, `sync-insights`) call the existing stateless Meta client and Drizzle DB; a new `meta_ad_insights` table stores daily snapshots for trends; the existing HMAC-signed daily cron (`scripts/brain/run-daily.mjs`) gains an insights-sync step. UI reuses the existing `AdPreview` component inside new dashboard cards.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Drizzle ORM + Neon Postgres, Vitest, Cerebras (`@/lib/cerebras`), Meta Marketing API v21.

**Spec:** `docs/superpowers/specs/2026-06-02-ads-dashboard-meta-linkage-design.md`

**Conventions to follow (from existing code):**
- API success shape: `NextResponse.json({ success: true, ... })`; errors `NextResponse.json({ error }, { status })`. `Unauthorized` thrown by `getUserId()` → 401.
- Routes that touch Meta are **best-effort**: a Meta failure never 500s; fall back to stored data.
- `export const dynamic = 'force-dynamic'` on dynamic routes.
- No `console.log` in production code. Immutable updates (spread). Validate input.
- Meta client functions are stateless and take a **plaintext** token (`decrypt(account.accessToken)`).
- Run a single test file: `npx vitest run <path>`.

---

## Phase 0 — Linkage hardening

### Task 1: Geo-overlap pure module

**Files:**
- Create: `src/lib/ads/geo-overlap.ts`
- Test: `src/lib/ads/__tests__/geo-overlap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ads/__tests__/geo-overlap.test.ts
import { describe, it, expect } from 'vitest';
import { citiesOverlap, findOverlap, type GeoCity } from '../geo-overlap';

const melbourne: GeoCity = { key: '1', name: 'Melbourne', lat: -37.8136, lng: 144.9631, radius: 10, distanceUnit: 'mile' };
// ~4km from Melbourne CBD — well within the summed radii → overlaps.
const richmond: GeoCity = { key: '2', name: 'Richmond', lat: -37.8233, lng: 144.9980, radius: 10, distanceUnit: 'mile' };
// Sydney ~700km away → no overlap.
const sydney: GeoCity = { key: '3', name: 'Sydney', lat: -33.8688, lng: 151.2093, radius: 10, distanceUnit: 'mile' };

describe('citiesOverlap', () => {
  it('returns true when distance < sum of radii', () => {
    expect(citiesOverlap(melbourne, richmond)).toBe(true);
  });
  it('returns false when cities are far apart', () => {
    expect(citiesOverlap(melbourne, sydney)).toBe(false);
  });
  it('treats identical keys as overlapping', () => {
    expect(citiesOverlap(melbourne, { ...melbourne, key: '1', lat: 0, lng: 0 })).toBe(true);
  });
  it('normalizes kilometers to miles before comparing', () => {
    const a: GeoCity = { key: 'a', name: 'A', lat: 0, lng: 0, radius: 17, distanceUnit: 'kilometer' };
    const b: GeoCity = { key: 'b', name: 'B', lat: 0, lng: 0.2, radius: 17, distanceUnit: 'kilometer' };
    expect(citiesOverlap(a, b)).toBe(true);
  });
  it('handles missing radius by using the 10-mile Meta default', () => {
    expect(citiesOverlap({ ...melbourne, radius: undefined }, { ...sydney, radius: undefined })).toBe(false);
  });
});

describe('findOverlap', () => {
  it('returns the first existing city that overlaps the candidate', () => {
    expect(findOverlap([melbourne, sydney], richmond)?.name).toBe('Melbourne');
  });
  it('returns null when nothing overlaps', () => {
    expect(findOverlap([sydney], melbourne)).toBeNull();
  });
  it('returns null for an empty list', () => {
    expect(findOverlap([], melbourne)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ads/__tests__/geo-overlap.test.ts`
Expected: FAIL — `Cannot find module '../geo-overlap'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ads/geo-overlap.ts
// Pure geo-overlap detection for Meta city targeting. Two cities "overlap" when
// the great-circle distance between their centers is less than the sum of their
// targeting radii. Meta rejects overlapping locations with subcode 1487756
// ("Some of your locations overlap"), so we catch it before any write.

export interface GeoCity {
  key: string;
  name: string;
  lat: number;
  lng: number;
  radius?: number; // Meta default is 10 miles when unset.
  distanceUnit?: 'mile' | 'kilometer';
}

const DEFAULT_RADIUS_MILES = 10;
const KM_PER_MILE = 1.609344;
const EARTH_RADIUS_MILES = 3958.7613;

function toMiles(radius: number | undefined, unit: GeoCity['distanceUnit']): number {
  const r = radius ?? DEFAULT_RADIUS_MILES;
  return unit === 'kilometer' ? r / KM_PER_MILE : r;
}

// Haversine great-circle distance in miles.
export function haversineMiles(a: GeoCity, b: GeoCity): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function citiesOverlap(a: GeoCity, b: GeoCity): boolean {
  if (a.key === b.key) return true;
  const sumRadii = toMiles(a.radius, a.distanceUnit) + toMiles(b.radius, b.distanceUnit);
  return haversineMiles(a, b) < sumRadii;
}

// Returns the first city in `existing` that overlaps `candidate`, else null.
export function findOverlap(existing: GeoCity[], candidate: GeoCity): GeoCity | null {
  return existing.find((c) => citiesOverlap(c, candidate)) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ads/__tests__/geo-overlap.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ads/geo-overlap.ts src/lib/ads/__tests__/geo-overlap.test.ts
git commit -m "feat(ads): pure geo-overlap detection for city targeting"
```

---

### Task 2: Carry lat/lng/radius through the city type and geo-search

**Files:**
- Modify: `src/lib/meta/ads-types.ts` (the `AdTargeting.cities` element type)
- Modify: `src/app/api/meta/geo-search/route.ts` (include latitude/longitude in each result)

> Note: read both files first. The `cities` element is currently `{ key; name; radius?; distanceUnit? }`. Meta's `adgeolocation` search returns `latitude` and `longitude` per result — pass them through.

- [ ] **Step 1: Extend the city type**

In `src/lib/meta/ads-types.ts`, change the `cities` element of `AdTargeting` to add optional coords:

```ts
cities?: Array<{
  key: string;
  name: string;
  lat?: number;
  lng?: number;
  radius?: number;
  distanceUnit?: 'mile' | 'kilometer';
}>;
```

- [ ] **Step 2: Pass coords through geo-search**

In `src/app/api/meta/geo-search/route.ts`, ensure the Meta request asks for and returns `latitude`/`longitude`. Add them to the mapped result objects (keep existing fields). Example mapping (adapt to the file's existing shape):

```ts
const locations = (json.data ?? []).map((d: any) => ({
  key: d.key,
  name: d.name,
  type: d.type,
  countryName: d.country_name,
  region: d.region,
  lat: typeof d.latitude === 'number' ? d.latitude : undefined,
  lng: typeof d.longitude === 'number' ? d.longitude : undefined,
}));
```

If the Meta search URL uses an explicit `fields`/`location_types` param, leave it; `latitude`/`longitude` come back by default on `adgeolocation` city results.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors in `ads-types.ts` or `geo-search/route.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/meta/ads-types.ts src/app/api/meta/geo-search/route.ts
git commit -m "feat(ads): carry city lat/lng through targeting type and geo-search"
```

---

### Task 3: Block overlapping cities in StepAudience (UI guard)

**Files:**
- Modify: `src/app/(dashboard)/ads/_components/StepAudience.tsx` (the `GeoResult` interface + `addCity`)

- [ ] **Step 1: Extend GeoResult and store coords on add**

Update the `GeoResult` interface (top of file) to include coords:

```ts
interface GeoResult { key: string; name: string; type: string; countryName?: string; region?: string; lat?: number; lng?: number }
```

- [ ] **Step 2: Guard `addCity` with overlap detection + warning state**

Add near the other city state (`const [cityQuery, ...]`):

```ts
const [cityWarning, setCityWarning] = useState<string | null>(null);
```

Replace the existing `addCity` with the guarded version (imports `findOverlap`, `type GeoCity` from `@/lib/ads/geo-overlap` at top of file):

```ts
function addCity(r: GeoResult) {
  if (cities.some((c) => c.key === r.key)) return;
  // Overlap guard: Meta rejects overlapping city radii (subcode 1487756).
  if (r.lat != null && r.lng != null) {
    const existing: GeoCity[] = cities
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({ key: c.key, name: c.name, lat: c.lat as number, lng: c.lng as number, radius: c.radius, distanceUnit: c.distanceUnit }));
    const clash = findOverlap(existing, { key: r.key, name: r.name, lat: r.lat, lng: r.lng });
    if (clash) {
      setCityWarning(`${r.name} overlaps ${clash.name}. Remove one — Meta rejects overlapping locations.`);
      return;
    }
  }
  setCityWarning(null);
  set('cities', [...cities, { key: r.key, name: r.name, lat: r.lat, lng: r.lng }]);
  setCityQuery('');
  setCityResults([]);
  cityReqId.current++;
}
```

- [ ] **Step 3: Render the warning**

In the city section JSX (near the `cities.map(...)` chip list, around line 212), add:

```tsx
{cityWarning && <p className="text-xs text-red-400">{cityWarning}</p>}
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors. Manually confirm: adding two nearby cities shows the warning and blocks the second.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/ads/_components/StepAudience.tsx"
git commit -m "feat(ads): block overlapping city selection in audience step"
```

---

### Task 4: Server-side city-overlap rejection in publish

**Files:**
- Modify: `src/app/api/ads/publish/route.ts` (add validation before any Meta write)
- Test: `src/app/api/ads/publish/__tests__/route.test.ts` (add a case)

> Read the publish route first. There is an existing block of pre-write validations (budget, dates, geo, store URL). Add the overlap check in that block, after the "at least one geo dimension" check and before campaign creation.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/ads/publish/__tests__/route.test.ts` a case that posts targeting with two overlapping cities (both carrying lat/lng a few km apart, each radius 10mi) and asserts the response is `400` with an error mentioning overlap, and that **no** Meta create call was made (assert the campaign-create mock was not called). Mirror the existing tests' mocking setup in that file.

```ts
it('rejects overlapping cities before any Meta write', async () => {
  // ...reuse the file's existing harness to build a valid request, but with:
  // targeting.cities = [
  //   { key:'1', name:'Melbourne', lat:-37.8136, lng:144.9631, radius:10, distanceUnit:'mile' },
  //   { key:'2', name:'Richmond',  lat:-37.8233, lng:144.9980, radius:10, distanceUnit:'mile' },
  // ]
  const res = await POST(req);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/overlap/i);
  expect(createCampaignMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ads/publish/__tests__/route.test.ts`
Expected: FAIL (currently the overlapping cities would proceed to a Meta call).

- [ ] **Step 3: Add the validation**

At top of `publish/route.ts` import:

```ts
import { findOverlap, type GeoCity } from '@/lib/ads/geo-overlap';
```

In the pre-write validation block, after the geo presence check:

```ts
// Reject overlapping city radii up front (Meta subcode 1487756). Only cities
// that carry coordinates can be checked; coordinate-less legacy cities pass.
const targetCities = (targeting.cities ?? []) as Array<{ key: string; name: string; lat?: number; lng?: number; radius?: number; distanceUnit?: 'mile' | 'kilometer' }>;
for (let i = 0; i < targetCities.length; i++) {
  const c = targetCities[i];
  if (c.lat == null || c.lng == null) continue;
  const priorWithCoords: GeoCity[] = targetCities.slice(0, i)
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ key: p.key, name: p.name, lat: p.lat as number, lng: p.lng as number, radius: p.radius, distanceUnit: p.distanceUnit }));
  const clash = findOverlap(priorWithCoords, { key: c.key, name: c.name, lat: c.lat, lng: c.lng, radius: c.radius, distanceUnit: c.distanceUnit });
  if (clash) {
    return NextResponse.json(
      { error: `Locations overlap: "${c.name}" overlaps "${clash.name}". Remove one and try again.` },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/ads/publish/__tests__/route.test.ts`
Expected: PASS (existing + new case).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ads/publish/route.ts src/app/api/ads/publish/__tests__/route.test.ts
git commit -m "feat(ads): reject overlapping cities server-side before publish"
```

---

### Task 5: Read-back confirmation on publish

**Files:**
- Modify: `src/lib/meta/ads.ts` (add `getAd`)
- Modify: `src/app/api/ads/publish/route.ts` (call it after `createAd`, persist status)
- Test: `src/lib/meta/__tests__/ads.test.ts` (add a `getAd` case)

- [ ] **Step 1: Write the failing test for `getAd`**

Add to `src/lib/meta/__tests__/ads.test.ts` (mirror how the file stubs `global.fetch`):

```ts
it('getAd returns effective_status and review_feedback', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: '123', effective_status: 'PENDING_REVIEW', review_feedback: '{}' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  const { getAd } = await import('../ads');
  const result = await getAd('tok', '123');
  expect(result).toEqual({ effectiveStatus: 'PENDING_REVIEW', reviewFeedback: '{}' });
});

it('getAd returns null on Meta failure (best-effort)', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'boom' }));
  const { getAd } = await import('../ads');
  expect(await getAd('tok', '123')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/meta/__tests__/ads.test.ts`
Expected: FAIL — `getAd` is not exported.

- [ ] **Step 3: Implement `getAd`**

Add to `src/lib/meta/ads.ts` (near `getAdStatuses`):

```ts
// Read an ad back from Meta right after creation to confirm the real verdict.
// Best-effort: returns null on any failure so publish never fails over a read.
export async function getAd(
  accessToken: string,
  adId: string,
): Promise<{ effectiveStatus: string | null; reviewFeedback: string | null } | null> {
  try {
    const u = new URL(`${GRAPH_BASE}/${adId}`);
    u.searchParams.set('fields', 'effective_status,review_feedback');
    u.searchParams.set('access_token', accessToken);
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { effective_status?: string; review_feedback?: unknown };
    return {
      effectiveStatus: j.effective_status ?? null,
      reviewFeedback: j.review_feedback != null ? JSON.stringify(j.review_feedback) : null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/meta/__tests__/ads.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire read-back into publish**

In `publish/route.ts`, after `createAd` returns `adId` and the success row is built, before inserting/returning, call `getAd` and fold the result into the stored `status`. Read the route to match its exact insert shape; conceptually:

```ts
import { getAd } from '@/lib/meta/ads';
// ...after const adId = await createAd(...)
const verdict = await getAd(token, adId); // best-effort
const liveStatus = verdict?.effectiveStatus ?? 'PAUSED';
// Persist liveStatus into the metaAds row's `status` column instead of the
// optimistic 'PAUSED', and store verdict.reviewFeedback into `lastError` only
// if it indicates a rejection (status DISAPPROVED/WITH_ISSUES). Otherwise leave
// lastError null.
```

Keep it best-effort: a null verdict ⇒ status stays `'PAUSED'`. Do not throw.

- [ ] **Step 6: Verify publish tests still pass**

Run: `npx vitest run src/app/api/ads/publish/__tests__/route.test.ts`
Expected: PASS. If a test asserted exact stored status `'PAUSED'`, update its mock so `getAd` returns `{ effectiveStatus: 'PAUSED', reviewFeedback: null }` (or null) and re-assert.

- [ ] **Step 7: Commit**

```bash
git add src/lib/meta/ads.ts src/lib/meta/__tests__/ads.test.ts src/app/api/ads/publish/route.ts
git commit -m "feat(ads): confirm ad state with Meta read-back after publish"
```

---

## Phase 1 — Insights layer

### Task 6: Insights fetch + objective-aware result mapping

**Files:**
- Create: `src/lib/meta/ad-insights.ts`
- Test: `src/lib/meta/__tests__/ad-insights.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/meta/__tests__/ad-insights.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resultTypeForObjective, extractResult, getAdInsights } from '../ad-insights';

afterEach(() => vi.restoreAllMocks());

describe('resultTypeForObjective', () => {
  it('maps each Meta objective to a result action_type', () => {
    expect(resultTypeForObjective('OUTCOME_TRAFFIC')).toBe('link_click');
    expect(resultTypeForObjective('OUTCOME_ENGAGEMENT')).toBe('post_engagement');
    expect(resultTypeForObjective('OUTCOME_LEADS')).toBe('link_click');
    expect(resultTypeForObjective('OUTCOME_APP_PROMOTION')).toBe('mobile_app_install');
  });
  it('falls back to link_click for unknown objectives', () => {
    expect(resultTypeForObjective('OUTCOME_WHATEVER')).toBe('link_click');
  });
});

describe('extractResult', () => {
  const actions = [
    { action_type: 'link_click', value: '42' },
    { action_type: 'post_engagement', value: '99' },
  ];
  it('returns the matching action value as a number', () => {
    expect(extractResult(actions, 'link_click')).toBe(42);
  });
  it('falls back to landing_page_view when primary type absent', () => {
    expect(extractResult([{ action_type: 'landing_page_view', value: '7' }], 'link_click')).toBe(7);
  });
  it('returns 0 when nothing matches', () => {
    expect(extractResult([], 'mobile_app_install')).toBe(0);
  });
});

describe('getAdInsights', () => {
  it('parses one ad row into a normalized shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{
        spend: '42.10', impressions: '18430', reach: '11200', clicks: '312',
        inline_link_clicks: '268', ctr: '1.69', cpc: '0.13', frequency: '1.64',
        actions: [{ action_type: 'link_click', value: '268' }],
        account_currency: 'GBP',
      }] }),
    }));
    const out = await getAdInsights('tok', ['ad1'], 'OUTCOME_TRAFFIC', 'last_7d');
    expect(out.ad1).toMatchObject({
      spend: 42.1, impressions: 18430, clicks: 312, ctr: 1.69, cpc: 0.13,
      frequency: 1.64, results: 268, resultType: 'link_click', currency: 'GBP',
    });
  });
  it('returns null for an ad whose insights call fails (best-effort)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => 'boom' }));
    const out = await getAdInsights('tok', ['ad1'], 'OUTCOME_TRAFFIC', 'last_7d');
    expect(out.ad1).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/meta/__tests__/ad-insights.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/meta/ad-insights.ts
// Read-side Meta insights client for ads. Stateless, plaintext token, best-effort
// (a failed ad maps to null so the dashboard still renders). Mirrors ads.ts.

const META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface AdInsight {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: number; // percent
  cpc: number;
  frequency: number;
  results: number;
  resultType: string;
  currency: string | null;
}

type MetaAction = { action_type: string; value: string };

// Objective → the Meta `actions` action_type we count as a "result".
const RESULT_TYPE: Record<string, string> = {
  OUTCOME_TRAFFIC: 'link_click',
  OUTCOME_ENGAGEMENT: 'post_engagement',
  OUTCOME_LEADS: 'link_click', // no Lead Form/Pixel in scope — count link clicks.
  OUTCOME_APP_PROMOTION: 'mobile_app_install',
};

// Secondary fallbacks if the primary action_type is missing from the payload.
const RESULT_FALLBACK: Record<string, string[]> = {
  link_click: ['landing_page_view', 'inline_link_click'],
  mobile_app_install: ['app_install', 'omni_app_install'],
};

export function resultTypeForObjective(metaObjective: string): string {
  return RESULT_TYPE[metaObjective] ?? 'link_click';
}

export function extractResult(actions: MetaAction[] | undefined, type: string): number {
  const list = actions ?? [];
  const direct = list.find((a) => a.action_type === type);
  if (direct) return Number(direct.value) || 0;
  for (const alt of RESULT_FALLBACK[type] ?? []) {
    const hit = list.find((a) => a.action_type === alt);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

const FIELDS = [
  'spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks',
  'ctr', 'cpc', 'frequency', 'actions', 'account_currency',
].join(',');

// Fetch insights for each ad. `metaObjective` selects the result action_type.
// `datePreset` e.g. 'last_7d' | 'last_14d' | 'lifetime'.
export async function getAdInsights(
  accessToken: string,
  adIds: string[],
  metaObjective: string,
  datePreset: string,
): Promise<Record<string, AdInsight | null>> {
  const type = resultTypeForObjective(metaObjective);
  const entries = await Promise.all(
    adIds.map(async (id) => {
      try {
        const u = new URL(`${GRAPH_BASE}/${id}/insights`);
        u.searchParams.set('fields', FIELDS);
        u.searchParams.set('date_preset', datePreset);
        u.searchParams.set('access_token', accessToken);
        const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [id, null] as const;
        const j = (await res.json()) as { data?: Array<Record<string, unknown>> };
        const row = j.data?.[0];
        if (!row) return [id, null] as const;
        const num = (v: unknown) => Number(v ?? 0) || 0;
        const insight: AdInsight = {
          spend: num(row.spend),
          impressions: num(row.impressions),
          reach: num(row.reach),
          clicks: num(row.clicks),
          inlineLinkClicks: num(row.inline_link_clicks),
          ctr: num(row.ctr),
          cpc: num(row.cpc),
          frequency: num(row.frequency),
          results: extractResult(row.actions as MetaAction[] | undefined, type),
          resultType: type,
          currency: (row.account_currency as string) ?? null,
        };
        return [id, insight] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/meta/__tests__/ad-insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta/ad-insights.ts src/lib/meta/__tests__/ad-insights.test.ts
git commit -m "feat(ads): Meta ad-insights client with objective-aware results"
```

---

### Task 7: `meta_ad_insights` table + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (add table after `metaAds`)
- Create (generated): `drizzle/migrations/*` via drizzle-kit

- [ ] **Step 1: Add the table to schema.ts**

After the `metaAds` table (line ~319), add (match the import style already used in the file — `pgTable`, `uuid`, `varchar`, `integer`, `numeric`, `date`, `jsonb`, `timestamp`, `uniqueIndex`; add any missing imports to the top import list):

```ts
// ── Meta Ad Insights ─────────────────────────────────────────────────────────
// Daily performance snapshot per ad (one row per ad per UTC day) so the dashboard
// can show trends. Idempotent on (meta_ads_id, snapshot_date).
export const metaAdInsights = pgTable(
  'meta_ad_insights',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    metaAdsId: uuid('meta_ads_id')
      .notNull()
      .references(() => metaAds.id, { onDelete: 'cascade' }),
    adId: varchar('ad_id', { length: 64 }).notNull(),
    snapshotDate: date('snapshot_date', { mode: 'string' }).notNull(),
    currency: varchar('currency', { length: 3 }),
    spend: numeric('spend', { precision: 12, scale: 2 }).notNull().default('0'),
    impressions: integer('impressions').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    inlineLinkClicks: integer('inline_link_clicks').notNull().default(0),
    ctr: numeric('ctr', { precision: 6, scale: 3 }).notNull().default('0'),
    cpc: numeric('cpc', { precision: 10, scale: 2 }).notNull().default('0'),
    frequency: numeric('frequency', { precision: 6, scale: 2 }).notNull().default('0'),
    results: integer('results').notNull().default(0),
    resultType: varchar('result_type', { length: 48 }),
    raw: jsonb('raw'),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('meta_ad_insights_ad_day_idx').on(t.metaAdsId, t.snapshotDate)],
);
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new SQL file under `drizzle/migrations/` creating `meta_ad_insights`. Inspect it.

- [ ] **Step 3: Apply the migration**

Run: `npx drizzle-kit migrate`
Expected: applies cleanly against the Neon DB (`NEON_DB_URL` from `.env.local`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations
git commit -m "feat(ads): add meta_ad_insights daily snapshot table"
```

---

### Task 8: Insights upsert helper

**Files:**
- Create: `src/lib/ads/insights-store.ts`
- Test: `src/lib/ads/__tests__/insights-store.test.ts`

> This helper builds the row values + upsert spec; the DB write is done by callers via Drizzle. We unit-test the pure row-builder and the trend computation.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ads/__tests__/insights-store.test.ts
import { describe, it, expect } from 'vitest';
import { buildSnapshotRow, computeTrend } from '../insights-store';
import type { AdInsight } from '@/lib/meta/ad-insights';

const insight: AdInsight = {
  spend: 42.1, impressions: 18430, reach: 11200, clicks: 312, inlineLinkClicks: 268,
  ctr: 1.69, cpc: 0.13, frequency: 1.64, results: 268, resultType: 'link_click', currency: 'GBP',
};

describe('buildSnapshotRow', () => {
  it('maps an insight into a DB row keyed for upsert', () => {
    const row = buildSnapshotRow('uuid-1', 'ad1', '2026-06-02', insight);
    expect(row).toMatchObject({
      metaAdsId: 'uuid-1', adId: 'ad1', snapshotDate: '2026-06-02',
      spend: '42.1', impressions: 18430, ctr: '1.69', results: 268, currency: 'GBP',
    });
    expect(row.raw).toEqual(insight);
  });
});

describe('computeTrend', () => {
  it('returns up/down/flat deltas vs the prior snapshot', () => {
    expect(computeTrend(1.69, 1.20)).toEqual({ direction: 'up', delta: expect.closeTo(0.49, 2) });
    expect(computeTrend(0.35, 0.90)).toEqual({ direction: 'down', delta: expect.closeTo(-0.55, 2) });
    expect(computeTrend(1.0, 1.0)).toEqual({ direction: 'flat', delta: 0 });
  });
  it('treats a missing prior as flat with no delta', () => {
    expect(computeTrend(1.69, null)).toEqual({ direction: 'flat', delta: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ads/__tests__/insights-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/ads/insights-store.ts
// Pure helpers for persisting + comparing ad insight snapshots. The actual DB
// upsert is performed by callers (Drizzle .onConflictDoUpdate on the
// (meta_ads_id, snapshot_date) unique index) using buildSnapshotRow's output.
import type { AdInsight } from '@/lib/meta/ad-insights';

export interface SnapshotRow {
  metaAdsId: string;
  adId: string;
  snapshotDate: string; // 'YYYY-MM-DD' (UTC)
  currency: string | null;
  spend: string;
  impressions: number;
  reach: number;
  clicks: number;
  inlineLinkClicks: number;
  ctr: string;
  cpc: string;
  frequency: string;
  results: number;
  resultType: string;
  raw: AdInsight;
}

// numeric columns are stored as strings in Drizzle/pg; integers as numbers.
export function buildSnapshotRow(
  metaAdsId: string,
  adId: string,
  snapshotDate: string,
  insight: AdInsight,
): SnapshotRow {
  return {
    metaAdsId,
    adId,
    snapshotDate,
    currency: insight.currency,
    spend: String(insight.spend),
    impressions: insight.impressions,
    reach: insight.reach,
    clicks: insight.clicks,
    inlineLinkClicks: insight.inlineLinkClicks,
    ctr: String(insight.ctr),
    cpc: String(insight.cpc),
    frequency: String(insight.frequency),
    results: insight.results,
    resultType: insight.resultType,
    raw: insight,
  };
}

export interface Trend {
  direction: 'up' | 'down' | 'flat';
  delta: number | null;
}

export function computeTrend(current: number, prior: number | null): Trend {
  if (prior == null) return { direction: 'flat', delta: null };
  const delta = current - prior;
  if (Math.abs(delta) < 1e-9) return { direction: 'flat', delta: 0 };
  return { direction: delta > 0 ? 'up' : 'down', delta };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ads/__tests__/insights-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ads/insights-store.ts src/lib/ads/__tests__/insights-store.test.ts
git commit -m "feat(ads): pure snapshot row-builder and trend helpers"
```

---

### Task 9: Insights sync cron route

**Files:**
- Create: `src/app/api/ads/sync-insights/route.ts`
- Test: `src/app/api/ads/sync-insights/__tests__/route.test.ts`
- Modify: `scripts/brain/run-daily.mjs` (add a call after the autopilot step)

> Read `src/lib/brain/auth.ts` (`verifyBrainSignature`) and `scripts/brain/run-daily.mjs` first to match the exact HMAC pattern. The route loops every non-archived ad with an `adId`, fetches insights via `getAdInsights`, upserts today's snapshot, and refreshes `metaAds.status` from the live effective_status. Best-effort per ad.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/ads/sync-insights/__tests__/route.test.ts
// Verify: (a) request without a valid brain signature → 401;
// (b) with a valid signature, getAdInsights is called and an upsert is issued
//     per ad that has an adId. Mock @/lib/db, @/lib/meta/ad-insights,
//     @/lib/meta/ads (getAdStatuses), @/lib/brain/auth (verifyBrainSignature),
//     @/lib/encryption (decrypt) — mirror the publish route test's mock style.
```

Write concrete mocks following `publish/__tests__/route.test.ts`. Assert 401 path and the happy path (insights fetched + `db.insert(...).values(...).onConflictDoUpdate` called once per ad).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ads/sync-insights/__tests__/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/ads/sync-insights/route.ts
// POST /api/ads/sync-insights — cron-only (HMAC via verifyBrainSignature).
// For every non-archived ad with an adId: refresh live status and upsert today's
// insight snapshot. Best-effort per ad; a single ad failure never aborts the run.
import { NextResponse } from 'next/server';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAccounts, metaAdInsights } from '@/lib/db/schema';
import { decrypt } from '@/lib/encryption';
import { getAdInsights } from '@/lib/meta/ad-insights';
import { getAd } from '@/lib/meta/ads';
import { buildSnapshotRow } from '@/lib/ads/insights-store';
import { verifyBrainSignature } from '@/lib/brain/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

  const rows = await db
    .select({
      id: metaAds.id,
      userId: metaAds.userId,
      adId: metaAds.adId,
      objective: metaAds.objective,
    })
    .from(metaAds)
    .where(and(isNotNull(metaAds.adId), ne(metaAds.status, 'ARCHIVED')));

  // Group by user so we decrypt each token once.
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId)!.push(r);
  }

  let synced = 0;
  for (const [userId, userRows] of byUser) {
    try {
      const [account] = await db
        .select({ accessToken: metaAccounts.accessToken, tokenExpiresAt: metaAccounts.tokenExpiresAt })
        .from(metaAccounts)
        .where(eq(metaAccounts.userId, userId))
        .limit(1);
      if (!account) continue;
      if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) continue;
      const token = decrypt(account.accessToken);

      for (const r of userRows) {
        const adId = r.adId as string;
        try {
          const insights = await getAdInsights(token, [adId], r.objective, 'last_14d');
          const insight = insights[adId];

          const verdict = await getAd(token, adId);
          if (verdict?.effectiveStatus) {
            await db.update(metaAds)
              .set({ status: verdict.effectiveStatus, updatedAt: new Date() })
              .where(eq(metaAds.id, r.id));
          }

          if (insight) {
            const row = buildSnapshotRow(r.id, adId, today, insight);
            await db.insert(metaAdInsights).values(row).onConflictDoUpdate({
              target: [metaAdInsights.metaAdsId, metaAdInsights.snapshotDate],
              set: {
                currency: row.currency, spend: row.spend, impressions: row.impressions,
                reach: row.reach, clicks: row.clicks, inlineLinkClicks: row.inlineLinkClicks,
                ctr: row.ctr, cpc: row.cpc, frequency: row.frequency, results: row.results,
                resultType: row.resultType, raw: row.raw, fetchedAt: new Date(),
              },
            });
            synced++;
          }
        } catch {
          // best-effort per ad
        }
      }
    } catch {
      // best-effort per user
    }
  }

  return NextResponse.json({ success: true, synced });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/ads/sync-insights/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the cron call to the daily script**

In `scripts/brain/run-daily.mjs`, after the existing autopilot trigger, add a signed POST to `${BRAIN_BASE_URL}/api/ads/sync-insights` using the same HMAC signing helper the script already uses for other endpoints (reuse the existing sign function/secret `BRAIN_CRON_SECRET`). Log the `{ synced }` count. Do not fail the whole run if it errors (wrap in try/catch like the other steps).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ads/sync-insights scripts/brain/run-daily.mjs
git commit -m "feat(ads): daily cron to sync ad status + insight snapshots"
```

---

## Phase 2 — Dashboard

### Task 10: Signals rule engine

**Files:**
- Create: `src/lib/ads/signals.ts`
- Test: `src/lib/ads/__tests__/signals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ads/__tests__/signals.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateSignals } from '../signals';
import type { AdInsight } from '@/lib/meta/ad-insights';

const base: AdInsight = {
  spend: 0, impressions: 0, reach: 0, clicks: 0, inlineLinkClicks: 0,
  ctr: 0, cpc: 0, frequency: 0, results: 0, resultType: 'link_click', currency: 'GBP',
};

describe('evaluateSignals', () => {
  it('flags "gathering" under the impressions floor', () => {
    const s = evaluateSignals({ ...base, impressions: 200 }, 'OUTCOME_TRAFFIC');
    expect(s.verdict).toBe('gathering');
  });
  it('flags "working" for strong CTR', () => {
    const s = evaluateSignals({ ...base, impressions: 18000, clicks: 300, ctr: 1.69, results: 268 }, 'OUTCOME_TRAFFIC');
    expect(s.verdict).toBe('working');
    expect(s.reasons.join(' ')).toMatch(/CTR/i);
  });
  it('flags "not" for low CTR after enough impressions', () => {
    const s = evaluateSignals({ ...base, impressions: 21000, clicks: 74, ctr: 0.35 }, 'OUTCOME_LEADS');
    expect(s.verdict).toBe('not');
    expect(s.tips.length).toBeGreaterThan(0);
  });
  it('flags "not" when spending with zero results', () => {
    const s = evaluateSignals({ ...base, impressions: 5000, spend: 38.9, ctr: 1.2, results: 0 }, 'OUTCOME_LEADS');
    expect(s.verdict).toBe('not');
    expect(s.reasons.join(' ')).toMatch(/no results|0 results|without results/i);
  });
  it('flags "watch" for high frequency', () => {
    const s = evaluateSignals({ ...base, impressions: 9000, ctr: 1.1, frequency: 2.8, results: 40 }, 'OUTCOME_TRAFFIC');
    expect(s.verdict).toBe('watch');
    expect(s.reasons.join(' ')).toMatch(/frequency/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ads/__tests__/signals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/ads/signals.ts
// Deterministic "what's working / not" rule engine. Pure function over a single
// ad's insights + its Meta objective. Benchmarks are tunable constants. Priority:
// gathering < working/watch < not (a "not" reason always wins the verdict).
import type { AdInsight } from '@/lib/meta/ad-insights';

const IMPRESSION_FLOOR = 500;          // below this we're still learning
const CTR_BENCHMARK: Record<string, number> = {
  OUTCOME_TRAFFIC: 0.9, OUTCOME_ENGAGEMENT: 1.0, OUTCOME_LEADS: 0.8, OUTCOME_APP_PROMOTION: 0.7,
};
const CTR_JUDGE_MIN_IMPRESSIONS = 1000; // need enough data to judge CTR
const FREQUENCY_FATIGUE = 2.5;
const SPEND_NO_RESULT_FLOOR = 10;       // account currency

export type Verdict = 'gathering' | 'working' | 'watch' | 'not';

export interface SignalResult {
  verdict: Verdict;
  reasons: string[];
  tips: string[];
}

export function evaluateSignals(insight: AdInsight, metaObjective: string): SignalResult {
  const reasons: string[] = [];
  const tips: string[] = [];
  const benchmark = CTR_BENCHMARK[metaObjective] ?? 0.9;

  if (insight.impressions < IMPRESSION_FLOOR) {
    return { verdict: 'gathering', reasons: ['Still gathering data — too few impressions to judge yet.'], tips: [] };
  }

  let notWorking = false;

  if (insight.spend >= SPEND_NO_RESULT_FLOOR && insight.results === 0) {
    notWorking = true;
    reasons.push(`Spent ${insight.spend.toFixed(2)} with no results.`);
    tips.push('Consider pausing or reworking the offer — spend is not converting.');
  }

  if (insight.impressions >= CTR_JUDGE_MIN_IMPRESSIONS && insight.ctr < benchmark) {
    notWorking = true;
    reasons.push(`CTR ${insight.ctr.toFixed(2)}% is below the ${benchmark}% benchmark for this goal.`);
    tips.push('Refresh the creative or test a stronger hook — people are scrolling past.');
  }

  if (notWorking) return { verdict: 'not', reasons, tips };

  if (insight.frequency > FREQUENCY_FATIGUE) {
    reasons.push(`Frequency ${insight.frequency.toFixed(1)} — the same people are seeing this a lot.`);
    tips.push('Broaden the audience or add fresh creative to avoid fatigue.');
    return { verdict: 'watch', reasons, tips };
  }

  if (insight.ctr >= benchmark * 1.5) {
    reasons.push(`CTR ${insight.ctr.toFixed(2)}% is well above the ${benchmark}% benchmark.`);
    tips.push('This is a strong performer — consider raising budget or cloning it as a variant.');
    return { verdict: 'working', reasons, tips };
  }

  reasons.push('Performing within normal range for this goal.');
  return { verdict: 'watch', reasons, tips };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ads/__tests__/signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ads/signals.ts src/lib/ads/__tests__/signals.test.ts
git commit -m "feat(ads): deterministic what's-working signal engine"
```

---

### Task 11: Dashboard API route

**Files:**
- Create: `src/app/api/ads/dashboard/route.ts`
- Test: `src/app/api/ads/dashboard/__tests__/route.test.ts`

> Returns ads (newest first, cap 50) joined with their latest stored snapshot + the prior snapshot (for trend) + computed signals. `?refresh=1` does a live fetch + upsert of today's snapshot before responding. Best-effort: Meta failure never 500s; ads with no snapshot show `insight: null` and verdict `gathering`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/ads/dashboard/__tests__/route.test.ts
// Mock @/lib/db to return one ad + two snapshots; assert the response includes
// metrics, a CTR trend object, and a signals verdict. Assert that without
// ?refresh=1 no Meta call happens, and a thrown Meta error during refresh still
// yields 200 with stored data. Mirror the list route test's mock style.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ads/dashboard/__tests__/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/ads/dashboard/route.ts
// GET /api/ads/dashboard[?refresh=1] — ads + latest insight snapshot + trend +
// signals + Ads Manager link. Best-effort; never 500s on a Meta failure.
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAccounts, metaAdInsights } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { buildAdsManagerUrl } from '@/lib/meta/ads';
import { getAdInsights, type AdInsight } from '@/lib/meta/ad-insights';
import { buildSnapshotRow, computeTrend } from '@/lib/ads/insights-store';
import { evaluateSignals } from '@/lib/ads/signals';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    const refresh = new URL(req.url).searchParams.get('refresh') === '1';

    const rows = await db
      .select()
      .from(metaAds)
      .where(eq(metaAds.userId, userId))
      .orderBy(desc(metaAds.createdAt))
      .limit(50);

    // Optional live refresh (best-effort, today's snapshot upsert).
    if (refresh) {
      try {
        const [account] = await db
          .select({ accessToken: metaAccounts.accessToken, tokenExpiresAt: metaAccounts.tokenExpiresAt })
          .from(metaAccounts).where(eq(metaAccounts.userId, userId)).limit(1);
        if (account && !(account.tokenExpiresAt && account.tokenExpiresAt <= new Date())) {
          const token = decrypt(account.accessToken);
          const today = new Date().toISOString().slice(0, 10);
          for (const r of rows) {
            if (!r.adId) continue;
            const res = await getAdInsights(token, [r.adId], r.objective, 'last_14d');
            const insight = res[r.adId];
            if (!insight) continue;
            const row = buildSnapshotRow(r.id, r.adId, today, insight);
            await db.insert(metaAdInsights).values(row).onConflictDoUpdate({
              target: [metaAdInsights.metaAdsId, metaAdInsights.snapshotDate],
              set: {
                currency: row.currency, spend: row.spend, impressions: row.impressions,
                reach: row.reach, clicks: row.clicks, inlineLinkClicks: row.inlineLinkClicks,
                ctr: row.ctr, cpc: row.cpc, frequency: row.frequency, results: row.results,
                resultType: row.resultType, raw: row.raw, fetchedAt: new Date(),
              },
            });
          }
        }
      } catch {
        // best-effort — fall through to render stored data
      }
    }

    // Build cards from stored snapshots (latest + prior for trend).
    const ads = await Promise.all(rows.map(async (r) => {
      const snaps = await db
        .select()
        .from(metaAdInsights)
        .where(eq(metaAdInsights.metaAdsId, r.id))
        .orderBy(desc(metaAdInsights.snapshotDate))
        .limit(2);
      const latest = snaps[0] ?? null;
      const prior = snaps[1] ?? null;
      const draft = (r.draft ?? {}) as Record<string, unknown>;

      const insight: AdInsight | null = latest ? {
        spend: Number(latest.spend), impressions: latest.impressions, reach: latest.reach,
        clicks: latest.clicks, inlineLinkClicks: latest.inlineLinkClicks, ctr: Number(latest.ctr),
        cpc: Number(latest.cpc), frequency: Number(latest.frequency), results: latest.results,
        resultType: latest.resultType ?? 'link_click', currency: latest.currency,
      } : null;

      const signals = insight ? evaluateSignals(insight, r.objective)
        : { verdict: 'gathering' as const, reasons: ['No data yet.'], tips: [] };

      return {
        id: r.id,
        objective: r.objective,
        status: r.status,
        createdAt: r.createdAt,
        adsManagerUrl: r.campaignId ? buildAdsManagerUrl(r.adAccountId, r.campaignId) : null,
        lastError: r.lastError,
        preview: {
          headline: draft.headline ?? null,
          primaryText: draft.primaryText ?? null,
          imageUrl: draft.imageUrl ?? null,
          thumbnailUrl: draft.thumbnailUrl ?? null,
          mediaType: draft.mediaType ?? 'image',
          cta: draft.cta ?? 'LEARN_MORE',
          destinationUrl: draft.destinationUrl ?? null,
        },
        insight,
        ctrTrend: insight ? computeTrend(insight.ctr, prior ? Number(prior.ctr) : null) : null,
        signals,
      };
    }));

    return NextResponse.json({ success: true, ads });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/ads/dashboard/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ads/dashboard
git commit -m "feat(ads): dashboard API with snapshots, trend and signals"
```

---

### Task 12: Dashboard card component

**Files:**
- Create: `src/app/(dashboard)/ads/_components/AdDashboardCard.tsx`

> Pure presentational card: preview (reuse `AdPreview` shape inline or a compact preview), status badge, metric grid, signal banner (green=working, amber=watch, red=not, neutral=gathering), tips, and an "Ask AI" button stub (wired in Task 14). No data fetching here — receives one ad object from the dashboard API.

- [ ] **Step 1: Implement the component**

```tsx
// src/app/(dashboard)/ads/_components/AdDashboardCard.tsx
'use client';

import { useState } from 'react';

interface Insight {
  spend: number; impressions: number; reach: number; clicks: number;
  ctr: number; cpc: number; frequency: number; results: number; resultType: string; currency: string | null;
}
export interface DashboardAd {
  id: string; objective: string; status: string;
  adsManagerUrl: string | null; lastError: string | null;
  preview: { headline: string | null; primaryText: string | null; imageUrl: string | null; thumbnailUrl: string | null; mediaType: string; cta: string; destinationUrl: string | null };
  insight: Insight | null;
  ctrTrend: { direction: 'up' | 'down' | 'flat'; delta: number | null } | null;
  signals: { verdict: 'gathering' | 'working' | 'watch' | 'not'; reasons: string[]; tips: string[] };
}

const VERDICT_STYLES: Record<string, string> = {
  working: 'bg-green-500/15 text-green-300',
  watch: 'bg-amber-500/15 text-amber-300',
  not: 'bg-red-500/15 text-red-300',
  gathering: 'bg-white/5 text-(--muted)',
};

function Metric(props: { label: string; value: string; tone?: 'up' | 'down' }) {
  const tone = props.tone === 'up' ? 'text-green-400' : props.tone === 'down' ? 'text-red-400' : 'text-(--txt)';
  return (
    <div>
      <div className="text-xs text-(--muted-2)">{props.label}</div>
      <div className={`text-lg font-bold ${tone}`}>{props.value}</div>
    </div>
  );
}

export function AdDashboardCard({ ad }: { ad: DashboardAd }) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const i = ad.insight;
  const cur = i?.currency ?? '';
  const trendTone = ad.ctrTrend?.direction === 'up' ? 'up' : ad.ctrTrend?.direction === 'down' ? 'down' : undefined;

  async function askAi() {
    setLoading(true);
    try {
      const res = await fetch('/api/ads/advice', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adId: ad.id }),
      });
      const json = await res.json();
      setAdvice(json.advice ?? json.error ?? 'No advice available.');
    } catch {
      setAdvice('Could not load advice right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-(--line) bg-(--bg) p-4 md:flex-row">
      {/* Preview */}
      <div className="w-full shrink-0 overflow-hidden rounded-xl border border-(--line) md:w-56">
        {ad.preview.imageUrl || ad.preview.thumbnailUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={(ad.preview.thumbnailUrl || ad.preview.imageUrl) as string} alt="Ad" className="aspect-[1.91/1] w-full object-cover" />
          : <div className="flex aspect-[1.91/1] items-center justify-center bg-(--surface-2) text-xs text-(--muted-2)">No image</div>}
        <div className="p-3">
          <div className="text-xs text-(--muted-2)">{ad.preview.destinationUrl ?? 'yoursite.com'} · Sponsored</div>
          <div className="text-sm font-semibold text-(--txt)">{ad.preview.headline ?? 'Your headline'}</div>
          {ad.preview.primaryText && <div className="mt-1 line-clamp-3 text-xs text-(--muted)">{ad.preview.primaryText}</div>}
        </div>
      </div>

      {/* Stats + signals */}
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-(--surface-2) px-2 py-1">{ad.status}</span>
          <span className="text-(--muted-2)">{ad.objective.replace('OUTCOME_', '')}</span>
          {ad.adsManagerUrl && <a className="ml-auto text-(--accent)" href={ad.adsManagerUrl} target="_blank" rel="noreferrer">Open in Ads Manager ↗</a>}
        </div>

        {i ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <Metric label="Spend" value={`${cur} ${i.spend.toFixed(2)}`} />
            <Metric label="Impressions" value={i.impressions.toLocaleString()} />
            <Metric label="Clicks" value={i.clicks.toLocaleString()} />
            <Metric label="CTR" value={`${i.ctr.toFixed(2)}%`} tone={trendTone} />
            <Metric label="CPC" value={`${cur} ${i.cpc.toFixed(2)}`} />
            <Metric label="Reach" value={i.reach.toLocaleString()} />
            <Metric label="Frequency" value={i.frequency.toFixed(1)} />
            <Metric label="Results" value={i.results.toLocaleString()} />
          </div>
        ) : (
          <p className="text-sm text-(--muted)">Gathering data — stats appear once Meta starts reporting.</p>
        )}

        <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${VERDICT_STYLES[ad.signals.verdict]}`}>
          {ad.signals.reasons.join(' ')}
        </div>
        {ad.signals.tips.length > 0 && (
          <div className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-(--txt)">
            💡 {ad.signals.tips.join(' ')}
            <button onClick={askAi} disabled={loading} className="ml-2 rounded bg-(--accent) px-2 py-1 text-xs text-white disabled:opacity-50">
              {loading ? 'Thinking…' : '✨ Ask AI'}
            </button>
          </div>
        )}
        {advice && <div className="mt-2 whitespace-pre-wrap rounded-lg border border-(--line) px-3 py-2 text-sm text-(--txt)">{advice}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ads/_components/AdDashboardCard.tsx"
git commit -m "feat(ads): dashboard ad card (preview + metrics + signals)"
```

---

### Task 13: Wire the dashboard into the queue page

**Files:**
- Modify: `src/app/(dashboard)/ads/queue/page.tsx`

> Read the current page first. Replace its data source with `GET /api/ads/dashboard`, render a list of `AdDashboardCard`, and add a "Refresh now" button that re-fetches with `?refresh=1`. Keep the page's existing loading/empty/error states and styling.

- [ ] **Step 1: Swap fetch + rendering**

- Fetch `/api/ads/dashboard` (and `/api/ads/dashboard?refresh=1` when the user clicks Refresh).
- Type the response with the `DashboardAd` interface exported from `AdDashboardCard`.
- Map each ad to `<AdDashboardCard key={ad.id} ad={ad} />`.
- Add a header row with a "Refresh now" button that sets a `refreshing` state, calls the refresh URL, and replaces the list.
- Preserve the empty state ("No ads yet — create one in the builder") and the unauthorized/redirect handling already present.

- [ ] **Step 2: Verify build + manual smoke**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: clean. Manually load `/ads/queue` in dev: cards render from stored data; "Refresh now" repopulates.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ads/queue/page.tsx"
git commit -m "feat(ads): render performance dashboard on the ads queue page"
```

---

## Phase 3 — AI advice

### Task 14: AI advice route

**Files:**
- Create: `src/lib/ads/advice.ts` (pure prompt builder + Cerebras call)
- Create: `src/app/api/ads/advice/route.ts`
- Test: `src/lib/ads/__tests__/advice.test.ts`

> The "Ask AI" button already calls `POST /api/ads/advice` with `{ adId }` (Task 12). The route loads the ad + its latest snapshot + brand brain + competitor intel, runs the rule engine for hard facts, and asks Cerebras for concrete next-step advice. Reuse the brand-brain/competitor fetch the way `generate`/`copy` routes do (read one of them first).

- [ ] **Step 1: Write the failing test for the prompt builder**

```ts
// src/lib/ads/__tests__/advice.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildAdvicePrompt } from '../advice';
import type { AdInsight } from '@/lib/meta/ad-insights';

const insight: AdInsight = {
  spend: 38.9, impressions: 21050, reach: 9800, clicks: 74, inlineLinkClicks: 70,
  ctr: 0.35, cpc: 0.53, frequency: 2.1, results: 3, resultType: 'link_click', currency: 'GBP',
};

describe('buildAdvicePrompt', () => {
  it('includes the metrics, objective and the rule reasons', () => {
    const p = buildAdvicePrompt({
      brandName: 'PaceBrain', objective: 'OUTCOME_LEADS', insight,
      reasons: ['CTR 0.35% is below the 0.8% benchmark for this goal.'],
      headline: 'Unlock your endurance profile', briefMd: null, competitorContext: null,
    });
    expect(p).toMatch(/PaceBrain/);
    expect(p).toMatch(/0\.35/);
    expect(p).toMatch(/benchmark/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ads/__tests__/advice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the prompt builder + advice call**

```ts
// src/lib/ads/advice.ts
// Builds the brand-aware "what to do next" prompt for a single ad and calls
// Cerebras. Pure prompt builder is unit-tested; getAdvice is integration-tested
// via the route. House style mirrors ad-copy.ts (no dashes, no emojis, no markdown).
import { cerebrasChatCompletion } from '@/lib/cerebras';
import type { AdInsight } from '@/lib/meta/ad-insights';

export interface AdviceInput {
  brandName: string;
  objective: string; // OUTCOME_*
  insight: AdInsight;
  reasons: string[]; // from evaluateSignals
  headline: string | null;
  briefMd?: string | null;
  competitorContext?: string | null;
}

export function buildAdvicePrompt(input: AdviceInput): string {
  const i = input.insight;
  const brief = input.briefMd ? `\nBRAND BRAIN (voice + positioning ground truth):\n${input.briefMd.slice(0, 2500)}\n` : '';
  const comp = input.competitorContext ? `\nCOMPETITOR ANGLE (position against, do not copy):\n${input.competitorContext.slice(0, 1000)}\n` : '';
  return `You are advising on a live Meta ad for "${input.brandName}" (objective ${input.objective}).

CURRENT AD
Headline: ${input.headline ?? '(none)'}
Metrics (last 14 days): spend ${i.spend.toFixed(2)} ${i.currency ?? ''}, impressions ${i.impressions}, clicks ${i.clicks}, CTR ${i.ctr.toFixed(2)}%, CPC ${i.cpc.toFixed(2)}, frequency ${i.frequency.toFixed(1)}, results ${i.results} (${i.resultType}).

DIAGNOSIS (already computed): ${input.reasons.join(' ')}
${brief}${comp}
Give 3 concrete, specific next steps to improve this ad's results next time. Be tactical: name the exact hook angle, audience tweak, or creative change to try, grounded in the brand truth above. No dashes, no emojis, no markdown. Reply as 3 short numbered sentences.`;
}

export async function getAdvice(input: AdviceInput): Promise<string> {
  const content = await cerebrasChatCompletion(
    [
      { role: 'system', content: 'You are a senior Meta ads strategist. Be specific and tactical. No dashes, no emojis, no markdown.' },
      { role: 'user', content: buildAdvicePrompt(input) },
    ],
    { temperature: 0.7, maxTokens: 600 },
  );
  return (content ?? '').trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ads/__tests__/advice.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the route**

```ts
// src/app/api/ads/advice/route.ts
// POST /api/ads/advice { adId } — on-demand AI next-step advice for one ad.
// Loads the ad (ownership-checked), its latest snapshot, brand brain + competitor
// intel, runs the rule engine for hard facts, then asks Cerebras. Best-effort:
// a model failure returns a friendly 200 message, never throws to the client.
import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAds, metaAdInsights, brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { evaluateSignals } from '@/lib/ads/signals';
import { getAdvice } from '@/lib/ads/advice';
import type { AdInsight } from '@/lib/meta/ad-insights';
// Reuse the brand-brain + competitor fetch helpers the generate/copy routes use.
// Read src/app/api/ads/generate/route.ts and import the same helpers
// (e.g. readBrandBrain from '@/lib/brain/consume' and the competitor intel fetch).

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const { adId } = (await req.json()) as { adId?: string };
    if (!adId) return NextResponse.json({ error: 'missing adId' }, { status: 400 });

    const [ad] = await db.select().from(metaAds)
      .where(and(eq(metaAds.id, adId), eq(metaAds.userId, userId))).limit(1);
    if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 });

    const [snap] = await db.select().from(metaAdInsights)
      .where(eq(metaAdInsights.metaAdsId, ad.id))
      .orderBy(desc(metaAdInsights.snapshotDate)).limit(1);
    if (!snap) return NextResponse.json({ success: true, advice: 'Not enough data yet — check back once this ad has run for a day or two.' });

    const insight: AdInsight = {
      spend: Number(snap.spend), impressions: snap.impressions, reach: snap.reach,
      clicks: snap.clicks, inlineLinkClicks: snap.inlineLinkClicks, ctr: Number(snap.ctr),
      cpc: Number(snap.cpc), frequency: Number(snap.frequency), results: snap.results,
      resultType: snap.resultType ?? 'link_click', currency: snap.currency,
    };
    const signals = evaluateSignals(insight, ad.objective);

    const [brand] = await db.select().from(brands).where(eq(brands.id, ad.brandId)).limit(1);
    const draft = (ad.draft ?? {}) as { headline?: string };

    // briefMd + competitorContext: fetch via the same helpers generate/route.ts uses.
    let briefMd: string | null = null;
    let competitorContext: string | null = null;
    try { /* briefMd = await readBrandBrain(brand.id ...); competitorContext = ... */ } catch { /* optional */ }

    try {
      const advice = await getAdvice({
        brandName: brand?.name ?? 'your brand',
        objective: ad.objective,
        insight,
        reasons: signals.reasons,
        headline: draft.headline ?? null,
        briefMd,
        competitorContext,
      });
      return NextResponse.json({ success: true, advice });
    } catch {
      return NextResponse.json({ success: true, advice: 'Could not generate advice right now. Please try again shortly.' });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get advice' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ads/advice.ts src/lib/ads/__tests__/advice.test.ts src/app/api/ads/advice/route.ts
git commit -m "feat(ads): on-demand AI next-step advice per ad"
```

---

## Final verification

- [ ] **Run the full ads suite**

Run: `npx vitest run src/app/api/ads src/lib/ads src/lib/meta`
Expected: all green (existing 123 + new tests).

- [ ] **Type-check the whole repo**

Run: `npx tsc --noEmit`
Expected: no NEW errors in any ads-module file (pre-existing unrelated errors in `scripts/_delpost.ts`, `deep-profile.test.ts`, `tests/e2e/brain.spec.ts` may remain).

- [ ] **Manual smoke (dev server)**

- `/ads` builder: add two nearby cities → second is blocked with a warning.
- Publish a test ad (stays PAUSED) → appears on `/ads/queue` with status from read-back.
- `/ads/queue`: cards render; "Refresh now" pulls live numbers; "✨ Ask AI" returns advice.

---

## Coverage check (plan ↔ spec)

- Spec A1 overlapping cities → Tasks 1–4. A2 read-back → Task 5. A3 status sync → Task 9.
- Spec B1 insights client → Task 6. B2 table → Task 7. B3 cron + refresh → Tasks 9 & 11.
- Spec C1 page → Task 13. C2 dashboard API → Task 11. C3 signals → Task 10. C4 AI advice → Task 14.
- Spec §6 LEADS caveat → encoded in `RESULT_TYPE` (Task 6) + honest "results (link clicks)" labeling.
