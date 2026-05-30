# Meta Ad Builder v2 — Implementation Plan

> Extends the v1 ad builder (`/ads`) shipped 2026-05-29. Built phase-by-phase with TDD + subagent review, same as v1.

**Goal:** Add (1) richer creative control — choose from candidate photos, upload your own; (2) iOS App Promotion objective; (3) upload-your-own video ads.

**Decisions (from user):**
- Photo upload → **Vercel Blob** (`put`, public), matching `src/app/api/brands/logo/route.ts`.
- App Promotion → **iOS app live on the App Store** (App Store URL + `INSTALL_MOBILE_APP` CTA + `promoted_object` + SKAdNetwork).
- Video → **upload-your-own only** (Blob → Meta `advideos` → poll → `video_data` creative).

**Build order (smaller wins first):** Phase 1 (photos) → Phase 2 (App Promotion) → Phase 3 (video). Confirm between phases.

---

## Phase 1 — Photo picker + upload

**Outcome:** In StepCreative the user sees a gallery of candidate images (pick one), can upload their own, and still has the manual URL field. The `imageMissing` signal (v1 review finding C1) is surfaced.

### Task 1.1 — `/api/ads/generate` returns image candidates
- Modify `src/app/api/ads/generate/route.ts`: change `pickImageUrl` → `pickImages` returning `{ chosen: string | null; candidates: string[] }`. Fetch the Pixabay hits (it already calls `/api/pixabay?q=`); return the top ~8 `webformatURL`s as `candidates`, `chosen = candidates[0] ?? null`.
- Response becomes `{ draft, imageMissing, imageCandidates }` where `imageCandidates` is the list.
- Tests: extend `generate/__tests__/route.test.ts` — mock pixabay returning multiple hits, assert `imageCandidates.length > 1` and `draft.imageUrl === candidates[0]`.

### Task 1.2 — `/api/ads/upload-image` route (Vercel Blob)
- Create `src/app/api/ads/upload-image/route.ts`: `POST` multipart `image` file. Auth via `getUserId`. Validate `file instanceof File`, size ≤ 8MB, `file.type` in {png,jpeg,jpg,webp}. `sharp` resize to max 1500px (fit inside), keep format or convert to jpeg. `put(`ad-images/${uuid}.jpg`, buffer, { access:'public', contentType })`. Return `{ url }`. Mirror `brands/logo/route.ts` style.
- Tests: route test — rejects no-file (400), rejects oversize (400), rejects non-image (400). (Mock `@vercel/blob` `put` + `sharp`.)

### Task 1.3 — StepCreative gallery + upload UI
- `page.tsx`: hold `imageCandidates: string[]` in state; pass to StepCreative.
- `StepCreative.tsx`: render a thumbnail grid of `imageCandidates`; clicking sets `draft.imageUrl` (highlight selected). Add an **Upload** input → POST to `/api/ads/upload-image` → on success set `draft.imageUrl` to the returned blob url (and prepend to candidates). Keep the manual URL field. If `imageMissing` and no candidates, show the "couldn't auto-pick — upload or paste a URL" notice.

### Task 1.4 — verify
- Full suite green, tsc clean, manual smoke on `/ads`.

---

## Phase 2 — App Promotion objective (iOS)

**Outcome:** A 4th objective "App installs" that builds an iOS App Promotion ad pointing at an App Store URL.

### Task 2.1 — types + objective config
- `ads-types.ts`: add `'APP'` to `AdObjective`; `OBJECTIVE_CONFIG.APP = { metaObjective: 'OUTCOME_APP_PROMOTION', optimizationGoal: 'APP_INSTALLS', billingEvent: 'IMPRESSIONS', defaultCta: 'INSTALL_MOBILE_APP', captionContentType: 'promo', label: 'App installs', description: 'Promote your iOS app on the App Store.' }`. Widen the CTA + optimizationGoal unions accordingly.
- Add to `AdDraft`/publish input: `appStoreUrl?: string` and `applicationId?: string` (the Meta-registered app id, required for delivery).

