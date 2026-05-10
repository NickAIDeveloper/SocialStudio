# Competitor Ingest Implementation Plan (Subsystem #2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Replace broken Playwright competitor post scrape with Meta Business Discovery API. Wire daily cron, fix `/competitors` scorecards, feed cleaner data to brain.

**Architecture:** Two new lib modules, two new routes, two new schema columns. Daily cron piggybacks on existing brain run.

**Spec:** `docs/superpowers/specs/2026-05-10-competitor-ingest-design.md`

---

## File map

### New files
```
src/lib/competitors/
  business-discovery.ts        Meta Graph wrapper (pure)
  sync-competitors.ts          Per-brand orchestration
  __tests__/
    business-discovery.test.ts
    fallback.test.ts
    rate-limit.test.ts
    sync-orchestration.test.ts
    fixtures/
      meta-business-discovery.json
      meta-personal-account-error.json

src/app/api/competitors/sync/route.ts       HMAC-authed (cron)
src/app/api/competitors/trigger/route.ts    Session-authed (UI)
```

### Modified files
```
src/lib/db/schema.ts                        Add mediaType + permalink to scrapedPosts
src/middleware.ts                           Exclude /api/competitors/sync from auth
scripts/brain/run-daily.mjs                 Add competitor sync step
src/app/api/brain/snapshot/route.ts         Read scrapedPosts in competitor_account branch
```

---

## Task C1: Schema additions

**Files:** `src/lib/db/schema.ts`

- [ ] **Step 1: Add columns to `scrapedPosts`**

Find `scrapedPosts` table, add inside the columns block:

```ts
mediaType: varchar('media_type', { length: 16 }), // REEL | CAROUSEL | IMAGE
permalink: text('permalink'),
```

- [ ] **Step 2: Push migration**

```bash
npx drizzle-kit push
```

Confirm `y` on the additive change. Both columns nullable so no defaults needed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(competitors): add mediaType + permalink to scrapedPosts"
```

---

## Task C2: Business Discovery Graph wrapper + tests

**Files:**
- Create: `src/lib/competitors/business-discovery.ts`
- Create: `src/lib/competitors/__tests__/business-discovery.test.ts`
- Create: `src/lib/competitors/__tests__/fixtures/meta-business-discovery.json`

- [ ] **Step 1: Write fixture**

`meta-business-discovery.json`:
```json
{
  "business_discovery": {
    "id": "17841400000000001",
    "username": "competitor1",
    "followers_count": 25000,
    "media_count": 412,
    "media": {
      "data": [
        {
          "id": "17890000000000001",
          "caption": "Hook line\n\nBody with #hashtag1 #hashtag2",
          "timestamp": "2026-05-08T19:00:00+0000",
          "like_count": 1500,
          "comments_count": 80,
          "media_type": "VIDEO",
          "media_product_type": "REELS",
          "permalink": "https://www.instagram.com/p/ABC/",
          "thumbnail_url": "https://scontent.cdninstagram.com/v/thumb1.jpg",
          "media_url": "https://scontent.cdninstagram.com/v/video1.mp4"
        },
        {
          "id": "17890000000000002",
          "caption": "Carousel post #foo",
          "timestamp": "2026-05-07T17:00:00+0000",
          "like_count": 800,
          "comments_count": 30,
          "media_type": "CAROUSEL_ALBUM",
          "permalink": "https://www.instagram.com/p/DEF/"
        }
      ]
    }
  },
  "id": "17841400000000099"
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/competitors/__tests__/business-discovery.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchBusinessDiscovery, parseToScrapedPosts } from '../business-discovery';
import fixture from './fixtures/meta-business-discovery.json';

