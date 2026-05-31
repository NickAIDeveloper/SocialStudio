# Handoff — Ad publish rollback (kill orphan campaigns) + cleanup

**Date:** 2026-05-31. Read this first. One focused task, then done.

---

## Why
Viraleza's `/api/ads/publish` creates Meta objects in sequence: **campaign → ad set → creative → ad**. If a later step fails (bad targeting, Meta validation, etc.), the **campaign it already created is left behind as an orphan shell**. During the last session, many failed attempts (bid strategy, advantage_audience, location overlap, etc.) each left an "Ad Builder — OUTCOME_TRAFFIC" campaign. They're harmless ($0, never deliver) but they clutter Ads Manager and there's no easy way to tell orphans from real ads (identical names).

**Fix: roll back on failure.** If any step after campaign creation throws, delete the campaign that was just created (deleting a campaign cascades to its ad sets/ads). Then orphans are impossible.

This is a **small, surgical change**: add one `deleteCampaign` call to the existing error path. Do NOT redesign the publish flow.

---

## Files
- `src/lib/meta/ads.ts` — write client (`createCampaign`, `createAdSet`, …, `graphPost`, `actId`, `GRAPH_BASE`, `META_API_VERSION`). **No delete function exists yet — add one.**
- `src/app/api/ads/publish/route.ts` — the publish handler. It already tracks `createdCampaign`, `createdAdset`, `createdCreative` and has a `catch (error)` block (~lines 249–267) that does best-effort forensic logging (`lastError`) but **no rollback**.
- Tests: `src/lib/meta/__tests__/ads.test.ts`, `src/app/api/ads/publish/__tests__/route.test.ts`.

---

## Step 1 — Add `deleteCampaign` to `src/lib/meta/ads.ts`

Add a DELETE helper + export, mirroring the existing `graphPost` style:

```ts
async function graphDelete(path: string, accessToken: string): Promise<void> {
  const res = await fetch(
    `${GRAPH_BASE}${path}?access_token=${encodeURIComponent(accessToken)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta delete error ${res.status} on ${path}: ${text}`);
  }
}

// Roll back an orphaned campaign after a failed publish. Deleting the campaign
// cascades to its ad sets and ads. campaignId is the bare id (NOT act_-prefixed).
export async function deleteCampaign(accessToken: string, campaignId: string): Promise<void> {
  await graphDelete(`/${campaignId}`, accessToken);
}
```

## Step 2 — Call it in the publish `catch` (`src/app/api/ads/publish/route.ts`)

1. Import it: add `deleteCampaign` to the existing `from '@/lib/meta/ads'` import.
2. **Scope check:** make sure `accessToken` and `createdCampaign` are visible inside `catch`. `createdCampaign` already is. If `accessToken` is declared with `const` *inside* the `try`, lift its declaration to before the `try` (e.g. `let accessToken = ''`), so the catch can use it. (Verify exact current scope before editing.)
3. In the `catch (error)` block, after the existing forensic logging and **before** the `return NextResponse.json({ error: 'publish_failed', ... })`, add:

```ts
// ROLLBACK: a failed publish must not leave an orphan campaign shell behind.
// Deleting the campaign cascades to any ad set/creative/ad we created.
if (createdCampaign && accessToken) {
  try {
    await deleteCampaign(accessToken, createdCampaign);
  } catch (rollbackErr) {
    console.error('[ads/publish] rollback (deleteCampaign) failed:', rollbackErr);
  }
}
```

Keep the `Unauthorized` early-return above this untouched (no campaign is created in that path). Do NOT change the PAUSED invariant or any create logic.

## Step 3 — Tests
- In `ads.test.ts`: add a test that `deleteCampaign('TOKEN','camp_1')` issues a `DELETE` to `/camp_1` (mock fetch; assert method `DELETE` and the path).
- In `publish/__tests__/route.test.ts`: add a test where `createAdSet` (mocked) **throws**, and assert (a) the route returns 500 `publish_failed`, and (b) `deleteCampaign` was called with the created campaign id. (The suite already mocks the meta/ads module — extend that mock.)

## Verify
- `npx vitest run src/lib/meta src/app/api/ads 2>&1 | tail -20` — all green.
- `npx tsc --noEmit 2>&1 | grep -E "ads.ts|publish/route"` — no new errors (ignore pre-existing `deep-profile.test.ts` / `tests/e2e/brain.spec.ts`).
- Branch `fix/ads-publish-rollback`, `fix(ads):` commit, merge `--ff-only` to `main` (auto-deploys to prod). `git pull --rebase origin main` before pushing (app auto-commits images to main).

## Acceptance
A publish that fails at ad-set/creative/ad creation leaves **no** campaign behind (no new "Ad Builder" orphan in Ads Manager). A fully-successful publish is unchanged (still creates the PAUSED ad).

---

## Leftover manual cleanup (not code — do once in Ads Manager)
Two orphan "Ad Builder — OUTCOME_TRAFFIC — 2026-05-31" campaigns remain from last session, with deletions **staged** ("Review and publish (2)"). Meta throttles automated deletes, so finish them by hand: Ads Manager → **"Review and publish (2)" → Publish**. All other orphans + the "New App promotion Campaign" draft were already deleted. Old Malvern Harriers history is untouched (Meta blocks deleting spent campaigns — leave them).

---

## Context from last session (already shipped to prod, FYI)
- Higgsfield-purple redesign (whole app), logout fix (`NEXTAUTH_URL` → https + `trustHost`), and the ad-builder Meta fixes: `is_adset_budget_sharing_enabled`, `bid_strategy=LOWEST_COST_WITHOUT_CAP`, `targeting_automation.advantage_audience=0`, APP store-URL resolved from Meta, **city/region targeting**, custom interests, repeatable templates, full error surfacing.
- See `memory/reference_meta_ad_builder_requirements.md` for the Meta field requirements.
- **City-targeting gotcha discovered:** the StepAudience city picker can add **duplicate/overlapping cities**, which Meta rejects with subcode 1487756 ("Some of your locations overlap"). A nice secondary fix: dedupe/prevent overlapping city adds in `StepAudience.tsx`. Not required for the rollback task.
