# Intelligence Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign analytics and competitors pages into an insight-driven intelligence hub with Health Score, plain-English insight cards, onboarding wizard, AI competitor suggestions, and multi-source image support.

**Architecture:** New DB tables store scraped data and cached insights. An insights engine transforms raw post data into prioritized InsightCard objects. The UI renders these as simple, actionable cards — no data tables. Image sources are abstracted behind a common interface so users can plug in Pixabay, Unsplash, Pexels, or AI generation.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Neon Postgres, Sharp, Playwright (scraper), Lucide React icons, existing dark theme with teal accents.

**Spec:** `docs/superpowers/specs/2026-04-06-intelligence-hub-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/insights-engine.ts` | Transforms post data into analytics InsightCard[] |
| `src/lib/competitor-engine.ts` | Transforms competitor data into InsightCard[] |
| `src/lib/health-score.ts` | Computes 0-100 health score from engagement, consistency, trend, variety |
| `src/lib/image-sources/index.ts` | ImageSource interface, ImageResult type, factory function |
| `src/lib/image-sources/pixabay.ts` | Refactored Pixabay search |
| `src/lib/image-sources/unsplash.ts` | Unsplash API search |
| `src/lib/image-sources/pexels.ts` | Pexels API search |
| `src/lib/image-sources/openai-images.ts` | DALL-E image generation |
| `src/components/insight-card.tsx` | Reusable insight card UI component |
| `src/components/health-score.tsx` | Circular score display component |
| `src/components/competitor-card.tsx` | Competitor summary card |
| `src/components/onboarding-wizard.tsx` | Step-by-step setup wizard |
| `src/components/image-source-selector.tsx` | Dropdown for generate page |
| `src/app/api/images/route.ts` | Multi-source image search/generation |
| `src/app/api/insights/route.ts` | GET cached insights, POST to refresh |
| `src/app/api/competitors/route.ts` | CRUD for tracked competitors |
| `src/app/api/competitors/suggest/route.ts` | AI competitor suggestions |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add scraped_accounts, scraped_posts, insights_cache tables; add onboarding columns to user_preferences |
| `src/components/analytics-dashboard.tsx` | Rewrite to use Health Score + insight cards |
| `src/components/competitor-dashboard.tsx` | Rewrite to use competitor cards + insight cards |
| `src/components/post-generator.tsx` | Replace Pixabay-only search with multi-source selector |
| `src/components/settings-panel.tsx` | Add image source connection section |
| `src/app/(dashboard)/layout.tsx` | Add onboarding wizard trigger |
| `src/app/api/pixabay/route.ts` | Deprecated — replaced by /api/images |

---

## Task 1: Database Schema — New Tables

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add scraped_accounts table**

Add to the end of `src/lib/db/schema.ts` (before type exports):

```typescript
import { boolean as pgBoolean } from 'drizzle-orm/pg-core';

// ── Scraped Accounts ────────────────────────────────────────────────
export const scrapedAccounts = pgTable(
  'scraped_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    handle: varchar('handle', { length: 100 }).notNull(),
    isCompetitor: pgBoolean('is_competitor').notNull().default(true),
    followerCount: integer('follower_count'),
    lastScrapedAt: timestamp('last_scraped_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('scraped_account_user_handle_idx').on(t.userId, t.handle)]
);
```

- [ ] **Step 2: Add scraped_posts table**

```typescript
// ── Scraped Posts ────────────────────────────────────────────────────
export const scrapedPosts = pgTable(
  'scraped_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => scrapedAccounts.id, { onDelete: 'cascade' }),
    shortcode: varchar('shortcode', { length: 50 }).notNull(),
    caption: text('caption'),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    imageUrl: text('image_url'),
    isVideo: pgBoolean('is_video').notNull().default(false),
    hashtags: text('hashtags'), // JSON stringified array
    postedAt: timestamp('posted_at', { mode: 'date' }),
    scrapedAt: timestamp('scraped_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('scraped_post_user_shortcode_idx').on(t.userId, t.shortcode)]
);
```

- [ ] **Step 3: Add insights_cache table**

```typescript
// ── Insights Cache ──────────────────────────────────────────────────
export const insightsCache = pgTable(
  'insights_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(), // 'analytics' | 'competitors'
    data: jsonb('data'), // InsightCard[]
    healthScore: integer('health_score'),
    computedAt: timestamp('computed_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('insights_cache_user_type_idx').on(t.userId, t.type)]
);
```

