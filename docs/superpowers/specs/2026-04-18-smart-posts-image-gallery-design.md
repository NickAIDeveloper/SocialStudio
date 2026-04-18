# Smart Posts — Image Gallery Design

**Date:** 2026-04-18
**Status:** Approved, ready for plan
**Related:** Feature B (Analyze → Create/Smart-posts insight feed) — separate spec

## Problem

On `/smart-posts` each generated post shows a single stock image, picked as `images[0]` from the first provider result. When the auto-derived query is a bad match, the image is "horrendously not connected to the caption" and the user has no way to pick a different one without regenerating the whole post (new caption, new seed, new insight contribution).

## Goal

Let the user swap the image on an already-generated post without losing the caption, hook, or any other seed output. Show candidates inline so alternatives are visible at a glance, with an escape hatch to a full search when none of the candidates fit.

## Non-goals

- Improving the caption-to-query derivation (separate work — shipped 2026-04-18 as `src/lib/image-queries.ts` sanitizer).
- Content-type classification of past posts (deferred to Feature B).
- AI image generation — `ImageSourceSelector` already supports Gemini; we inherit it for free.
- Persisting the chosen image across sessions. Re-render is on-demand.

## Design

### UX

Under each post card:

```
┌─────────────────────────────┐
│   [current image preview]   │
└─────────────────────────────┘
[thumb][thumb][thumb][thumb][thumb][thumb]  [More options]
  ^active
```

- 6 thumbs: up to 4 stock (Pixabay/Unsplash/Pexels mixed) + up to 2 from the user's own top-performing past IG posts (by reach, no content-type filter for v1).
- Active thumb has a ring/border highlight.
- Click thumb → re-render overlay onto that source → in-place swap of `imageDataUrl`.
- "More options" → modal embedding `<ImageSourceSelector>` — pick anything → same re-render flow.

### Architecture

**1. New endpoint: `POST /api/smart-posts/render`**

Extracts the existing `createInstagramImageWithText` call into its own route so a thumb click can re-render without regenerating the rest of the post.

```ts
// Request
{
  sourceImageUrl: string,
  hookText: string,
  brand: 'affectly' | 'pacebrain',
  textPosition: TextPosition,
  overlayStyle: OverlayStyle,
  logoUrl: string | null,
}
// Response
{ imageDataUrl: string }  // 'data:image/jpeg;base64,...'
```

Auth: requires signed-in user (same pattern as existing smart-posts routes). No rate limiting beyond the existing middleware.

**2. `generate.ts` refactor** (`src/lib/smart-posts/generate.ts`)

Today (line 411): picks `imagesPayload.images?.[0]`. Replace with:

```ts
const [stockRes, pastRes] = await Promise.all([
  fetch(`${origin}/api/images?source=all&q=${encodeURIComponent(topicQuery)}`, { headers: { cookie } }),
  fetchTopPerformingPastImages({ igUserId, limit: 2, origin, cookie }),  // new helper
]);

const TARGET = 6;
const PAST_CAP = 2;
const pastCandidates = (pastRes ?? []).slice(0, PAST_CAP).map(m => ({
  url: m.media_url ?? m.thumbnail_url,
  source: 'past' as const,
  permalink: m.permalink,
})).filter(c => c.url);
const stockCandidates = (stockJson.images ?? [])
  .slice(0, TARGET - pastCandidates.length)  // fills whatever past didn't
  .map(img => ({ url: img.largeImageURL ?? img.url, source: 'stock' as const }))
  .filter(c => c.url);

const candidates = [...stockCandidates, ...pastCandidates];
// 0 past posts → up to 6 stock. 2 past → up to 4 stock + 2 past.
const sourceImageUrl = candidates[0]?.url;
// ...existing render of first candidate into imageDataUrl
```

Helper `fetchTopPerformingPastImages` reuses the fetch pattern from `TopPerformersStrip` (`src/components/smart-posts/top-performers-strip.tsx`) — pulls IG media with reach insights, sorts by reach desc, returns top N. If it throws or returns empty, generate silently falls back to stock-only (log to console but do not fail the request).

Response shape adds:

```ts
{
  imageDataUrl,          // pre-rendered first candidate (unchanged)
  sourceImageUrl,        // first candidate URL (unchanged)
  candidates: Array<{ url: string, source: 'stock' | 'past', permalink?: string }>,  // NEW
  renderParams: {        // NEW — needed for client-side re-render
    brand,
    textPosition,
    overlayStyle,
    logoUrl,
    hookText,
  },
  caption, hashtags, hookText, ...                                                     // unchanged
}
```

