# Ad Builder — Session Handoff / Crossover

**Last updated:** 2026-05-30. Read this first when resuming. Everything below is **committed and deployed to production** (`main` → Vercel → https://www.goviraleza.com, project `social-studio`).

---

## TL;DR — what this is
A full **Meta ad builder** at `/ads`: a 4-step wizard (Goal → Creative → Audience → Review) that auto-drafts ad copy + media, then creates the ad in the user's Meta account as **PAUSED** (queued for their review in Ads Manager). Plus a **Queued ads** review page at `/ads/queue`.

The user (Nick) is the owner of GoViraleza / PaceBrain / Affectly. Brand "PaceBrain" (running app) is the main test case. He has Meta connected (ad account "Nicolas Patterson [AUD]", Page "PaceBrain") and is actively testing in production.

---

## What's LIVE (all shipped this session)
- **v1 ad builder**: PAUSED ad creation (campaign→adset→creative→ad), 3 objectives (Traffic/Engagement/Leads), basic+AI targeting, `metaAds` history table.
- **v2**: photo picker + upload, **App Promotion** objective (iOS App Store), **video ads** (upload-your-own), per-field **✨ Suggest** (3 viral variants), **Regenerate all copy**, **Queued ads review page** (`/ads/queue`) with live Meta status.
- **Premium viral copy generator** (`src/lib/ads/ad-copy.ts`): competitor intel + Cialdini persuasion + PAS/AIDA/BAB frameworks. Used by both initial generate and Regenerate.
- **UX fixes**: budget in **dollars** (not cents), country **dropdown**, no framework labels in copy, preview CTA/image polish.

~370 tests, all green. Every change was code-reviewed via subagents.

---

## CRITICAL gotchas (do not re-break these)
1. **Cerebras model**: key env var is `CEREBUS` (sic). Model = `CEREBRAS_MODEL` env, default `gpt-oss-120b` (`src/lib/cerebras.ts`). `llama3.1-8b` was retired. **gpt-oss is a REASONING model** — `cerebras.ts` sets `reasoning_effort: 'low'` for gpt-oss, WITHOUT which it spends all `max_tokens` on reasoning and returns **EMPTY content at HTTP 200** (this silently broke all generation). If generation returns blank, check this first. Account only has `gpt-oss-120b` + `zai-glm-4.7`.
2. **Two separate Meta connections**: `instagramAccounts` (Analyze section) vs `metaAccounts` (ad builder). `/ads` needs `metaAccounts` (the `ads_management` OAuth via `/api/meta/oauth/start`). The intended connect UI `components/meta-hub.tsx` is **orphaned/unmounted**; the `/ads` empty state links to `/api/meta/oauth/start` directly.
3. **Image storage = GitHub, not Vercel Blob.** `BLOB_READ_WRITE_TOKEN` is NOT configured. Ad image uploads use `src/lib/github-images.ts` (`uploadImageToGitHub` → commits to repo `images/` → returns raw.githubusercontent.com URL). **Side effect: the app pushes commits to `main` on every image upload** — so `git push` from a dev session can be rejected with "fetch first"; run `git pull --rebase origin main` then push.
4. **Video upload STILL uses Vercel Blob** (`/api/ads/upload-video`) — GitHub can't hold 100MB videos. So **video uploads fail until the user creates a Blob store in Vercel → Storage** (adds `BLOB_READ_WRITE_TOKEN`, then redeploy). Images work without it.
5. **Everything Meta-created is PAUSED** — safety invariant, never change. `src/lib/meta/ads.ts` hardcodes `status: 'PAUSED'` on campaign/adset/ad.
6. **SSRF guard**: `src/lib/meta/safe-image-fetch.ts` validates user image URLs (https-only, blocks private/metadata IPs) before `uploadAdImage` fetches them.
7. **Budget is stored in MINOR units** (`AdTargeting.dailyBudgetMinor`); the StepAudience UI now takes dollars and ×100s. Per-currency floors in `MIN_DAILY_BUDGET_MINOR` (`ads-types.ts`); AUD min = 700 (A$7).
8. **App Promotion delivery** needs the iOS app registered in Meta (Business Settings → Apps) + associated with the App Store listing + SKAdNetwork. The builder creates it PAUSED regardless; the picker (`/api/meta/apps` → advertisable_applications) shows empty until that's set up.

---

## Key files
- Page/UI: `src/app/(dashboard)/ads/page.tsx` + `_components/{StepGoal,StepCreative,StepAudience,StepReview,AdPreview}.tsx`; queue: `src/app/(dashboard)/ads/queue/page.tsx`.
- API: `src/app/api/ads/{generate,publish,suggest,copy,list,upload-image,upload-video}/route.ts`; `src/app/api/meta/{oauth,account,apps}/...`.
- Lib: `src/lib/meta/{ads.ts (write client), ads-types.ts, client.ts (read), safe-image-fetch.ts, config.ts}`; `src/lib/ads/{build-draft.ts, ad-copy.ts}`; `src/lib/cerebras.ts`; `src/lib/github-images.ts`; `src/lib/brain/{consume.ts, competitor-intel.ts}`.
- DB: `src/lib/db/schema.ts` — `metaAds`, `metaAccounts`, `instagramAccounts`, `brands`. `meta_ads` table is **already applied** to Neon (via `drizzle-kit push`). Project uses `push`, NOT migration files.
- Specs/plans: `docs/superpowers/specs/2026-05-29-meta-ads-page-design.md`, `docs/superpowers/plans/{2026-05-29-meta-ad-builder.md, 2026-05-30-ad-builder-v2.md}`.

---

## Known issues / pending follow-ups
- **Video uploads** fail until Vercel Blob store is created (see gotcha #4).
- **Pixabay auto-pick** returns no candidates ("couldn't auto-pick an image") — Pixabay key not linked for the account; user supplies own media for now.
- Open GitHub issues #3 (Instagram account picker in wizard), #4 (queued-ads history — partly done now), #5 (richer interest suggestions). Plus: orphaned `meta-hub` connect UI, per-ad pause/activate toggle on the queue page, refresh button on queue page, App Promotion live verification.
- `gh repo` = `NickAIDeveloper/SocialStudio`. Vercel project `prj_aFsmdNkeXAsl6EC1r7HLfXpNOs1V`, team `team_cPvldrifqQeLzS7jpMllEfiC`.

---

## How to resume / test
1. Production: https://www.goviraleza.com/ads (sign in, Meta already connected). Local dev: `npx next dev --port 3005` BUT NEXTAUTH_URL/Meta redirect are pinned to localhost:3000 in `.env.local`, and **port 3000 is the user's other project (TradesTool)** — so run locally on 3005 with `NEXTAUTH_URL=http://localhost:3005 META_OAUTH_REDIRECT_URI=http://localhost:3005/api/meta/oauth/callback` overrides (and whitelist that callback in the FB app) if doing OAuth locally. Easiest: test in production.
2. Flow to test: pick brand (PaceBrain) + objective + URL → Generate (real copy now, post-Cerebras-fix) → Creative step (pick/upload image, ✨ Suggest, Regenerate) → Audience (dollar budget, country dropdown) → Review → **Create Paused Ad** → check `/ads/queue` + Ads Manager.
3. Debug prod via Vercel runtime logs (MCP `get_runtime_logs`, projectId/teamId above) — already used this session to find the Cerebras + Blob errors.

## Git/deploy workflow
- Work lands on `main` → auto-deploys to prod (~90s). Branch `feat/*` or `fix/*`, build with subagent-driven TDD + review, merge `--ff-only` to main, push. **Always `git pull --rebase origin main` before pushing** (the app auto-commits images to main). Commit attribution is disabled per user settings.
- Untracked scratch files in `scripts/` and `src/app/api/dev/diagnose-autopilot-images/` are pre-existing, ignore them.

## Memory notes saved (auto-loaded next session)
`reference_cerebras_model`, `reference_two_meta_connections` (in the project memory dir) — plus existing autopilot/brand notes.