- [ ] **Step 4: Add onboarding columns to user_preferences**

In the existing `userPreferences` table definition, add:

```typescript
  onboardingCompleted: pgBoolean('onboarding_completed').notNull().default(false),
  onboardingStep: integer('onboarding_step').notNull().default(0),
```

- [ ] **Step 5: Add type exports**

```typescript
export type InsertScrapedAccount = typeof scrapedAccounts.$inferInsert;
export type SelectScrapedAccount = typeof scrapedAccounts.$inferSelect;
export type InsertScrapedPost = typeof scrapedPosts.$inferInsert;
export type SelectScrapedPost = typeof scrapedPosts.$inferSelect;
```

- [ ] **Step 6: Push schema to Neon**

```bash
npx drizzle-kit push
```

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat: add scraped_accounts, scraped_posts, insights_cache tables + onboarding columns"
```

---

## Task 2: InsightCard Types + Health Score

**Files:**
- Create: `src/lib/health-score.ts`
- Create: `src/lib/insights-engine.ts` (types only in this task)

- [ ] **Step 1: Create InsightCard type and health score calculator**

Create `src/lib/health-score.ts`:

```typescript
export interface InsightCard {
  id: string;
  priority: number;
  type: string;
  icon: string;
  title: string;
  verdict: 'positive' | 'negative' | 'opportunity';
  summary: string;
  action: string;
  data: Record<string, unknown>;
}

export interface HealthScoreInput {
  avgEngagementRate: number;
  nicheAvgEngagementRate: number;
  postsLast4Weeks: number;
  targetPostsPerWeek: number;
  thisWeeksEngagement: number;
  prevWeeksEngagement: number;
  uniqueContentTypes: number;
  totalContentTypes: number;
}

export function calculateHealthScore(input: HealthScoreInput): number {
  const engagementScore = input.nicheAvgEngagementRate > 0
    ? Math.min(40, (input.avgEngagementRate / input.nicheAvgEngagementRate) * 40)
    : 20;

  const targetPosts = input.targetPostsPerWeek * 4;
  const consistencyScore = Math.min(25, (input.postsLast4Weeks / Math.max(1, targetPosts)) * 25);

  let trendScore = 10;
  if (input.prevWeeksEngagement > 0) {
    const change = (input.thisWeeksEngagement / input.prevWeeksEngagement) - 1;
    trendScore = Math.min(20, Math.max(0, 10 + change * 50));
  }

  const varietyScore = input.totalContentTypes > 0
    ? (input.uniqueContentTypes / input.totalContentTypes) * 15
    : 7.5;

  return Math.round(Math.max(0, Math.min(100, engagementScore + consistencyScore + trendScore + varietyScore)));
}