### Task 2.2 — Meta apps lookup + Step 1 UI
- `src/lib/meta/client.ts`: add `getOwnedApps(token)` → `GET /me/applications?fields=id,name` (or the business-owned apps endpoint) → `{ id, name }[]`. Store in `metaAccounts.assets.apps` on connect (callback) OR fetch on demand in `/api/meta/account`.
- `StepGoal.tsx`: when objective = APP, relabel "Destination URL" → "App Store URL" (validate `apps.apple.com`), and show an app picker (from owned apps) to set `applicationId`. If no apps are found, show guidance that the iOS app must be added in Meta (Events Manager / app dashboard) and associated with the App Store listing.

### Task 2.3 — write client for app ads
- `ads.ts`: `createCampaign` already takes the objective string. `createAdSet` for APP must include `promoted_object: { application_id, object_store_url }` and `optimization_goal: APP_INSTALLS`. Add an optional `promotedObject` to `AdSetInput`. `createAdCreative` uses `link_data.link = appStoreUrl`, `call_to_action.type = INSTALL_MOBILE_APP`. Add SKAdNetwork: set `campaign` to support iOS14 (e.g. create with `objective` + Meta auto-handles, but document the iOS 14+ "SKAdNetwork" / 9-campaign limit caveat).
- Tests: assert `promoted_object` is sent for app ad sets; CTA INSTALL_MOBILE_APP.

### Task 2.4 — publish branching + validation
- `publish/route.ts`: when `draft.objective === 'APP'`, require `appStoreUrl` (apps.apple.com) + `applicationId`; build `promotedObject`; pass appStoreUrl as the creative link. Keep PAUSED.
- Tests: rejects APP objective without appStoreUrl/applicationId; happy path passes promoted_object.

**Caveat to document:** iOS App Promotion delivery depends on the app being registered in the Meta app dashboard, associated with the App Store listing, and SKAdNetwork configured. The builder creates the (paused) ad; activation/delivery requires that Meta-side setup.

---

## Phase 3 — Video ads (upload-your-own)

**Outcome:** StepCreative offers a Photo/Video toggle; video path uploads a file, pushes to Meta, and builds a video creative.

### Task 3.1 — `/api/ads/upload-video` route
- Create route: `POST` multipart `video`. Validate type in {mp4, mov, quicktime}, size ≤ 100MB. `put(`ad-videos/${uuid}.mp4`, ...)` → `{ url }`. (No sharp.)
- Tests: rejects bad type/size/no-file.

### Task 3.2 — Meta video upload + creative
- `ads.ts`: `uploadAdVideo(token, adAccountId, videoUrl)` → `POST act/advideos` with `file_url=videoUrl` → `{ id }`. `waitForVideoReady(token, videoId)` → poll `GET {videoId}?fields=status` until `status.video_status === 'ready'` (bounded retries/timeout). `createVideoCreative(...)` → `object_story_spec.video_data { video_id, image_url (thumbnail), message, call_to_action, link }` (thumbnail: a poster image — reuse the photo pipeline or a frame URL; v1 use a provided/derived thumbnail URL).
- Tests (mocked fetch): advideos returns id; poll transitions processing→ready; video creative payload shape.

### Task 3.3 — StepCreative media toggle
- `AdDraft`: add `mediaType: 'image' | 'video'`, `videoUrl?`, `thumbnailUrl?`. StepCreative: toggle Photo/Video; video upload + `<video>` preview; thumbnail picker (reuse image candidates as poster).

### Task 3.4 — publish branching
- `publish/route.ts`: if `mediaType === 'video'`, run uploadAdVideo + waitForVideoReady + createVideoCreative instead of uploadAdImage + image creative. Keep PAUSED, same guards.
- Tests: video publish path calls the video fns; image path unchanged.

---

## Cross-cutting
- Every new Meta object stays **PAUSED** (v1 invariant).
- Re-use SSRF guard for any server-side fetch of user URLs.
- Validate uploads (type/size) server-side; uploads go to Vercel Blob (public) so Meta can fetch them.
- Keep files small; follow v1 patterns and existing route style (modified Next.js — see AGENTS.md).
