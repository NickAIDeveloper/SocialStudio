# Autopilot Status & Handoff

**Date:** 2026-05-12
**Branch:** `main` (latest: `21764d4` — image fallback safety net + relevance fallback)
**Production:** https://www.goviraleza.com — deployed and live

---

## What's working

- Daily brain pipeline runs at 03:00 UTC (subsystem #1)
- Autopilot orchestration calls `/api/smart-posts/god-mode` via HMAC
- Buffer push schema fixed (`assets: [{ image: { url } }]`)
- Per-brand Buffer channel selection works
- "Recent generated posts" queue UI on `/settings` works
- Brain UI panels visible (env gates removed)
- Daily cron triggers autopilot for enabled brands

---

## What's broken / below quality bar

User feedback: **autopilot-generated posts are noticeably worse than UI-generated Smart Posts** even though both hit god-mode. Specific issues:

1. **Caption squashing** — captions go out as dense paragraphs with no line breaks between hook/body/CTA. Looks bad on Instagram/Facebook.
2. **Image reuse** — same Pixabay image reused 7×/8 posts for Affectly. Current 90-day filter is too narrow AND positioned wrong in the pipeline.
3. **Image irrelevance** — house-in-field photos for "study habits" caption. `deriveImageQuery` fallback chain not strong enough.
4. **Quality gap autopilot vs UI** — same endpoint, different output quality. **Suspected root cause: autopilot passes `metaOverrides` in the god-mode body; UI does not.** See `src/components/smart-posts-dashboard.tsx:319` for the UI call shape.

---

## Immediate action needed

**Flip both autopilot brands from `Full auto` to `Queue` mode** so nothing publishes to Buffer until quality is fixed.

Via UI: `/settings` → on each Autopilot card → Mode dropdown → "Queue drafts (review before publish)".

Or via API (PATCH per brand):
```
PATCH /api/autopilot/settings?brandId=<id>
Body: { "mode": "queue" }
```

Brand IDs:
- Affectly: `cc593f18-85fc-48af-a2be-1885c6ab8a07`
- PaceBrain: `8de5c381-7d6e-4700-814b-a04193c883b4`

---

## Four fixes pending (DO IN NEXT SESSION)

All four belong in the **shared pipeline** (god-mode / generateFromSeed / captions), NOT in autopilot. Autopilot stays as the thin orchestrator it currently is (~250 lines in `src/app/api/autopilot/run/route.ts`).

### Fix 1 — Investigate `metaOverrides` quality gap (HIGHEST PRIORITY)

**File:** `src/app/api/autopilot/run/route.ts` lines ~70-83

Autopilot currently sends:
```ts
const godBody = JSON.stringify({
  userId: brand.userId,
  brandId,
  igUserId: igAccount.igUserId,
  metaOverrides: brain?.formula ? { format, day, hour } : null,
});
```

UI (`src/components/smart-posts-dashboard.tsx:319`) doesn't pass `metaOverrides` for god-mode at all.

**Action:** Try removing `metaOverrides` from autopilot's god-mode call. Run a forced workflow trigger. Compare output to UI quality. If autopilot output now matches UI, the disconnect is confirmed and the fix is to stop forwarding the brain formula via metaOverrides (god-mode will pick its own slot from deep profile).

### Fix 2 — Caption formatting (line breaks)

**File:** `src/app/api/captions/route.ts`

The system prompt + LLM template produce dense paragraphs. Need:
- Hook on its own line
- Blank line
- Body paragraphs separated by blank lines (\n\n)
- Blank line
- CTA on its own line at the end

**Action:** Add explicit format rules in the system prompt AND a post-process step that injects blank lines if the LLM omits them. The reconciler is in `src/lib/caption-engine.ts`.

### Fix 3 — Permanent image no-reuse (not 90-day)

**File:** `src/lib/smart-posts/generate.ts` (the no-repeat block added in commit `8a4441b`)

Current code:
```ts
const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
const recentImageRows = await db
  .select({...})
  .from(posts)
  .where(and(eq(posts.brandId, brandId), gte(posts.createdAt, ninetyDaysAgo)));
```

**Action:** Drop the `gte(posts.createdAt, ninetyDaysAgo)` — query ALL posts for this brand, ever. Once a `sourceImageUrl` or `processedImageUrl` is used, it's permanently in the used set. User explicitly asked for this.

### Fix 4 — Image relevance hard floor

**File:** `src/lib/smart-posts/image-query.ts` + `src/lib/smart-posts/generate.ts` image selection

Current: `deriveImageQuery` produces a search string, `hasContextOverlap` rejects bad ones. But the SELECTED candidate's Pixabay tags aren't checked against caption content.

**Action:** After filtering candidates for no-reuse, score each remaining candidate by tag-overlap with the caption + hook text. Pick the highest-scoring. If no candidate has any tag overlap, do one more Pixabay search with the hook-only query (already implemented as `deriveImageQueryFromHook`). Reject pure-landscape candidates (tags: "nature", "landscape", "scenery") when the caption is about people/activities.

---

## Resume prompt for next session

Paste this in a fresh session:

> Resume autopilot quality work. Read `AUTOPILOT-STATUS.md` for full context. Priorities in order:
> 1. Flip both brands to `queue` mode (Affectly `cc593f18-85fc-48af-a2be-1885c6ab8a07`, PaceBrain `8de5c381-7d6e-4700-814b-a04193c883b4`) via the autopilotSettings table or settings PATCH
> 2. Investigate Fix 1 — strip `metaOverrides` from autopilot's god-mode call, test if output matches UI quality
> 3. Apply Fix 2 (caption line breaks), Fix 3 (permanent no-reuse), Fix 4 (relevance hard floor) — all in shared pipeline, NOT autopilot
> 4. Force-trigger workflow, compare output, iterate
> 5. Only flip brands back to `auto` mode after user confirms quality is good

---

## Key files (cheat sheet)

| Concern | File | Notes |
|---|---|---|
| Autopilot orchestrator | `src/app/api/autopilot/run/route.ts` | Don't add logic here — it should stay thin |
| God-mode endpoint | `src/app/api/smart-posts/god-mode/route.ts` | Has HMAC + session paths |
| Generation pipeline | `src/lib/smart-posts/generate.ts` | Image selection lives here |
| Caption generation | `src/app/api/captions/route.ts` | Caption LLM prompt here |
| Caption post-process | `src/lib/caption-engine.ts` | reconcileCountClaim, sanitizers |
| Image query derivation | `src/lib/smart-posts/image-query.ts` | LLM + fallback chain |
| Pixabay search | `src/lib/pixabay.ts` + `src/lib/image-sources/pixabay.ts` | 50 results per query |
| Buffer push | `src/lib/buffer.ts` | New schema: `assets: [{ image: { url } }]` |
| Autopilot UI | `src/components/autopilot/autopilot-card.tsx` | Queue view + channel picker |
| Settings page | `src/app/(dashboard)/settings/page.tsx` | AutopilotSection mount |
| Schema | `src/lib/db/schema.ts` | autopilotSettings has bufferChannelId per brand |

---

## Recent commits (newest first)

```
21764d4 fix(autopilot): filter no-repeat before slice + image fallback safety net + relevance fallback
8a4441b fix(autopilot): 90-day per-brand no-repeat image filter in generateFromSeed
59a94e9 fix(buffer): use new AssetInput array shape: assets: [{ image: { url } }]
b741397 fix(buffer): assets.images -> assets.photos (Buffer schema change) [superseded]
9c25bdb fix(autopilot): per-brand Buffer channel selection (was per-user)
db08719 fix(autopilot): brand isolation, hook/count reconciliation, image fallback strength
2a6599a fix(autopilot): HMAC chain through god-mode -> insights/captions/images
ddf5e8a fix(autopilot): upload composited image to Buffer + ensure brandId propagation
efddb48 fix(autopilot): use god-mode pipeline instead of parallel generation
e2ce583 feat(autopilot): workflow input force_autopilot for manual testing
3739098 feat(autopilot): expandable Recent generated posts section per brand
```

---

## Verification commands

**Force-trigger a workflow run:**
```bash
gh workflow run brain-daily.yml --ref main -f force_autopilot=true
sleep 6
RUN=$(gh run list --workflow=brain-daily.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN"
gh run view "$RUN" --log | grep -E "brand=|autopilot"
```

**Check production deploy state:**
```bash
vercel ls | grep Production
```

**Check Vercel function logs for errors:**
```bash
vercel logs --no-follow --status-code=500 --limit=10 -x | grep -E "god-mode|autopilot|buffer"
```

---

## Environment variables (already set)

- `BRAIN_CRON_SECRET` — HMAC secret (Vercel + GitHub Secrets, matching values)
- `META_APP_ID`, `META_APP_SECRET` — Meta OAuth
- `META_IG_APP_ID`, `META_IG_APP_SECRET` — IG Login for Business
- `PIXABAY_API_KEY` — stock photo search
- `CEREBUS` — Cerebras LLM (note: env var is misspelled "CEREBUS" in `src/lib/cerebras.ts`, expected)
- `ENCRYPTION_KEY` — token encryption

UI gates were removed (commit `3e3949b`) — `NEXT_PUBLIC_BRAIN_UI_ENABLED` is no longer required for visibility.
