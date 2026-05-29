# Meta Ad Builder — `/ads` Page Design

**Date:** 2026-05-29
**Status:** Approved (design); pending implementation plan
**Branch context:** authored on `fix/autopilot-image-caption-quality` (rebase onto `main` before implementing — see memory `project_branch_workflow_reality`)

## Summary

A new dashboard page that lets the user create Meta (Facebook/Instagram) **paid ads** through a guided GUI, reusing the app's existing AI content engine to auto-draft the creative. The user picks a brand and a goal; the app generates the ad copy, headline, hashtags, and an on-brand image; the user edits and confirms; the app creates the ad on Meta in **PAUSED** state via the Marketing API. Nothing spends until the user activates it in Meta Ads Manager.

## Goals

- Turn the already-requested-but-unused `ads_management` **write** capability into a real feature.
- Reuse the existing AI stack (brand brain brief, caption engine, image scorer/dedup) so ad creative matches the rest of the product.
- Produce a complete, valid Meta ad (campaign → ad set → creative → ad) from a short wizard.
- Be safe by construction: zero accidental spend.

## Non-Goals (v1)

- Going live automatically (always PAUSED).
- Meta Instant Lead Forms (Leads objective routes to a destination URL — "website leads").
- Sales / App Promotion objectives (need pixel / catalog / app setup).
- Advanced targeting (custom audiences, lookalikes, manual placements).
- Scheduled / autopilot auto-creation of ads (possible later layer on this plumbing).
- Opening the feature to other users (needs Meta App Review for `ads_management` write beyond the app's own admins/devs/testers; works for the owner now in Dev Mode).

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Publish model | **Create as PAUSED** — full ad pushed to Meta, never spends until activated manually. |
| Creative source | **AI-first, then edit** — auto-generated from brand brief + caption engine + image scorer; every field editable. |
| Objectives | **Curated 3**: Traffic, Engagement, Leads. |
| Targeting depth | **Basic + AI-suggested**: geo, age, gender, AI-suggested interests; editable. |

## Architecture

The page reuses existing token storage and the AI stack. The only new capability is the **write half** of the Meta Marketing API. The existing `src/lib/meta/client.ts` is read-only (insights, listing accounts/pages) and is left untouched.

### New files

| File | Purpose |
|------|---------|
| `src/lib/meta/ads.ts` | Write-side Graph client: `uploadAdImage` → `createCampaign` → `createAdSet` → `createAdCreative` → `createAd`. Stateless; takes a plaintext access token (mirrors `client.ts`). |
| `src/lib/meta/ads-types.ts` | Objective enum, optimization-goal + billing-event maps per objective, CTA types, `AdDraft` and `AdTargeting` shapes. |
| `src/lib/ads/build-draft.ts` | Pure function: `(brandBrief, briefSections, objective, hookSignal) → AdDraft`. Reuses caption engine. No I/O; unit-testable. |
| `src/app/api/ads/generate/route.ts` | `POST` — builds draft + picks image. No Meta write. |
| `src/app/api/ads/publish/route.ts` | `POST` — finalized draft → PAUSED campaign/adset/creative/ad sequence → records row → returns Meta IDs + Ads Manager deep link. |
| `src/app/(dashboard)/ads/page.tsx` | Wizard shell + step state. |
| `src/app/(dashboard)/ads/_components/StepGoal.tsx` | Step 1. |
| `src/app/(dashboard)/ads/_components/StepCreative.tsx` | Step 2. |
| `src/app/(dashboard)/ads/_components/StepAudience.tsx` | Step 3. |
| `src/app/(dashboard)/ads/_components/StepReview.tsx` | Step 4. |
| `src/app/(dashboard)/ads/_components/AdPreview.tsx` | Live Facebook/Instagram preview. |
| `src/lib/meta/__tests__/ads.test.ts` | Write-client tests (mocked fetch). |
| `src/lib/ads/__tests__/build-draft.test.ts` | Draft-builder unit tests. |
| `src/app/api/ads/publish/__tests__/route.test.ts` | Publish route tests (auth, ownership, validation, ordering). |

### Reused as-is

- `metaAccounts` table — `accessToken` (encrypted), `tokenExpiresAt`, `scopes`, `assets` (`{ adAccounts, pages, igAccounts }`), `selectedAdAccountId`.
- `decrypt()` from `src/lib/encryption.ts`.
- `getAdAccounts` / `getPages` from `src/lib/meta/client.ts`.
- `readBrandBrain(brandId)` + `parseBriefSections` (brief `briefMd`, hook signals).
- Image scorer / picker (`/api/images/pick`), brand-keyed, dedup-aware.
- Brand selector pattern from autopilot/batch pages.

### Schema addition

New `metaAds` table to record what was created (so the page shows history and never loses track of pushed ads):

- `id` (uuid, pk)
- `userId`, `brandId` (fk)
- `adAccountId`, `pageId`, `igAccountId` (nullable)
- `campaignId`, `adsetId`, `creativeId`, `adId` (nullable — partial trees on failure)
- `objective`, `status` (default `PAUSED`)
- `draft` (jsonb — the finalized `AdDraft` + targeting)
- `lastError` (text, nullable — which step failed, if any)
- `createdAt`, `updatedAt`

## Data Flow

### Generate — `POST /api/ads/generate`

```
client: { brandId, objective, destinationUrl }
  → getUserId() + verify brand belongs to user
  → readBrandBrain(brandId) → briefMd + parseBriefSections
  → build-draft.ts produces AdDraft:
        primaryText         ← caption engine, fed brainBriefMd (same path as batch/god-mode)
        hook                ← brief hook pattern / yourHookPattern signal
        headline            ← brand-derived, ≤40 chars (Meta headline cap)
        hashtags            ← brief tags, capped
        cta                 ← default per objective (Traffic→LEARN_MORE, Engagement→LIKE_PAGE, Leads→SIGN_UP)
        interestSuggestions ← keywords from brief sections
  → image pick (existing scorer, brand-keyed, dedup-aware)
  → returns AdDraft (fully editable, nothing sent to Meta)
```

No Meta write surface. Safe to call repeatedly (regenerate).

### Publish — `POST /api/ads/publish`

Runs only after the user confirms the Review step.

```
client: finalized AdDraft + {
          adAccountId, pageId, igAccountId?,
          geo, age, gender, interests,
          dailyBudget, startDate, endDate
        }
  → getUserId() + verify brand + verify adAccountId ∈ metaAccounts.assets.adAccounts
        (reject arbitrary account IDs — trust boundary)
  → decrypt(metaAccounts.accessToken); if tokenExpiresAt passed → 401 "reconnect Meta"
  → validate: dailyBudget ≥ Meta currency minimum; startDate < endDate; URL well-formed
  → ads.ts sequence, all status=PAUSED:
        1. uploadAdImage(image)   → image_hash
        2. createCampaign(objective)
        3. createAdSet(budget, schedule, targeting, optimization_goal, billing_event)
        4. createAdCreative(object_story_spec: pageId + link_data{image_hash, message, headline, cta, link})
        5. createAd(adset + creative)
  → insert metaAds row (with whatever IDs succeeded; lastError on partial failure)
  → return { campaignId, adId, adsManagerUrl }
```

### Safety properties

- Every Meta object created `PAUSED`. No path creates an active ad.
- `/generate` has zero Meta write surface.
- Publish sequence is ordered so any step failure leaves an incomplete-but-paused tree (logged with IDs), never a live or orphaned-untracked ad.
- `adAccountId` is validated against the user's stored assets — the client cannot target an arbitrary account.

## Meta Write Layer (`ads.ts`) — Detail

Meta requires building a 5-object stack in order; there is no single "create ad" call.

1. **Upload image** — `POST act_{id}/adimages` with the image bytes/URL → returns `image_hash`. Meta will not reference an arbitrary external URL in a creative.
2. **Create campaign** — `POST act_{id}/campaigns` with `objective` (ODAX: `OUTCOME_TRAFFIC` / `OUTCOME_ENGAGEMENT` / `OUTCOME_LEADS`), `status=PAUSED`, `special_ad_categories=[]`.
3. **Create ad set** — `POST act_{id}/adsets` with `campaign_id`, `daily_budget` (minor units), `start_time`/`end_time`, `targeting` (geo/age/gender/interests), `optimization_goal` + `billing_event` (per objective map), `status=PAUSED`.
4. **Create creative** — `POST act_{id}/adcreatives` with `object_story_spec` = `{ page_id, instagram_actor_id?, link_data: { image_hash, message, name (headline), call_to_action, link } }`.
5. **Create ad** — `POST act_{id}/ads` with `adset_id`, `creative={creative_id}`, `status=PAUSED`.

### Per-objective maps (v1)

| Objective | optimization_goal | billing_event | default CTA |
|-----------|-------------------|---------------|-------------|
| Traffic (`OUTCOME_TRAFFIC`) | `LINK_CLICKS` | `IMPRESSIONS` | `LEARN_MORE` |
| Engagement (`OUTCOME_ENGAGEMENT`) | `POST_ENGAGEMENT` | `IMPRESSIONS` | `LIKE_PAGE` |
| Leads (`OUTCOME_LEADS`) | `LINK_CLICKS` (website leads) | `IMPRESSIONS` | `SIGN_UP` |

### Gotchas handled

- **Headline cap** — draft generated ≤40 chars; counter in UI.
- **Budget minimum** — validate against per-currency floor before sending; clear message, not a raw API error.
- **Partial failure** — log IDs obtained so far; error names the failing step; tree stays paused/harmless.
- **Token expiry** — ~60-day long-lived token; if expired, stop and prompt reconnect.
- **API version** — use the same `META_API_VERSION` env (`v21.0`) as `client.ts`.

## UI — Page & Screens

New **Ads** sidebar item → 4-step wizard. Top progress bar, Back/Next at bottom, **live ad preview** on the right updating as the user edits.

**Step 1 — Goal**
- Brand selector (autopilot/batch pattern).
- Goal: Traffic / Engagement / Leads (plain labels + one-line description).
- Destination URL.
- Next triggers auto-draft (`/api/ads/generate`).

**Step 2 — Creative** (AI pre-filled, all editable)
- Image with "pick another" / regenerate (existing scorer).
- Primary text, hook, headline, hashtags — editable, character counters where Meta limits apply.
- "Regenerate copy" button.

**Step 3 — Audience & Budget**
- Location, age range, gender; AI-suggested interests as editable chips.
- Daily budget (currency + minimum shown inline).
- Start/end dates.
- Facebook Page selector (+ optional Instagram account) the ad runs as.

**Step 4 — Review & Confirm**
- Full summary: preview + every setting.
- Banner: "This will create a PAUSED ad — it won't spend until you turn it on in Ads Manager."
- **Create Paused Ad** → success view with deep link to Meta Ads Manager.

**Empty / blocked states**
- Meta not connected → explain + link to connect.
- Brand has no brain brief yet → explain how to generate one.
- No ad accounts / no Pages on the Meta account → explain requirement.

## Error Handling

- All API routes: auth check → ownership check → input validation (Zod) → typed errors with user-facing messages; detailed server-side logs.
- Meta API errors surfaced with the failing step named; never swallowed.
- Budget/date/URL validated client-side (fast feedback) and server-side (trust boundary).
- Token expiry → explicit reconnect prompt.

## Testing

- **Unit:** `build-draft.ts` (objective → CTA, headline cap, hashtag cap, interest extraction).
- **Unit (mocked fetch):** `ads.ts` each step builds the correct payload; partial-failure logging.
- **Integration:** `/api/ads/publish` — rejects unauthenticated, rejects foreign brand, rejects ad account not in assets, rejects sub-minimum budget, asserts PAUSED on every object, asserts call ordering.
- **Integration:** `/api/ads/generate` — returns editable draft, no Meta write call made.
- Coverage target 80%+ (project standard).

## Constraints & Notes

- **AGENTS.md:** this is a modified Next.js — read the relevant guide in `node_modules/next/dist/docs/` before writing route/page code.
- **Dev Mode:** `ads_management` write works for the owner's own ad accounts now. Multi-user requires Meta App Review (Advanced Access) — out of scope for v1, note for later.
- **Currency:** budget minimums and minor-unit conversion depend on the ad account currency from `metaAccounts.assets`.