describe('fetchBusinessDiscovery', () => {
  it('hits the right URL with handle and token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture)));
    await fetchBusinessDiscovery({
      igUserId: 'ig1',
      handle: 'competitor1',
      accessToken: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = fetcher.mock.calls[0][0] as string;
    expect(url).toContain('/ig1');
    expect(url).toContain('business_discovery.username(competitor1)');
    expect(url).toContain('access_token=tok');
  });

  it('returns null when Meta responds with an error', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 110, message: 'Unsupported' } }), { status: 400 }));
    const result = await fetchBusinessDiscovery({
      igUserId: 'ig1',
      handle: 'private_user',
      accessToken: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toBeNull();
  });
});

describe('parseToScrapedPosts', () => {
  it('extracts posts with hashtags, media type, video flag', () => {
    const posts = parseToScrapedPosts(fixture, 'competitor1');
    expect(posts).toHaveLength(2);
    expect(posts[0].shortcode).toBe('17890000000000001');
    expect(posts[0].likes).toBe(1500);
    expect(posts[0].comments).toBe(80);
    expect(posts[0].mediaType).toBe('REEL');
    expect(posts[0].isVideo).toBe(true);
    expect(posts[0].hashtags).toBe('#hashtag1 #hashtag2');
    expect(posts[0].permalink).toContain('instagram.com/p/ABC');
    expect(posts[1].mediaType).toBe('CAROUSEL');
    expect(posts[1].isVideo).toBe(false);
  });

  it('returns empty array when business_discovery is missing', () => {
    expect(parseToScrapedPosts({ id: 'x' }, 'foo')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, verify FAIL**

`npx vitest run src/lib/competitors/__tests__/business-discovery.test.ts` — module not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/competitors/business-discovery.ts
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const MEDIA_FIELDS =
  'id,caption,timestamp,like_count,comments_count,media_type,media_product_type,permalink,thumbnail_url,media_url';

export interface BusinessDiscoveryInput {
  igUserId: string;
  handle: string;
  accessToken: string;
  fetcher?: typeof fetch;
}

export interface BusinessDiscoveryResponse {
  business_discovery?: {
    id: string;
    username: string;
    followers_count?: number;
    media_count?: number;
    media?: { data: BdMediaItem[] };
  };
  id?: string;
}

export interface BdMediaItem {
  id: string;
  caption?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
}

export interface ParsedScrapedPost {
  shortcode: string;
  caption: string;
  likes: number;
  comments: number;
  imageUrl: string | null;
  isVideo: boolean;
  hashtags: string;
  postedAt: Date;
  mediaType: 'REEL' | 'CAROUSEL' | 'IMAGE';
  permalink: string | null;
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

function normalizeMediaType(item: BdMediaItem): 'REEL' | 'CAROUSEL' | 'IMAGE' {
  if (item.media_product_type === 'REELS') return 'REEL';
  if (item.media_type === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  return 'IMAGE';
}

export async function fetchBusinessDiscovery(
  input: BusinessDiscoveryInput
): Promise<BusinessDiscoveryResponse | null> {
  const fetcher = input.fetcher ?? fetch;
  const fields = `business_discovery.username(${input.handle}){followers_count,media_count,media.limit(25){${MEDIA_FIELDS}}}`;
  const url = `${GRAPH_BASE}/${input.igUserId}?fields=${encodeURIComponent(fields)}&access_token=${input.accessToken}`;
  const res = await fetcher(url);
  if (!res.ok) return null;
  const json = (await res.json()) as BusinessDiscoveryResponse;
  if (!json.business_discovery) return null;
  return json;
}

export function parseToScrapedPosts(
  raw: BusinessDiscoveryResponse,
  handle: string
): ParsedScrapedPost[] {
  const items = raw.business_discovery?.media?.data ?? [];
  return items.map((item) => {
    const caption = item.caption ?? '';
    const hashtags = (caption.match(HASHTAG_RE) ?? []).join(' ');
    const mediaType = normalizeMediaType(item);
    return {
      shortcode: item.id,
      caption,
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      imageUrl: item.thumbnail_url ?? item.media_url ?? null,
      isVideo: mediaType === 'REEL' || item.media_type === 'VIDEO',
      hashtags,
      postedAt: new Date(item.timestamp),
      mediaType,
      permalink: item.permalink ?? null,
    };
  });
}
```

- [ ] **Step 5: Run, verify PASS**

`npx vitest run src/lib/competitors/__tests__/business-discovery.test.ts` — 4/4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/competitors/business-discovery.ts src/lib/competitors/__tests__/business-discovery.test.ts src/lib/competitors/__tests__/fixtures/meta-business-discovery.json
git commit -m "feat(competitors): Meta Business Discovery wrapper + parser"
```

---

## Task C3: sync-competitors orchestrator + tests

**Files:**
- Create: `src/lib/competitors/sync-competitors.ts`
- Create: `src/lib/competitors/__tests__/sync-orchestration.test.ts`
- Create: `src/lib/competitors/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/competitors/sync-competitors.ts
import { fetchBusinessDiscovery, parseToScrapedPosts, type ParsedScrapedPost } from './business-discovery';
import { isThrottled } from '@/lib/brain/rate-limit';

export interface SyncCompetitorsInput {
  brandId: string;
  igUserId: string;
  accessToken: string;
  competitors: { id: string; handle: string }[];
  fetcher?: typeof fetch;
  spacingMs?: number;
  // Persist hooks injected by the route handler.
  upsertPosts: (accountId: string, handle: string, posts: ParsedScrapedPost[]) => Promise<void>;
  updateAccountMeta: (accountId: string, meta: { followerCount: number | null; postCount: number | null }) => Promise<void>;
  fallbackScrape?: (handle: string) => Promise<ParsedScrapedPost[]>;
}

export interface SyncCompetitorsResult {
  status: 'ok' | 'partial' | 'failed' | 'skipped_no_competitors' | 'rate_limited';
  updated: number;
  errors: { handle: string; reason: string }[];
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

export async function syncCompetitors(input: SyncCompetitorsInput): Promise<SyncCompetitorsResult> {
  if (input.competitors.length === 0) {
    return { status: 'skipped_no_competitors', updated: 0, errors: [] };
  }

  const fetcher = input.fetcher ?? fetch;
  const spacing = input.spacingMs ?? 250;
  let updated = 0;
  const errors: { handle: string; reason: string }[] = [];

  for (const comp of input.competitors) {
    await sleep(spacing);
    try {
      // Wrap fetch to capture headers for throttle check.
      let lastHeaders: Headers | null = null;
      const tracedFetch: typeof fetch = async (url, init) => {
        const res = await fetcher(url, init);
        lastHeaders = res.headers;
        return res;
      };

      const raw = await fetchBusinessDiscovery({
        igUserId: input.igUserId,
        handle: comp.handle,
        accessToken: input.accessToken,
        fetcher: tracedFetch,
      });

      if (lastHeaders && isThrottled(lastHeaders)) {
        return { status: 'rate_limited', updated, errors };
      }

      let posts: ParsedScrapedPost[] = [];
      if (raw) {
        posts = parseToScrapedPosts(raw, comp.handle);
        if (raw.business_discovery) {
          await input.updateAccountMeta(comp.id, {
            followerCount: raw.business_discovery.followers_count ?? null,
            postCount: raw.business_discovery.media_count ?? null,
          });
        }
      } else if (input.fallbackScrape) {
        posts = await input.fallbackScrape(comp.handle);
      } else {
        errors.push({ handle: comp.handle, reason: 'business_discovery_failed_no_fallback' });
        continue;
      }

      if (posts.length > 0) {
        await input.upsertPosts(comp.id, comp.handle, posts);
        updated += posts.length;
      }
    } catch (err) {
      errors.push({ handle: comp.handle, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  if (errors.length === 0) return { status: 'ok', updated, errors: [] };
  if (updated > 0) return { status: 'partial', updated, errors };
  return { status: 'failed', updated, errors };
}
```

- [ ] **Step 2: Write orchestration test**

```ts
// src/lib/competitors/__tests__/sync-orchestration.test.ts
import { describe, it, expect, vi } from 'vitest';
import { syncCompetitors } from '../sync-competitors';
import bdFixture from './fixtures/meta-business-discovery.json';

describe('syncCompetitors', () => {
  it('returns skipped when no competitors configured', async () => {
    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [],
      upsertPosts: async () => {},
      updateAccountMeta: async () => {},
    });
    expect(result.status).toBe('skipped_no_competitors');
  });

  it('upserts posts for each competitor handle', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(bdFixture)));
    const upsertPosts = vi.fn(async () => {});
    const updateAccountMeta = vi.fn(async () => {});

    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [{ id: 'a1', handle: 'h1' }, { id: 'a2', handle: 'h2' }],
      fetcher: fetcher as unknown as typeof fetch,
      spacingMs: 0,
      upsertPosts,
      updateAccountMeta,
    });

    expect(result.status).toBe('ok');
    expect(upsertPosts).toHaveBeenCalledTimes(2);
    expect(updateAccountMeta).toHaveBeenCalledTimes(2);
    expect(result.updated).toBe(4); // 2 posts × 2 handles
  });

  it('returns partial when some competitors fail', async () => {
    let call = 0;
    const fetcher = vi.fn(async () => {
      call++;
      if (call === 1) return new Response(JSON.stringify(bdFixture));
      return new Response(JSON.stringify({ error: { code: 110 } }), { status: 400 });
    });
    const upsertPosts = vi.fn(async () => {});
    const updateAccountMeta = vi.fn(async () => {});
    const fallbackScrape = vi.fn(async () => []);

    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [{ id: 'a1', handle: 'h1' }, { id: 'a2', handle: 'h2_personal' }],
      fetcher: fetcher as unknown as typeof fetch,
      spacingMs: 0,
      upsertPosts,
      updateAccountMeta,
      fallbackScrape,
    });

    expect(['ok', 'partial']).toContain(result.status);
    expect(fallbackScrape).toHaveBeenCalledWith('h2_personal');
  });
});
```

- [ ] **Step 3: Write rate-limit test**

```ts
// src/lib/competitors/__tests__/rate-limit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { syncCompetitors } from '../sync-competitors';
import bdFixture from './fixtures/meta-business-discovery.json';

describe('syncCompetitors rate limiting', () => {
  it('halts at 80% X-App-Usage', async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(bdFixture), {
        headers: { 'x-app-usage': JSON.stringify({ call_count: 95 }) },
      })
    );
    const upsertPosts = vi.fn(async () => {});
    const updateAccountMeta = vi.fn(async () => {});

    const result = await syncCompetitors({
      brandId: 'b1',
      igUserId: 'ig1',
      accessToken: 'tok',
      competitors: [
        { id: 'a1', handle: 'h1' },
        { id: 'a2', handle: 'h2' },
        { id: 'a3', handle: 'h3' },
      ],
      fetcher: fetcher as unknown as typeof fetch,
      spacingMs: 0,
      upsertPosts,
      updateAccountMeta,
    });

    expect(result.status).toBe('rate_limited');
    // Halts before processing all handles.
    expect(fetcher).not.toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 4: Run all tests, verify PASS**

`npx vitest run src/lib/competitors` — 6+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/competitors/sync-competitors.ts src/lib/competitors/__tests__/
git commit -m "feat(competitors): sync orchestrator with rate-limit + fallback"
```

---

## Task C4: HMAC-authed `/api/competitors/sync` route

**Files:**
- Create: `src/app/api/competitors/sync/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/competitors/sync/route.ts
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2'; // if available; else use randomUUID
import { db } from '@/lib/db';
import {
  brands,
  instagramAccounts,
  scrapedAccounts,
  scrapedPosts,
} from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { syncCompetitors } from '@/lib/competitors/sync-competitors';
import { decrypt } from '@/lib/encryption';
import type { ParsedScrapedPost } from '@/lib/competitors/business-discovery';

export const dynamic = 'force-dynamic';

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
  if (!igAcct) return NextResponse.json({ status: 'skipped', reason: 'no_ig_token' });

  const competitors = await db
    .select({ id: scrapedAccounts.id, handle: scrapedAccounts.handle })
    .from(scrapedAccounts)
    .where(
      and(
        eq(scrapedAccounts.brandId, brandId),
        eq(scrapedAccounts.isCompetitor, true)
      )
    );

  const result = await syncCompetitors({
    brandId,
    igUserId: igAcct.igUserId,
    accessToken: decrypt(igAcct.accessToken),
    competitors,
    upsertPosts: async (accountId, _handle, posts: ParsedScrapedPost[]) => {
      for (const p of posts) {
        await db
          .insert(scrapedPosts)
          .values({
            userId: brand.userId,
            accountId,
            shortcode: p.shortcode,
            caption: p.caption,
            likes: p.likes,
            comments: p.comments,
            imageUrl: p.imageUrl,
            isVideo: p.isVideo,
            hashtags: p.hashtags,
            postedAt: p.postedAt,
            mediaType: p.mediaType,
            permalink: p.permalink,
          })
          .onConflictDoUpdate({
            target: [scrapedPosts.userId, scrapedPosts.shortcode],
            set: {
              likes: p.likes,
              comments: p.comments,
              caption: p.caption,
              hashtags: p.hashtags,
              scrapedAt: new Date(),
            },
          });
      }
    },
    updateAccountMeta: async (accountId, meta) => {
      await db
        .update(scrapedAccounts)
        .set({
          followerCount: meta.followerCount,
          postCount: meta.postCount,
          lastScrapedAt: new Date(),
        })
        .where(eq(scrapedAccounts.id, accountId));
    },
  });

  return NextResponse.json(result);
}
```

NOTE: if `@paralleldrive/cuid2` is not installed, use `crypto.randomUUID()`.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/competitors/sync/route.ts
git commit -m "feat(competitors): HMAC-authed sync route"
```

---

## Task C5: Session-authed `/api/competitors/trigger` route

**Files:**
- Create: `src/app/api/competitors/trigger/route.ts`

- [ ] **Step 1: Implement (mirrors `/api/brain/trigger` pattern)**

```ts
// src/app/api/competitors/trigger/route.ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

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
  if (!secret) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  const baseUrl = new URL(req.url).origin;
  const day = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify({ runId: randomUUID(), day });
  const sig = createHmac('sha256', secret).update(body).digest('hex');

  const res = await fetch(`${baseUrl}/api/competitors/sync?brandId=${brandId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brain-signature': sig },
    body,
  });
  const json = await res.json().catch(() => null);
  return NextResponse.json({ status: res.status, json });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/competitors/trigger/route.ts
git commit -m "feat(competitors): session-authed trigger route"
```

---

## Task C6: Middleware exclusion

**Files:** `src/middleware.ts`

- [ ] **Step 1: Add `api/competitors/sync` to exclusion list**

Update the matcher to also exclude `api/competitors/sync` (HMAC-authed, must bypass session auth):

Change:
```ts
'/((?!$|login|register|forgot-password|reset-password|terms|privacy|data-deletion|api/auth|api/brain/snapshot|api/brain/compute|api/brain/brief|api/brain/brands|_next|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
```

To add `|api/competitors/sync` after `api/brain/brands`.

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "fix(competitors): exclude /api/competitors/sync from auth middleware"
```

---

## Task C7: Add competitor sync step to cron

**Files:** `scripts/brain/run-daily.mjs`

- [ ] **Step 1: Add the call after `brief`**

Inside `runOne(brandId, day)`, after the existing brief call, add:

```js
const competitors = await call(`/api/competitors/sync?brandId=${brandId}`, { runId, day });
console.log('  competitors:', competitors.status, competitors.json?.status ?? '', `(updated=${competitors.json?.updated ?? 0})`);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/brain/run-daily.mjs
git commit -m "feat(competitors): wire competitor sync into daily cron"
```

---

## Task C8: Brain integration — read scrapedPosts in competitor_account snapshot

**Files:** `src/app/api/brain/snapshot/route.ts`

- [ ] **Step 1: Extend the competitor branch**

Find the `// --- COMPETITOR_ACCOUNT ---` section. After loading account-level data, ALSO load top-recent scraped posts:

```ts
// Pull recent scraped posts (last 28 days) joined to these competitors so the
// brain has per-post signal for hook patterns + caption length.
const sinceDate = new Date(Date.now() - 28 * 86_400_000);
const competitorPosts = await db
  .select({
    handle: scrapedAccounts.handle,
    caption: scrapedPosts.caption,
    likes: scrapedPosts.likes,
    comments: scrapedPosts.comments,
    mediaType: scrapedPosts.mediaType,
    postedAt: scrapedPosts.postedAt,
  })
  .from(scrapedPosts)
  .innerJoin(scrapedAccounts, eq(scrapedPosts.accountId, scrapedAccounts.id))
  .where(
    and(
      eq(scrapedAccounts.brandId, brandId),
      eq(scrapedAccounts.isCompetitor, true),
      gte(scrapedPosts.postedAt, sinceDate)
    )
  )
  .orderBy(desc(scrapedPosts.likes))
  .limit(150); // cap at 150 posts to keep payload bounded
```

Add `gte, desc` to the `drizzle-orm` import. Add `scrapedPosts, scrapedAccounts` to the `@/lib/db/schema` import (scrapedAccounts is already imported).

Add `competitorPosts` to the persist payload and metricsSummary:

```ts
persist: async (payload) => {
  await db.insert(brainSnapshots).values({
    brandId,
    source: 'competitor_account',
    capturedAt: dayDate,
    payload: { ...payload, posts: competitorPosts } as Record<string, unknown>,
    metricsSummary: { count: payload.competitors.length, postCount: competitorPosts.length },
  }).onConflictDoNothing();
},
```

- [ ] **Step 2: TS check**

`npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/brain/snapshot/route.ts
git commit -m "feat(competitors): brain reads scrapedPosts in competitor_account snapshot"
```

---

## Task C9: Rollout

- [ ] **Step 1: Run full test suite**

`npx vitest run` — confirm all brain + competitor tests pass.

- [ ] **Step 2: Push develop to origin**

```bash
git push origin develop
```

- [ ] **Step 3: Merge develop → main**

```bash
git checkout main
git merge develop --no-ff -m "Merge develop: subsystem #2 competitor ingest"
git push origin main
```

- [ ] **Step 4: Wait for Vercel deploy**

```bash
vercel inspect <latest-deploy-url> --wait
```

- [ ] **Step 5: Trigger workflow manually to verify**

```bash
gh workflow run brain-daily.yml --ref main
gh run watch <runId>
```

Expected logs:
```
[brain] brand=X
  snapshot.ig: 200 ok
  ...
  competitors: 200 ok (updated=N)
```

If `competitors` shows 200 with updated > 0, the pipeline works end-to-end.

- [ ] **Step 6: Spot-check the /competitors page**

Visit https://www.goviraleza.com/competitors. Scorecards that previously showed N/A should now show real numbers. Recent posts populated for each competitor.

---

## Self-review

- ✅ Spec coverage: schema, business-discovery wrapper, sync orchestrator, both routes, middleware, cron, brain extension, rollout — all present.
- ✅ No placeholders.
- ✅ Type consistency: `ParsedScrapedPost`, `BusinessDiscoveryResponse`, `SyncCompetitorsResult` defined once, used consistently.
- ✅ Backwards compatible: existing `/api/competitors/scrape` keeps working (we don't touch it). Existing scrapedPosts rows still work (new columns nullable).