Both `generate` and `god-mode` routes return this new shape.

**3. `smart-posts-dashboard.tsx` changes**

New subcomponent `CandidateStrip`:

```tsx
// src/components/smart-posts/candidate-strip.tsx
interface Props {
  candidates: Candidate[];
  activeUrl: string;
  renderParams: RenderParams;
  onImageChange: (newImageDataUrl: string, newSourceUrl: string) => void;
  onOpenMoreOptions: () => void;
}
```

Clicking a thumb → POST `/api/smart-posts/render` with `{ sourceImageUrl: candidate.url, ...renderParams }` → call `onImageChange(data.imageDataUrl, candidate.url)`.

Dashboard state update:
```ts
// PerfectPost gains: candidates, renderParams
// onImageChange updates just imageDataUrl + sourceImageUrl on the single post
```

"More options" opens a modal (`<Dialog>` from the existing UI kit — already in use on `/create` and elsewhere) containing `<ImageSourceSelector>`. The selector's `onImagesLoaded` callback auto-selects the first result, but we also expose a "pick this one" grid click that calls the same `onImageChange` → `/render` flow.

### Data flow

```
POST /api/smart-posts/god-mode (or /generate)
  → returns {
      imageDataUrl, sourceImageUrl, candidates[], renderParams,
      caption, hashtags, hookText, ...
    }
  → dashboard stores the PerfectPost including candidates + renderParams

User clicks thumb[i] in CandidateStrip
  → POST /api/smart-posts/render { sourceImageUrl: candidates[i].url, ...renderParams }
  → returns { imageDataUrl }
  → setPost(p => ({ ...p, imageDataUrl, sourceImageUrl: candidates[i].url }))

User clicks "More options"
  → opens <Dialog> with <ImageSourceSelector brand={brand} onImagesLoaded={...} />
  → user picks an image from the grid
  → same /render call → same swap
```

### Error handling

- `/render` auth fail (401) → keep existing image, show toast "Not signed in".
- `/render` 5xx → keep existing image, show toast "Couldn't swap image — try again".
- Past-posts fetch failure inside `generate.ts` → silently log, fall back to stock-only. Don't block the caller.
- Stock fetch returns <4 images → pad with whatever we have; candidates array may be shorter than 6.
- Empty candidates (both sources failed) → existing `no_images` 422 error path (unchanged).

### Testing

- **Unit, `/api/smart-posts/render`:** happy path returns valid data URL; 401 without auth; 400 on missing params; validates brand enum.
- **Unit, `generate.ts` candidate ranking:** stock-first ordering; past capped at 2; empty past falls back to stock-only; empty stock + empty past returns `no_images`.
- **Component, `<CandidateStrip>`:** renders N thumbs; active-state highlights correct one; click calls onImageChange with returned data URL; "More options" triggers onOpenMoreOptions.
- **Manual in-browser:** generate on `/smart-posts`, verify strip shows 6 thumbs, click each, verify image swaps. Click "More options", verify modal opens, search works, pick one, verify swap.

## Risks

- **Latency on `/generate`:** Past-posts fetch adds a round-trip. Parallelized with stock via `Promise.all` so the floor is max(stock, past) not sum. If past is consistently slow (>1s), we can move it to a separate lazy endpoint post-render.
- **`ImageSourceSelector` side effects:** it calls `/api/linked-accounts` on mount and manages its own UI for connecting providers. In a modal this is fine — verify during manual testing that clicking a "Connect provider" button inside the modal doesn't navigate away.
- **Past-post URL expiry:** IG CDN URLs expire. Fine for immediate render (fetched fresh during `/generate`). If a user has an old tab open for hours and then clicks a past thumb, `/render` may 502 on the image fetch. Treat as 5xx error path above.
- **Overlay param drift:** if someone changes overlay styling in `/settings` between generate and thumb-click, the re-render will use the original `renderParams` (frozen at generate time). This is the correct behavior — user picked an image for an already-previewed style, not for a new style.

## Out of scope / follow-up

- Feature B: Analyze insights feeding `/create` and `/smart-posts` — separate brainstorm.
- Caching rendered candidates server-side for faster swap — measure first, only add if latency is noticeable.
- Content-type match for past-post selection — add once we have post classification (Feature B work).