export function getHealthVerdict(score: number): { color: 'red' | 'amber' | 'green'; label: string } {
  if (score >= 70) return { color: 'green', label: 'Strong' };
  if (score >= 40) return { color: 'amber', label: 'Needs attention' };
  return { color: 'red', label: 'Needs work' };
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/health-score.ts
git commit -m "feat: add InsightCard type and health score calculator"
```

---

## Task 3: Insights Engine (Analytics)

**Files:**
- Create: `src/lib/insights-engine.ts`

- [ ] **Step 1: Create insights engine**

Create `src/lib/insights-engine.ts`. This module takes the user's post data (from Buffer + scraped) and produces an array of `InsightCard` objects, sorted by priority (biggest impact first).

The engine should produce these card types:
- `best-content-type` — compares engagement across content types (quote, tip, carousel, community, promo), surfaces the best with the multiplier vs worst
- `optimal-timing` — analyzes day-of-week + time-of-day engagement, builds a simple heatmap data structure (7 days x 4 time blocks: morning/midday/afternoon/evening)
- `hashtag-health` — identifies top 3-5 performing hashtags and 3-5 worst, with swap recommendations
- `caption-length` — compares average caption length to best-performing posts' length range
- `momentum` — 2-week rolling trend (this period vs previous), outputs direction + percentage
- `top-post` — the single best post with detected winning patterns
- `worst-post` — the single worst post with detected losing patterns

Each card gets a priority score based on the gap between current behavior and optimal:
- Bigger gap = higher priority (lower number)
- Already-optimized areas get lower priority (higher number)

Import types from `health-score.ts`. Use existing analysis logic from `buffer-analyzer.ts` and `content-intelligence.ts` as reference but produce `InsightCard[]` output.

The main export should be:
```typescript
export function generateAnalyticsInsights(
  posts: PostData[],
  nicheAvgEngagement: number
): { insights: InsightCard[]; healthScore: number }
```

Where `PostData` is a unified type combining Buffer and scraped post data:
```typescript
export interface PostData {
  id: string;
  caption: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
  impressions: number;
  hashtags: string[];
  contentType: string;
  postedAt: Date;
  brand: string;
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/insights-engine.ts
git commit -m "feat: add insights engine producing prioritized InsightCard array"
```

---

## Task 4: Competitor Engine

**Files:**
- Create: `src/lib/competitor-engine.ts`

- [ ] **Step 1: Create competitor engine**

Create `src/lib/competitor-engine.ts`. Takes the user's posts and competitor scraped data and produces `InsightCard[]` for the competitors page.

Card types:
- `posting-frequency` — compares user's posting rate vs competitor average. Action: target posts/week.
- `winning-format` — aggregates top content types across all competitors. Shows what format dominates the niche.
- `steal-formula` — finds a specific pattern a competitor uses successfully that the user doesn't. Includes an example.
- `timing-mismatch` — compares user's posting schedule to competitor activity peaks.
- `market-gap` — content types or topics competitors aren't covering well.
- `hashtag-opportunity` — competitor hashtags that perform well but user doesn't use.

Main export:
```typescript
export function generateCompetitorInsights(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
): InsightCard[]
```

Where:
```typescript
export interface CompetitorPostData {
  handle: string;
  caption: string;
  likes: number;
  comments: number;
  hashtags: string[];
  postedAt: Date;
  isVideo: boolean;
}
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/lib/competitor-engine.ts
git commit -m "feat: add competitor engine producing insight cards"
```

---

## Task 5: Insight Card + Health Score UI Components

**Files:**
- Create: `src/components/insight-card.tsx`
- Create: `src/components/health-score.tsx`

- [ ] **Step 1: Create InsightCard component**

Create `src/components/insight-card.tsx` — a client component that renders a single insight card.

Props: `InsightCard` from `health-score.ts`.

Layout:
- Glass-card background (consistent with existing `glass-card` CSS class)
- Left: colored icon (teal for positive, amber for opportunity, red for negative)
- Title in bold white text
- Summary in zinc-400 text
- Action in a teal-tinted box with specific instruction
- Data section renders based on card type:
  - `best-content-type`: 3 horizontal bars with labels and percentages
  - `optimal-timing`: 7x4 grid heatmap (colored cells)
  - `hashtag-health`: two columns — red (drop) and green (try)
  - `caption-length`: range bar showing sweet spot vs current
  - `momentum`: arrow icon (up/down/flat) with percentage
  - `top-post` / `worst-post`: thumbnail + pattern tags
  - Default: just the summary text

Use Lucide icons matching the card type (TrendingUp, Clock, Hash, Type, Zap, Trophy, AlertTriangle).

- [ ] **Step 2: Create HealthScore component**

Create `src/components/health-score.tsx` — circular score display.

Props: `score: number`, `summary: string`

Renders:
- A circular progress ring (SVG) with the score number in the center
- Color based on score: red (<40), amber (40-69), green (70+)
- Summary sentence below in zinc-400
- Compact — fits in a banner at the top of the page

Use SVG circle with `stroke-dasharray` and `stroke-dashoffset` for the ring animation.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/insight-card.tsx src/components/health-score.tsx
git commit -m "feat: add InsightCard and HealthScore UI components"
```

---

## Task 6: Insights API

**Files:**
- Create: `src/app/api/insights/route.ts`

- [ ] **Step 1: Create insights API**

Create `src/app/api/insights/route.ts`:

**GET** `?type=analytics` or `?type=competitors`:
- Auth check with `getUserId()`
- Look up `insights_cache` for this user + type
- If fresh (< 1 hour old), return cached data
- If stale or missing, compute fresh:
  - For analytics: fetch user's posts from Buffer API + scraped_posts, run `generateAnalyticsInsights()`, cache result
  - For competitors: fetch scraped_posts for competitors, run `generateCompetitorInsights()`, cache result
- Return `{ insights: InsightCard[], healthScore?: number, computedAt: string }`

**POST** `?type=analytics` or `?type=competitors`:
- Force refresh — recompute and cache regardless of age
- Same return format

Use `db` for all queries, `getUserId()` for auth, upsert into `insights_cache` on conflict `(userId, type)`.

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/api/insights/route.ts
git commit -m "feat: add insights API with caching"
```

---

## Task 7: Analytics Page Rewrite

**Files:**
- Modify: `src/components/analytics-dashboard.tsx`

- [ ] **Step 1: Rewrite analytics dashboard**

Replace the current multi-tab analytics dashboard with:

1. **Health Score banner** at the top using `<HealthScore>` component
2. **Scrollable insight cards** below, rendered with `<InsightCard>` component
3. A "Refresh" button that POST to `/api/insights?type=analytics`
4. Loading skeleton while fetching
5. Error state if fetch fails (consistent with existing error patterns)

On mount, fetch from `GET /api/insights?type=analytics`. Render the returned `InsightCard[]` array in order (already priority-sorted by the engine).

No tabs. No data tables. Just the score banner and cards.

Keep the existing dark theme styling. Use `glass-card` class for the outer container.

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/analytics-dashboard.tsx
git commit -m "feat: rewrite analytics dashboard with Health Score and insight cards"
```

---

## Task 8: Competitors CRUD API + AI Suggestions

**Files:**
- Create: `src/app/api/competitors/route.ts`
- Create: `src/app/api/competitors/suggest/route.ts`

- [ ] **Step 1: Create competitors CRUD API**

Create `src/app/api/competitors/route.ts`:

**GET**: Return all `scraped_accounts` where `isCompetitor = true` for the current user. Include `followerCount`, `lastScrapedAt`.

**POST**: Add a competitor. Accepts `{ handle: string }`. Validates handle format (alphanumeric + dots + underscores). Creates a `scraped_accounts` record with `isCompetitor: true`. Returns the created record.

**DELETE**: Remove a competitor by `id`. Cascades to delete their `scraped_posts`. Verify ownership.

- [ ] **Step 2: Create AI suggestion endpoint**

Create `src/app/api/competitors/suggest/route.ts`:

**POST**: Accepts `{ brandDescription: string, niche: string }`.

If the user has an OpenAI API key linked (provider `openai_images` in `linked_accounts`):
- Call OpenAI chat API with a prompt: "You are an Instagram marketing expert. Given a brand that is: [brandDescription] in the [niche] niche, suggest 8 Instagram accounts that would be direct competitors. Return ONLY a JSON array of objects with 'handle' (without @) and 'reason' (one sentence why they compete). No other text."
- Parse the JSON response
- Return `{ suggestions: { handle: string, reason: string }[] }`

If no OpenAI key: return a curated list based on niche keywords (fallback — check if niche contains "mental health", "running", "fitness", etc. and return relevant hardcoded suggestions from the existing competitor-insights.ts data).

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/api/competitors/
git commit -m "feat: add competitors CRUD API and AI suggestion endpoint"
```

---

## Task 9: Competitor Card + Competitors Page Rewrite

**Files:**
- Create: `src/components/competitor-card.tsx`
- Modify: `src/components/competitor-dashboard.tsx`

- [ ] **Step 1: Create competitor card component**

Create `src/components/competitor-card.tsx`:

Props: `{ handle: string, followerCount: number | null, lastScrapedAt: Date | null, onRemove: () => void }`

Renders:
- Handle as title
- Follower count (formatted: "1.2M", "58K", etc.)
- Freshness dot: green if scraped < 7 days, amber if > 7 days, red if never
- "Last scraped: 2 days ago" text
- Remove button (small X icon, calls onRemove)

- [ ] **Step 2: Rewrite competitors dashboard**

Replace the current competitor dashboard with:

1. **Top section**: grid of `<CompetitorCard>` components
2. **"Add Competitor"** button — opens an inline input for handle
3. **"Suggest Competitors"** button — calls `/api/competitors/suggest`, shows results with checkboxes, "Track Selected" button
4. **Insight cards** below — fetched from `GET /api/insights?type=competitors`, rendered with `<InsightCard>`
5. **Competitor deep-dive**: clicking a competitor card expands to show their scraped posts, content mix (simple donut via SVG), and comparison bullets

Refresh button that POST to refresh competitor insights.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/competitor-card.tsx src/components/competitor-dashboard.tsx
git commit -m "feat: rewrite competitors page with insight cards and AI suggestions"
```

---

## Task 10: Image Source Abstraction

**Files:**
- Create: `src/lib/image-sources/index.ts`
- Create: `src/lib/image-sources/pixabay.ts`
- Create: `src/lib/image-sources/unsplash.ts`
- Create: `src/lib/image-sources/pexels.ts`
- Create: `src/lib/image-sources/openai-images.ts`

- [ ] **Step 1: Create common interface**

Create `src/lib/image-sources/index.ts`:

```typescript
export interface ImageResult {
  id: string;
  previewURL: string;
  largeImageURL: string;
  tags: string;
  source: 'pixabay' | 'unsplash' | 'pexels' | 'openai' | 'stability';
}

export interface ImageSource {
  search(query: string, apiKey: string): Promise<ImageResult[]>;
}

export interface ImageGenerationSource {
  generate(prompt: string, apiKey: string): Promise<ImageResult[]>;
}

export type ImageSourceType = 'pixabay' | 'unsplash' | 'pexels' | 'openai' | 'stability';

export function getImageSource(type: ImageSourceType): ImageSource | ImageGenerationSource {
  switch (type) {
    case 'pixabay': return require('./pixabay').pixabaySource;
    case 'unsplash': return require('./unsplash').unsplashSource;
    case 'pexels': return require('./pexels').pexelsSource;
    case 'openai': return require('./openai-images').openaiSource;
    default: throw new Error(`Unknown image source: ${type}`);
  }
}

export function isGenerationSource(type: ImageSourceType): boolean {
  return type === 'openai' || type === 'stability';
}
```

- [ ] **Step 2: Create Pixabay source**

Create `src/lib/image-sources/pixabay.ts` — refactor existing `src/lib/pixabay.ts` search into the `ImageSource` interface. Keep the existing `searchImages` function signature but add a wrapper that returns `ImageResult[]`.

- [ ] **Step 3: Create Unsplash source**

Create `src/lib/image-sources/unsplash.ts`:

```typescript
import type { ImageResult, ImageSource } from './index';

export const unsplashSource: ImageSource = {
  async search(query: string, apiKey: string): Promise<ImageResult[]> {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=20&orientation=squarish`;
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Unsplash API error: ${response.status}`);
    const data = await response.json();
    return (data.results || []).map((img: Record<string, unknown>) => ({
      id: String(img.id),
      previewURL: (img.urls as Record<string, string>).small,
      largeImageURL: (img.urls as Record<string, string>).regular,
      tags: ((img.tags as Array<{ title: string }>) || []).map(t => t.title).join(', '),
      source: 'unsplash' as const,
    }));
  },
};
```

- [ ] **Step 4: Create Pexels source**

Create `src/lib/image-sources/pexels.ts`:

```typescript
import type { ImageResult, ImageSource } from './index';

export const pexelsSource: ImageSource = {
  async search(query: string, apiKey: string): Promise<ImageResult[]> {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`;
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) throw new Error(`Pexels API error: ${response.status}`);
    const data = await response.json();
    return (data.photos || []).map((img: Record<string, unknown>) => ({
      id: String(img.id),
      previewURL: (img.src as Record<string, string>).medium,
      largeImageURL: (img.src as Record<string, string>).large2x,
      tags: String(img.alt || ''),
      source: 'pexels' as const,
    }));
  },
};
```

- [ ] **Step 5: Create OpenAI images source**

Create `src/lib/image-sources/openai-images.ts`:

```typescript
import type { ImageResult, ImageGenerationSource } from './index';

