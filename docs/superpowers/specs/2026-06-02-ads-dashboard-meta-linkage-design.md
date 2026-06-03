# Ad Dashboard + Meta Linkage Hardening — Design

**Date:** 2026-06-02
**Status:** Approved design, pending implementation plan
**Area:** `/ads` module (Meta ad builder)

## 1. Summary

Two outcomes:

1. **Tighten the /ads ↔ Meta linkage** so every ad we build is complete, valid, and
   runnable by Meta without manual fixes — and our records stay in sync with the live ad.
2. **Add an in-app ad dashboard** in Viraleza that shows a preview of each created ad,
   its live performance (how it's going, what's working, what isn't), and concrete
   suggestions for next time.

The existing builder already creates valid PAUSED ad trees with rollback (verified in
production: latest publish landed correctly, all failed trees were cleaned up). This work
adds confirmation/sync on top of that, plus the performance layer that does not exist yet
(today we fetch only `effective_status`, no spend/impressions/clicks).

## 2. Goals / Non-goals

**Goals**
- No ad we publish gets rejected for a cause we could have caught (start with overlapping
  cities, subcode 1487756).
- Immediately after publish, the app reflects Meta's real verdict (in review / active /
  rejected reason).
- A dashboard at `/ads` with one card per ad: preview + live metrics + trend + a
  working/watch/not verdict + a suggestion.
- Suggestions are **hybrid**: always-on deterministic rule flags, plus an on-demand
  "Ask AI" button that uses the brand brain for brand-aware next-step advice.

**Non-goals**
- No changes to the generation/wizard flow ("make it easier" was dropped).
- No Meta Lead Forms or Pixel/Conversions API integration in this scope (see §6 caveat).
- No automated budget/bid changes — suggestions only; the user acts in Ads Manager.

## 3. Workstream A — Linkage hardening

### A1. Overlapping-city guard
- Meta's `adgeolocation` search already returns `latitude`/`longitude` for each city.
  Persist coords (+ radius, unit) on the selected-city object in the draft.
- Overlap test (pure function, `lib/ads/geo-overlap.ts`): two cities overlap when
  `haversineMiles(a, b) < (radiusMiles(a) + radiusMiles(b))`. Normalize km→mi before
  comparing. Exact-duplicate keys also count as overlap.
- **UI** (`StepAudience.tsx`): on add, if the new city overlaps an existing one, show an
  inline warning and don't add it (offer "replace" / "remove the other").
- **Server** (`publish/route.ts`): re-run the same check before any Meta write; reject
  with a friendly message. This makes 1487756 unreachable.

### A2. Read-back confirmation on publish
- After `createAd`, call a new `getAd(token, adId)` (`fields=effective_status,review_feedback`)
  and persist `status`/`liveStatus` + any review feedback onto the `meta_ads` row before
  returning. The success response already redirects to the dashboard, which then shows the
  true state instead of an optimistic "PAUSED".
- Best-effort: a read-back failure does not fail the publish (the ad exists); we just fall
  back to the stored status.

### A3. Ongoing status sync
- The daily cron (§4) refreshes each non-archived `meta_ads` row's `effective_status`.
- If Meta returns 404/deleted for an ad we think is live, mark the row `ARCHIVED` (or
  `DELETED`) so the dashboard matches Ads Manager (this already happened once — the
  10:54 ad was deleted in Meta; the dashboard should reflect that automatically).

## 4. Workstream B — Insights ingestion

### B1. Meta client — `lib/meta/ad-insights.ts`
- `getAdInsights(token, adIds, range)` → `GET /<ad_id>/insights` with
  `fields=spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,frequency,actions`
  and a date preset/time range. Batch per ad; 8s timeout each; null on failure
  (same best-effort posture as `getAdStatuses`).
- Objective-aware **Results** derived from the `actions` array via a mapping table:

  | Objective | Meta objective | Result action_type |
  |---|---|---|
  | TRAFFIC | OUTCOME_TRAFFIC | `link_click` (fallback `landing_page_view`) |
  | ENGAGEMENT | OUTCOME_ENGAGEMENT | `post_engagement` |
  | LEADS | OUTCOME_LEADS | `link_click` (see §6 caveat — no lead form/pixel) |
  | APP | OUTCOME_APP_PROMOTION | `mobile_app_install` (fallback `app_install`) |

### B2. Storage — new table `meta_ad_insights`
Daily snapshot per ad (enables ▲/▼ trends). Idempotent on `(metaAdsId, snapshotDate)`.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| metaAdsId | uuid FK → meta_ads.id (cascade) | |
| adId | varchar(64) | denormalized Meta ad id |
| snapshotDate | date | UTC date the metrics cover; unique with metaAdsId |
| currency | varchar(3) | account currency |
| spend | numeric(12,2) | account currency |
| impressions | integer | |
| reach | integer | |
| clicks | integer | |
| inlineLinkClicks | integer | |
| ctr | numeric(6,3) | percent |
| cpc | numeric(10,2) | |
| frequency | numeric(6,2) | |
| results | integer | objective-aware |
| resultType | varchar(48) | e.g. `link_click`, `lead`, `mobile_app_install` |
| raw | jsonb | full insights payload |
| fetchedAt | timestamp | |
| createdAt | timestamp default now() | |

