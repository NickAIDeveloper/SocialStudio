# Competitor Post-Level Ingest — Design

**Status:** Approved (2026-05-10)
**Subsystem:** #2 of 5 in the autonomous-marketing roadmap.
**Depends on:** subsystem #1 (daily brand brain) — already shipped.
**Unlocks:** subsystem #4 (caption format matcher) gets clean per-post competitor data.

## Goal

Replace the broken Playwright-based competitor post scrape with Meta's Instagram
Business Discovery API. Populate `scrapedPosts` with public competitor data
(captions, likes, comments, timestamps, media types) on a daily cadence,
piggybacking on the existing brain cron. Fix `TODO-NEXT.md` issues #3 and #4.

## Non-goals

- Scraping personal IG accounts (Business Discovery rejects them — Playwright
  remains as a fallback for those, but is not recommended).
- Reach/saves/shares for competitors — Meta only exposes those for accounts
  the user owns. Always has been; nothing to do here.
- Touching the `/competitors` UI design — only fixing the data backing it.
- New tables. The existing `scrapedAccounts` + `scrapedPosts` are the surface.

## Approach

### Primary path — Meta Instagram Business Discovery

```
GET https://graph.facebook.com/v21.0/{your-ig-user-id}
  ?fields=business_discovery.username({handle}){
    followers_count,
    media_count,
    media.limit(25){
      id, caption, timestamp,
      like_count, comments_count,
      media_type, media_product_type,
      permalink, thumbnail_url, media_url
    }
  }
  &access_token={ig-token}
```

Authenticated by the user's existing IG Login for Business token (already in
`instagramAccounts.accessToken`). Returns up to 25 most recent media. Free,
Meta-stable, and the API actually exists.

### Fallback path — Playwright (rare)

If Business Discovery returns `error.code === 110` or similar "username not
found / not a business account", fall through to the existing
`scrapeCompetitor()` Playwright function. Most competitors users add are
business accounts, so this fallback fires rarely.

## Architecture

```
GitHub Actions daily cron (existing)
        │
        ▼
scripts/brain/run-daily.mjs
  ├── (existing) per brand: snapshot×3 → compute → brief
  └── (new) per brand: POST /api/competitors/sync?brandId=X (HMAC)
                              │
                              ▼
                ┌───────────────────────────┐
                │ /api/competitors/sync     │
                │   1. List scraped_accounts│
                │      where brandId AND    │
                │      isCompetitor         │
                │   2. For each handle:     │
                │      a. Try Business      │
                │         Discovery         │
                │      b. Fall back to      │
                │         Playwright        │
                │   3. UPSERT scraped_posts │
                │   4. Update scraped_      │
                │      accounts.lastScraped │
                └───────────────────────────┘
```

A user-triggered "Sync now" button on `/competitors` calls the same logic via
a session-authed wrapper (parallels the brain `/trigger` endpoint).

## Schema additions

Two new nullable columns on `scrapedPosts`:

```ts
mediaType: varchar('media_type', { length: 16 }), // REEL | CAROUSEL | IMAGE
permalink: text('permalink'),
```

Existing columns reused: `shortcode` (the `id` from Meta becomes the
shortcode), `caption`, `likes`, `comments`, `imageUrl` (from `thumbnail_url`
or `media_url`), `isVideo` (derive from `media_type`), `hashtags` (extract from
caption), `postedAt` (from `timestamp`), `scrapedAt`.

Migration is additive; existing rows get nulls in the new columns.

## Modules

```
src/lib/competitors/
  business-discovery.ts        Meta Graph wrapper (pure, fetcher injectable)
  sync-competitors.ts          Orchestrates per-brand sync, calls business-
                               discovery + falls back to Playwright if needed
  __tests__/
    business-discovery.test.ts Fixture-based, asserts upsert payload shape
    fallback.test.ts           Meta returns 400 → Playwright path triggers
    rate-limit.test.ts         X-App-Usage ≥80 → returns partial

src/app/api/competitors/
  sync/route.ts                HMAC-authed POST (called by cron)
  trigger/route.ts             Session-authed POST (called by /competitors UI)
```

The existing `src/app/api/competitors/scrape/route.ts` becomes a thin shim
calling `sync-competitors.ts`. The user-facing API doesn't change.

## Endpoints

### `POST /api/competitors/sync?brandId=<id>`

- HMAC-authed (same `BRAIN_CRON_SECRET` shared infra)
- Body: `{ runId: <uuid>, day: <YYYY-MM-DD> }`
- Response: `{ status: 'ok'|'partial'|'failed', updated: number, errors: string[] }`

