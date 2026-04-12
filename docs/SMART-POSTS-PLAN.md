# Smart Posts — Build Plan

**Status:** In progress (session 2026-04-12). Backend done, frontend dashboard + sidebar + smoke test remaining.
**Scope:** ~400 lines across 4 new files + 1 sidebar edit.
**Cost:** $0 — reuses existing free-tier stack only.

---

## Progress (2026-04-12)

### ✅ Done
- [x] **Locked decisions** (interactive session): captions via internal fetch to `/api/captions`; health-score weekly delta via new snapshot table; brand dropdown at top of Smart Posts; seed mapping uses proposed defaults.
- [x] **Schema** — added `healthScoreSnapshots` table to `src/lib/db/schema.ts` (nullable brandId, dateKey VARCHAR(10), healthScore). No unique index — check-then-insert because Postgres treats NULLs as distinct.
- [x] **Migration script** — `scripts/migrate-health-snapshots.ts`. ⚠️ **Must be run once**: `npx tsx scripts/migrate-health-snapshots.ts` (needs `NEON_DB_URL`).
- [x] **Daily snapshot wiring** — `src/app/api/insights/route.ts` `computeAnalytics()` deletes today's row (per userId+brandId) and inserts a fresh one after healthScore is computed. Wrapped in try/catch so snapshot failure can't break insights.
- [x] **Seed derivation** — `src/lib/smart-posts.ts`. Uses the REAL insight types from `insights-engine.ts` (plan's type table was wrong — plan claimed `best-time`, `content-type`, `top-performer`; real types are `best-content-type`, `optimal-timing`, `top-post`, `caption-length`, `caption-patterns`, `momentum`, `hashtag-health`, `worst-post`). `momentum` only actionable when trending down. Diagnostic types (`engagement-benchmark`, `consistency-score`, `post-leaderboard`) return null from `seedFromInsight` and false from `isActionable`.
- [x] **Generate route** — `src/app/api/smart-posts/generate/route.ts`. POST `{insightId, brandId}` → loads InsightCard from `insightsCache` (verifies userId), 422 guard if no scraped/Buffer posts exist, internal fetch to `/api/captions`, internal fetch to `/api/images?source=all`, renders via `createInstagramImageWithText`. Brand `slug` is mapped to `'affectly' | 'pacebrain'` (defaults to 'affectly') because `BRAND_STYLES` in image-processing.ts only has those two palettes. `maxDuration = 60`.
- [x] **History route** — `src/app/api/smart-posts/history/route.ts`. GET `?brandId=` → `{current, previous, delta}`. Previous = closest snapshot within 5-10 days ago.
- [x] **Page shell** — `src/app/(dashboard)/smart-posts/page.tsx`. Wrapped in `BrandRequiredGate`, inside the `(dashboard)` route group so it inherits the sidebar layout.

### 🔨 Remaining
- [ ] **`src/components/smart-posts-dashboard.tsx`** — client component (~200 lines). Brand dropdown (default first brand), health score + delta badge, refresh button, list of RecommendationCards. Each card: icon, title, verdict badge, summary, action, Generate button. When generated: 1080×1080 preview, caption, hashtags, suggestedPostTime hint, Regenerate / Schedule / Download buttons. Schedule calls `GET /api/buffer?action=channels` to find first channel then POST to `/api/buffer` with `mode: 'addToQueue'` (see `src/components/post-generator.tsx:567-622` for exact body shape). Empty state CTA linking to `/analytics` when no insights. Call `loadInsights(false)` on brand change and on mount; `loadInsights(true)` uses POST to force refresh. Load `/api/smart-posts/history?brandId=` separately for the delta.
- [ ] **`src/components/sidebar.tsx`** — add `Sparkles` to lucide-react import, insert `{ href: '/smart-posts', label: 'Smart Posts', icon: Sparkles }` between Batch and Analytics in `navItems` (line 24-32).
- [ ] **Verification** — `npx tsc --noEmit`, then kill the dev server for this project only, restart, Playwright navigate to `/smart-posts`, screenshot, click Generate on the first card, verify image + caption, click Schedule, verify success.

### Key shapes captured for the fresh session
- `/api/captions` POST body: `{brandSlug, contentType, avoidTopics[], variationSeed}` → `{caption, hashtags, hookText}`
- `/api/images` GET `?source=all&q=...` → `{images: [{largeImageURL?, url?, ...}], failedSources}` — images are either `largeImageURL` (Pixabay) or `url`
- `/api/buffer?action=channels` → `{organizations: [{channels: [{id, ...}]}]}`
- `/api/buffer` POST shape (for Schedule): see `src/components/post-generator.tsx:573-593`. Pass `imageUrl: sourceImageUrl` (NOT the data URL — Buffer needs a URL it can fetch; the route re-processes server-side with the overlay params).
- `Brand` type: `'affectly' | 'pacebrain'` (from `src/lib/domain-types.ts`). User-created brands use 'affectly' as the color fallback.
- `InsightCard.id === InsightCard.type` for analytics insights (they're set to the same string literal in `insights-engine.ts`).

### Known gotchas
- The `(dashboard)` route group already provides the sidebar layout — page.tsx does NOT need to re-import the sidebar.
- Validator keeps flagging `new URL(request.url).searchParams` as "async in Next.js 16". That's a FALSE POSITIVE — async `searchParams` only applies to Page component props, not Route Handlers. Ignore.
- The existing `insightsCache` is NOT brand-keyed. Switching brands triggers a recompute (cache only short-circuits when brandId is absent). This is fine for v1.

---

## Goal

A new page at `/smart-posts` that:
1. Reads real engagement data (already scraped + cached by existing infrastructure)
2. Surfaces prioritised recommendations based on what's working / what isn't
3. One-click generates a tailored post **inline on the same page** using the existing caption + stock-image + overlay pipeline (no navigation to `/generate`)
4. Offers Regenerate / Schedule to Buffer / Download

**Explicit constraint:** Must use REAL data from the user's account — no fabricated metrics, no placeholder insights. All numbers traced to scraped posts or Buffer analytics in the DB.

---

## Design decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Name | **Smart Posts** | One word, parallels `/generate`, `/batch` |
| Route | `/smart-posts` | |
| Generation location | **Inline** on `/smart-posts`, not `/generate` | User stays on one page |
| Image pipeline | **Existing** `createInstagramImageWithText` + stock images | No new AI image path |
| Insight source | **Shared** with `/analytics` via `insightsCache` table | One scrape, two views |
| Cache refresh | **Manual refresh** + use cached by default | Fast first paint, user-controlled refresh |
| Auto-schedule to Buffer | **No** — user clicks Schedule after reviewing | Avoid posting noise |
| Variants per click | **One** — Regenerate for new variant | Simple, fewer API hits |
| Button placement | **On every actionable insight card** | No separate "top picks" section |

---

## Existing infrastructure (all already built)

| Piece | File | Notes |
|---|---|---|
| `InsightCard` type | `src/lib/health-score.ts:1` | Has `id`, `priority`, `type`, `verdict`, `summary`, `action`, `data` |
| Insight generation | `src/lib/insights-engine.ts` (708 lines) | Already computes best-performing patterns |
| Insights API | `src/app/api/insights/route.ts` | GET returns cached `{insights, healthScore, summary}`, POST forces refresh |
| AI narrative summary | `src/app/api/insights/ai/route.ts` | Cerebras-powered |
| Caption generation | `src/app/api/captions/route.ts` | POST `{brandSlug, contentType, avoidTopics[], variationSeed}` → `{caption, hashtags, hookText}`. Already pulls competitor intel + own top posts + cached insights into the prompt |
| Stock image search | `src/app/api/images/route.ts` | GET `?source=all&q=<query>` → `{images, failedSources}` |
| Image compositor | `src/lib/image-processing.ts:createInstagramImageWithText` | Text overlay + logo. Font fix live on main via `public/fonts/PlayfairDisplay-Black.ttf` |
| Buffer scheduling | `src/app/api/buffer/route.ts` | Already used by post-generator |
| Sidebar pattern | `src/components/sidebar.tsx:24` (`navItems` array) | Add entry there |
| DB schema | `src/lib/db/schema.ts` | `scrapedPosts`, `postAnalytics`, `insightsCache` all present |

---

## Files to create

### 1. `src/lib/smart-posts.ts` (~80 lines)

Derives a `GenerationSeed` from an `InsightCard`. Pure function, no DB/HTTP.

```ts
import type { InsightCard } from './health-score';
import type { OverlayStyle } from './image-processing';

export interface GenerationSeed {
  brandId?: string;
  contentType: 'promo' | 'quote' | 'tip' | 'community' | 'carousel';
  overlayStyle: OverlayStyle;
  topicHint?: string;             // feeds image search query + caption prompt
  hookPattern?: string;            // e.g., "The secret to ___"
  avoidTopics: string[];           // passed to /api/captions to avoid recent themes
  suggestedPostTime?: { day: string; hour: number };
  reasoning: string;               // human-readable "why this seed"
}

export function seedFromInsight(
  card: InsightCard,
  brandId?: string,
): GenerationSeed | null {
  // Switch on card.type — map each real insight type from insights-engine
  // to a seed. Return null for non-actionable insights.
}

export function isActionable(card: InsightCard): boolean {
  return seedFromInsight(card, undefined) !== null;
}
```

**Seed mapping by insight type** — derived from the `type` field emitted by `insights-engine.ts`:

| Insight `type` | Seed derivation |
|---|---|
| `best-time` | `suggestedPostTime` from `card.data.bestTimeBlock` + `bestDay` |
| `caption-length` | `contentType`: picks `tip` for long-winners, `quote` for short-winners |
| `content-type` | `contentType`: `carousel` if carousels win, `quote` for image-winners |
| `hashtag-strategy` | adds to `avoidTopics` if none of the top tags fit current post |
| `top-performer` | `hookPattern` extracted from top post caption's first line |
| `engagement-trend` (down) | `contentType`: 'community' (relatable, engagement-driven) |
| `overlay-style` | `overlayStyle` from brand-voice or highest-performing past posts |

Grep `src/lib/insights-engine.ts` for all `type:` string literals when implementing — don't guess the types.

### 2. `src/app/api/smart-posts/generate/route.ts` (~150 lines)

Orchestrator endpoint. Single POST that runs the full pipeline server-side.

```ts
// POST /api/smart-posts/generate
// Body: { insightId: string, brandId?: string }
//
// Steps (all server-side, no client roundtrips):
//   1. Load the InsightCard from insightsCache (verify userId match)
//   2. Derive GenerationSeed via seedFromInsight()
//   3. Call captions logic — either:
//      (a) fetch('/api/captions', {brandSlug, contentType, avoidTopics}) internally, OR
//      (b) extract the caption-prompt-building into src/lib/caption-engine.ts and call directly
//      → (b) is cleaner but bigger refactor. Start with (a) — internal fetch to own API.
//   4. Query stock image via fetch('/api/images?source=all&q=<topicHint>')
//   5. Pick first image result
//   6. Call createInstagramImageWithText(imageUrl, brand, hookText, ...) — imported directly
//   7. Return JSON: {
//        imageDataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
//        caption, hashtags, hookText,
//        seed, suggestedPostTime, sourceInsightId
//      }
```

**Important**: this endpoint must refuse to run if the user has no `scrapedPosts` or `postAnalytics` for the brand — that's the "no fabrication" guard. Return 422 with a helpful message pointing them to Analytics to run their first scrape.

### 3. `src/app/smart-posts/page.tsx` (~20 lines)

Server-rendered shell — auth check + load layout, then defer to client component.

```tsx
import { SmartPostsDashboard } from '@/components/smart-posts-dashboard';
export default function SmartPostsPage() {
  return <SmartPostsDashboard />;
}
```

### 4. `src/components/smart-posts-dashboard.tsx` (~200 lines)

Client component. Structure:

```
┌ Header ─────────────────────────────────────┐
│ Smart Posts              [Refresh Insights] │
│ Health Score: 72/100  ·  3 actionable       │
└─────────────────────────────────────────────┘

┌ RecommendationCard ────────────────────────┐
│ [priority badge]  [insight title]          │
│ [summary — based on real data, with count] │
│ [seed preview — what will be generated]    │
│                                            │
│ [Generate Post from this Insight]          │
│                                            │
│ ↓ (expands when generated) ↓               │
│ [1080×1080 preview image]                  │
│ [caption text]                             │
│ [hashtags]                                  │
│ [Regenerate] [Schedule] [Download]         │
└────────────────────────────────────────────┘

(one card per actionable insight, sorted by priority)
```

State shape:
```ts
interface GeneratedPost {
  insightId: string;
  imageDataUrl: string;
  caption: string;
  hashtags: string;
  hookText: string;
  suggestedPostTime?: { day: string; hour: number };
}

const [insights, setInsights] = useState<InsightCard[]>([]);
const [generated, setGenerated] = useState<Record<string, GeneratedPost>>({});
const [generating, setGenerating] = useState<Set<string>>(new Set());
```

Wire flow:
- Mount: `GET /api/insights?type=analytics` → filter with `isActionable()` → render
- Click Generate: `POST /api/smart-posts/generate` → store under `generated[insightId]` → expand card
- Click Regenerate: same POST, overwrite stored result
- Click Schedule: `POST /api/buffer` with same shape `/generate` uses today (grep post-generator.tsx for the existing schedule payload)
- Click Download: create blob from `imageDataUrl`, trigger download

## Files to modify

### `src/components/sidebar.tsx` — add one nav entry

At line 24:

```ts
const navItems = [
  { href: '/home', label: 'Home', icon: LayoutDashboard },
  { href: '/generate', label: 'Create', icon: PenSquare },
  { href: '/batch', label: 'Batch', icon: Grid3x3 },
  { href: '/smart-posts', label: 'Smart Posts', icon: Sparkles },  // NEW
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/competitors', label: 'Competitors', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: User },
];
```

Add `Sparkles` to the lucide-react import.

---

## "No fabrication" guard

Key principle: every recommendation must trace back to actual rows in `scrapedPosts` or `postAnalytics`. Never invent.

Implementation:
- `seedFromInsight` only runs on `InsightCard`s that were generated by `insights-engine.ts` from real DB data
- The `reasoning` field must quote the data (e.g., `"Based on 14 posts over 30 days — your carousels averaged 142 likes vs 45 for images"`)
- If `insightsCache` is empty or stale for the brand, show an empty state with a "Scrape your Instagram to generate recommendations" CTA linking to `/analytics`

---

## Testing checklist

Before marking done:

- [ ] Empty state: user with no scraped data → dashboard shows helpful CTA, not errors or fake insights
- [ ] Real user: insights render with traceable data citations
- [ ] Generate: returns a real 1080×1080 image with text overlay rendering correctly (Playfair font)
- [ ] Regenerate: returns a different caption/hook (variationSeed changes)
- [ ] Schedule: post appears in Buffer queue at suggested time
- [ ] Download: file saves as JPEG
- [ ] TypeScript clean: `npx tsc --noEmit` passes
- [ ] Mobile responsive (sidebar is already mobile-aware; verify cards wrap)

---

## Build order (recommended)

1. `src/lib/smart-posts.ts` + unit test the seed derivation with hardcoded `InsightCard` fixtures
2. `src/app/api/smart-posts/generate/route.ts` — hit it with curl / Playwright, verify it returns a valid base64 image
3. `src/components/smart-posts-dashboard.tsx` — render insights first, generation second
4. `src/app/smart-posts/page.tsx` — tiny
5. `src/components/sidebar.tsx` — one-line nav entry
6. Full E2E test via Playwright: navigate → click Generate → verify preview → click Schedule → verify Buffer queue

---

## Open questions for next session

1. **Where does `/api/smart-posts/generate` call captions from?** Option (a) internal fetch to `/api/captions` or (b) extract the prompt-building into a shared lib function. Start with (a) — no refactor needed. If latency becomes an issue, refactor later.
2. **Health score weekly delta** — the mockup shows "↑ +4 vs last week". Does `insightsCache` store historical snapshots, or only the current one? If only current, skip the delta for v1.
3. **Brand selection** — the dashboard currently has an "All / per-brand" filter in the sidebar but it's cosmetic. Should Smart Posts filter by brand? Probably yes — respect whichever brand the user is viewing. Check `src/components/sidebar.tsx:127–152` for the brand filter state pattern.

Answer these at the top of the next session before writing code.

---

## What ships with this feature

- **Real insights from real data** (already live, just surfaced on a new page)
- **One-click tailored post generation** using the exact pipeline that makes `/generate` work
- **Scheduling** via existing Buffer integration
- **Zero new external dependencies or costs**

The whole feature is essentially a new UI over infrastructure you've already paid to build.