export const openaiSource: ImageGenerationSource = {
  async generate(prompt: string, apiKey: string): Promise<ImageResult[]> {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url',
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Images error: ${(err as Record<string, Record<string, string>>).error?.message || response.status}`);
    }
    const data = await response.json();
    return (data.data || []).map((img: { url: string }, i: number) => ({
      id: `openai-${Date.now()}-${i}`,
      previewURL: img.url,
      largeImageURL: img.url,
      tags: prompt.slice(0, 100),
      source: 'openai' as const,
    }));
  },
};
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
git add src/lib/image-sources/
git commit -m "feat: add image source abstraction with Pixabay, Unsplash, Pexels, OpenAI"
```

---

## Task 11: Images API Route

**Files:**
- Create: `src/app/api/images/route.ts`

- [ ] **Step 1: Create multi-source images API**

Create `src/app/api/images/route.ts`:

**GET** `?source=pixabay&q=meditation` — for stock photo search:
- Auth check
- Look up user's API key for the requested source from `linked_accounts`
- If not connected, return 403 with message to connect in Settings
- Decrypt the key
- Call the appropriate image source's `search()` method
- Return `{ images: ImageResult[] }`

**POST** `{ source: 'openai', prompt: '...' }` — for AI generation:
- Same auth + key lookup
- Call the source's `generate()` method
- Return `{ images: ImageResult[] }`

Support `source=all` for GET — searches across all connected stock photo sources, merges and deduplicates results.

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/api/images/route.ts
git commit -m "feat: add multi-source images API"
```

---

## Task 12: Image Source Selector + Generate Page Update

**Files:**
- Create: `src/components/image-source-selector.tsx`
- Modify: `src/components/post-generator.tsx`
- Modify: `src/components/settings-panel.tsx`

- [ ] **Step 1: Create image source selector component**

Create `src/components/image-source-selector.tsx`:

A dropdown that shows the user's connected image sources. Fetches from `/api/linked-accounts` to determine which sources are available. Shows a "Connect more in Settings" link if fewer than 2 sources connected.

For stock sources: renders a search input.
For AI sources: renders a prompt textarea + "Generate" button.

Props: `{ onImagesLoaded: (images: ImageResult[]) => void, brand: string }`

- [ ] **Step 2: Update post-generator to use multi-source**

In `src/components/post-generator.tsx`:
- Replace the hardcoded Pixabay search section with `<ImageSourceSelector>`
- The image grid display stays the same — it just receives `ImageResult[]` instead of `PixabayImage[]`
- Update the image type references throughout the component

- [ ] **Step 3: Update settings panel**

In `src/components/settings-panel.tsx`:
- Add image source connections section below the existing Buffer/Pixabay sections
- Reuse the same `ProviderSection` pattern for: `unsplash`, `pexels`, `openai_images`
- Each validates the key against the respective API on connect

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/image-source-selector.tsx src/components/post-generator.tsx src/components/settings-panel.tsx
git commit -m "feat: multi-source image search on generate page + settings"
```

---

## Task 13: Onboarding Wizard

**Files:**
- Create: `src/components/onboarding-wizard.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create onboarding wizard**

Create `src/components/onboarding-wizard.tsx` — a client component that renders a full-screen overlay with step-by-step setup.

Steps:
1. **Brand Setup** — name, logo upload, colors, Instagram handle, brand description
2. **Connect Tools** — Buffer key, image source keys (at least one required)
3. **Competitors** — AI suggestions based on brand description, manual add, select to track
4. **Analyzing** — progress animation while scraping user's Instagram, compute Health Score
5. **Ready** — summary + "Go to Dashboard" button

Each step:
- Single focused form
- "Next" button (teal) advances, "Skip for now" link skips
- Progress indicator (step dots) at top
- Back button (except step 1)

On completion: PATCH user_preferences to set `onboardingCompleted: true`.
On skip: PATCH `onboardingStep` to current step so they can resume.

Calls existing APIs: `/api/brands` POST, `/api/linked-accounts` POST, `/api/competitors` POST, `/api/competitors/suggest` POST, `/api/insights` POST.

- [ ] **Step 2: Add wizard trigger to dashboard layout**

In `src/app/(dashboard)/layout.tsx`:
- Fetch user preferences from a new API or inline server component
- If `onboardingCompleted === false`, render `<OnboardingWizard>` as an overlay
- Pass a callback to dismiss and set `onboardingCompleted: true`

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/onboarding-wizard.tsx src/app/(dashboard)/layout.tsx
git commit -m "feat: add onboarding wizard for new user setup"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Test analytics flow**

1. Login as origae
2. Navigate to Analytics — should see Health Score + insight cards
3. Click Refresh — should recompute

- [ ] **Step 3: Test competitors flow**

1. Navigate to Competitors — should see competitor management
2. Add a competitor handle — should create record
3. Click "Suggest Competitors" — should get AI suggestions (or fallback)
4. Click Refresh — should show competitor insight cards

- [ ] **Step 4: Test image sources**

1. Go to Settings — see image source section
2. Connect Unsplash or Pexels key
3. Go to Generate — source dropdown should show connected sources
4. Search across different sources

- [ ] **Step 5: Test onboarding**

1. Register a new user
2. Should see onboarding wizard on first dashboard visit
3. Complete all steps
4. Dashboard loads normally after completion

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Intelligence Hub — analytics insights, competitor intelligence, onboarding, multi-source images"
```