### `POST /api/competitors/trigger?brandId=<id>`

- NextAuth session-authed
- Body: empty
- Internally calls `/api/competitors/sync` with HMAC sig (same pattern as
  `/api/brain/trigger`)

## Rate-limit / failure handling

Same discipline as brain v1:
1. Honor `X-App-Usage` headers — halt at ≥80%
2. 250ms spacing between handle calls
3. Retry 3× with exponential backoff (1s, 4s, 16s + jitter) on 5xx + 429
4. Conservative — partial > banned

## Cron orchestration

Update `scripts/brain/run-daily.mjs` to add one step per brand AFTER the
existing brain pipeline (so brain runs first; competitors second):

```js
const compResult = await call(`/api/competitors/sync?brandId=${brand.id}`, { runId, day });
console.log('  competitors:', compResult.status, compResult.json?.updated ?? '');
```

Brand-level jitter already happens before each brand's run — no change
needed. Total daily runtime per brand goes from ~30s to ~60s (depending on
competitor count).

## Brain integration

Currently the brain's `competitor_account` snapshot reads only
`scrapedAccounts` (account-level: follower count, post count). After this
ships, the snapshot will additionally pull recent `scrapedPosts` rows so the
brain's `competitor_summary` can include:

- Top-performing competitor caption patterns (hook style buckets)
- Median caption length across competitors
- Posting cadence (posts per week median)
- Most-engaged hashtag overlap

This adds a small modification to `src/app/api/brain/snapshot/route.ts` in
the `competitor_account` branch — pull the last 28 days of `scrapedPosts`
joined to `scrapedAccounts` (filtered by brandId), trim to top-N per
competitor by likes, include in the snapshot payload.

## What `/competitors` page sees

The page already reads `scrapedAccounts` + `scrapedPosts` and computes
scorecards. Once posts have non-zero likes/comments (which they will, with
real data flowing), the N/A scorecards become real data. **No UI changes
required**, only a refresh of stale data via the existing scrape button or
the new daily cron.

## Tests

```
src/lib/competitors/__tests__/
  business-discovery.test.ts  3 tests:
    - parses Meta response → ScrapedPost[]
    - handles missing media in response (returns empty array, no throw)
    - extracts hashtags from caption text
  fallback.test.ts             1 test:
    - Meta returns 400 with code 110 → Playwright fallback called
  rate-limit.test.ts           1 test:
    - X-App-Usage ≥80 → returns { status: 'partial', reason: 'rate_limited' }
  sync-orchestration.test.ts   2 tests:
    - given 2 competitor handles → 2 upsert calls
    - one handle fails → other still upserts, returns partial
```

No live Meta calls in tests; all responses fixtured.

## Rollout

1. Schema migration (`drizzle-kit push`) — adds 2 nullable columns
2. Ship endpoints + sync logic + tests
3. Add cron step to `run-daily.mjs`
4. First manual workflow_dispatch to verify a brand's competitors populate
5. Brain extension (read scrapedPosts in competitor_account snapshot) — small
   diff, ships in same PR
6. Daily cron picks it up automatically the next 03:00 UTC

## Environment variables

No new env vars. Reuses:
- `BRAIN_CRON_SECRET` (HMAC for cron-called endpoints)
- `META_IG_APP_ID` / `META_IG_APP_SECRET` (already in use by brain)

## Failure modes

| Failure | Behaviour |
|---|---|
| Brand has zero competitors configured | `{ status: 'skipped', reason: 'no_competitors' }` |
| Brand's user has no IG token | `{ status: 'skipped', reason: 'no_ig_token' }` |
| Competitor handle is personal account | Fall back to Playwright; if also fails, log and skip |
| Competitor handle no longer exists | Set `lastScrapedAt = now()` so we don't retry every minute, log error |
| Rate limit reached | Halt brand, resume tomorrow |
| All competitors fail | `{ status: 'failed', errors: [...] }` |

## Out of scope (for #4 and beyond)

- Caption format pattern extraction from competitor posts → subsystem #4
- Surfacing competitor signals in Smart Posts directly → subsystem #4
- Per-competitor brain (scoring each competitor's relevance) → not planned
- Hashtag analysis dashboard → not planned

## References

- Meta Business Discovery: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
- Existing scraper: `src/lib/instagram-scraper.ts` (Playwright)
- Existing routes: `src/app/api/competitors/{route,scrape,suggest}.ts`
- Existing schema: `scrapedAccounts`, `scrapedPosts` in `src/lib/db/schema.ts`
- TODO bugs being fixed: TODO-NEXT.md items #3 and #4