### B3. Refresh paths
- **Daily cron** `GET /api/cron/sync-ad-insights`: follows the **existing autopilot
  GH-Actions 03:00 UTC pattern** and its shared-secret auth (do not invent a new mechanism
  — reuse the autopilot cron's auth). For every non-archived ad: fetch insights → upsert
  today's snapshot → also refresh status (A3).
- **On-demand** "Refresh now" button → `GET /api/ads/dashboard?refresh=1` does a live fetch
  and upserts today's snapshot before returning.
- All best-effort: Meta errors never 500; the dashboard shows stored data + a soft notice.

## 5. Workstream C — Dashboard UI + suggestions

### C1. Page
- `/ads/queue` page evolves into the card dashboard (one card per ad, newest first, cap 50).
- Per-card preview reuses the existing `AdPreview` component (image/video + headline +
  primary text + CTA).

### C2. API — `GET /api/ads/dashboard`
- Joins `meta_ads` + the latest two `meta_ad_insights` snapshots per ad → returns metrics,
  trend (delta vs prior snapshot), the rule verdict, reasons, and tips. Best-effort, never 500.

### C3. Rule engine — `lib/ads/signals.ts`
Pure function `(insights, objective, benchmarks) → { verdict, reasons[], tips[] }`,
fully unit-tested. Starting benchmark constants (tunable):
- **Gathering data:** impressions < 500 → neutral "still learning" state.
- **Not working:** CTR below objective floor (TRAFFIC 0.9%, ENGAGEMENT 1.0%, LEADS 0.8%,
  APP 0.7%) after ≥1000 impressions; OR spend ≥ 10 (account currency) with 0 results.
- **Watch:** frequency > 2.5 (fatigue).
- **Working:** CTR ≥ 1.5× objective floor, or results present at a healthy cost-per-result.
Drives the green/red banner and the always-on tip.

### C4. AI advice — `POST /api/ads/advice`
- On-demand (the ✨ button) only. Inputs: this ad's draft + metrics + the rule facts +
  brand brain + competitor intel. Reuses the existing ad-copy/Cerebras plumbing to produce
  concrete brand-voice next-step advice. Failure is non-blocking.

## 6. Known caveat — LEADS results
Our LEADS objective optimizes for `LINK_CLICKS` to a destination URL (no Meta Lead Form,
no Pixel). Meta therefore can't report true "leads"; we surface link clicks as the result
and label it honestly. Real lead/conversion tracking would require Pixel/CAPI — out of scope.

## 7. Error handling
- Insights + status are best-effort; brand-new ads show "Gathering data", Meta errors show
  "stats unavailable" without breaking the card.
- Token expiry → existing reconnect prompt.
- Rule engine tolerates zero/null metrics.
- AI advice errors show a friendly message and never block the card.

## 8. Testing (TDD)
- **Unit:** `signals` (working/watch/not incl. zero-spend, no-impressions, high-frequency
  edges), objective→result mapping, trend delta math, `geo-overlap` (haversine + km/mi
  clamp, exact-dup).
- **Route:** `dashboard` (join + best-effort fallback), insights upsert (one snapshot/day,
  idempotent), `advice` (LLM mocked), publish read-back + city-guard rejection,
  cron sync (status transitions incl. deleted→archived).
- Mirrors existing `src/app/api/ads/__tests__` patterns. Target ≥80% on new modules.

## 9. File inventory

**New**
- `src/lib/meta/ad-insights.ts` — insights fetch + result mapping
- `src/lib/ads/signals.ts` — rule engine + benchmark constants
- `src/lib/ads/geo-overlap.ts` — haversine overlap detection
- `src/app/api/ads/dashboard/route.ts` — GET dashboard (+ `?refresh=1`)
- `src/app/api/ads/advice/route.ts` — POST AI advice
- `src/app/api/cron/sync-ad-insights/route.ts` — daily cron
- `src/app/(dashboard)/ads/_components/AdDashboardCard.tsx` (+ small stat/signal subcomponents)
- DB migration for `meta_ad_insights`
- Tests for each of the above

**Modified**
- `src/lib/db/schema.ts` — add `meta_ad_insights`
- `src/lib/meta/ads.ts` — add `getAd` (read-back)
- `src/app/api/ads/publish/route.ts` — read-back + server-side city-overlap rejection
- `src/app/(dashboard)/ads/_components/StepAudience.tsx` — city-overlap guard, persist coords
- `src/app/(dashboard)/ads/queue/page.tsx` — becomes the card dashboard
- The autopilot GH-Actions cron workflow — add the insights-sync schedule/step

## 10. Phasing
- **Phase 0 — Linkage hardening:** A1 city guard + A2 publish read-back. Small, high value.
- **Phase 1 — Insights layer:** `ad-insights.ts`, `meta_ad_insights` table + migration,
  cron + refresh route, A3 status sync.
- **Phase 2 — Dashboard:** cards, preview, metrics, trends, rule signals (`signals.ts`).
- **Phase 3 — AI advice:** the ✨ button + `advice` route.
