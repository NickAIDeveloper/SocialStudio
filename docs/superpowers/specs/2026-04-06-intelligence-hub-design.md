# Intelligence Hub — Analytics + Competitors Redesign

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Redesign analytics and competitors pages into insight-driven intelligence hub, add onboarding wizard, add multiple image sources

---

## 1. Overview

Replace the current data-heavy analytics and competitors pages with an insight-driven "Intelligence Hub" that tells users what to do in plain English. Add an onboarding wizard for new users, AI-powered competitor suggestions with hashtag discovery refinement, and support for multiple image sources (Pixabay, Unsplash, Pexels, AI generation).

### Design Philosophy

- No data tables. No unexplained charts.
- Every screen answers a question with a verdict and a clear action.
- Most important insights float to the top.
- Think "Instagram coach" not "spreadsheet."

### Goals

- Users understand their Instagram performance at a glance (Health Score)
- Users see exactly what competitors are doing better and how to beat them
- New users are guided through setup in under 2 minutes
- Users can choose their preferred image source for content generation

### Non-Goals

- Instagram Graph API integration (doesn't scale for multi-tenant SaaS)
- Real-time monitoring or webhooks
- Automated posting without user confirmation

---

## 2. Your Performance (Analytics Page Redesign)

### 2.1 Health Score Banner

A single 0-100 score at the top of the page representing overall account health.

**Calculation inputs:**
- Engagement rate vs niche average (weight: 40%)
- Posting consistency — how regular is their schedule (weight: 25%)
- Growth trend — engagement improving or declining over 4 weeks (weight: 20%)
- Content variety — are they using multiple formats (weight: 15%)

**Display:**
- Large circular score with color: red (0-39), amber (40-69), green (70-100)
- One plain-English sentence summarizing the verdict
- Examples:
  - Score 78: "Your engagement is strong but you're only posting 2x/week — bump to 4x to keep momentum"
  - Score 42: "Your content quality is good but inconsistent posting is hurting your reach"
  - Score 91: "You're outperforming most accounts in your niche — keep this schedule"

### 2.2 Insight Cards

Scrollable, priority-ordered cards. No tabs. Each card follows the same structure:

```
┌─────────────────────────────────────────┐
│ 🎯 [Icon]  [Plain English Title]        │
│                                         │
│ [Verdict — what the data says]          │
│                                         │
│ [Action — what to do about it]          │
│                                         │
│ [Supporting visual — mini chart/list]   │
└─────────────────────────────────────────┘
```

**Card types (priority order):**

1. **Best Content Type** — "Your carousels get 2.3x more engagement than quotes"
   - Shows top 3 content types ranked by engagement
   - Action: "Create more carousels this week"
   - Visual: 3 horizontal bars with labels

2. **Optimal Posting Times** — "Tuesday and Thursday mornings are your sweet spot"
   - Simple 7x4 heatmap grid (days x morning/midday/afternoon/evening)
   - Color intensity = engagement level
   - Action: "Schedule your next post for Tuesday 8 AM"

3. **Hashtag Health** — "These hashtags are dragging you down"
   - Split view: red (drop these 3-5) vs green (try these 3-5)
   - Based on engagement correlation
   - Action: swap list with copy button

4. **Caption Length** — "Your best posts are 120-180 words — you're averaging 60"
   - Simple range indicator showing sweet spot vs current average
   - Action: target word count

5. **Momentum** — "You're on a roll" or "You're losing steam"
   - 4-week trend with arrow (up/down/flat)
   - Comparison: this 2 weeks vs previous 2 weeks with % change
   - Action: maintain pace or increase frequency

6. **Top Post This Month** — shows the post with why it worked
   - Post thumbnail, engagement stats, detected winning patterns
   - "This worked because: carousel format + question in caption + posted Tuesday 8 AM"

7. **Worst Post This Month** — shows it with what went wrong
   - Same format but with losing patterns highlighted
   - "This underperformed because: posted Sunday 11 PM + no CTA + overused hashtags"

**Insight engine determines which cards to show and their order based on what has the biggest potential impact for the user.**

### 2.3 Data Sources

- Buffer API: posts scheduled through the app with any available engagement metrics
- Instagram scraper: public likes/comments/timestamps for the user's own accounts
- Computed insights cached in DB, refreshed on manual trigger or after new posts

---

## 3. Competitor Intelligence (Competitors Page Redesign)

### 3.1 Competitor Management

**Top section: "Who are you competing with?"**

- Grid of competitor cards showing: avatar (scraped), handle, follower count, last scraped date, a colored dot (green = fresh data, amber = stale > 7 days)
- **"Add Competitor"** button — manual handle entry
- **"Suggest Competitors"** button:
  1. Takes the user's brand description + niche keywords
  2. Sends to LLM: "Suggest 10 Instagram accounts that compete with a [brand description] brand"
  3. Returns suggestions with handles and why they're relevant
  4. User picks which to track
  5. Scraper queues them for data collection
- **Hashtag discovery** (background, over time):
  - When scraping competitors, collect their hashtags
  - Cross-reference with other accounts using the same tags
  - Surface new suggestions as a notification card: "We found @newaccount posting similar content — want to track them?"

### 3.2 Insight Cards (same pattern as analytics)

1. **Posting Frequency Gap** — "@calm posts 2x more often than you"
   - Your frequency vs average competitor frequency
   - Action: specific target posts/week

2. **Winning Format in Your Niche** — "Carousels dominate your space"
   - Aggregated content type performance across all tracked competitors
   - Action: "3 of 4 competitors get best engagement from carousels — make this 50% of your content"

3. **Steal This Formula** — "Try text-only quote images like @nedratawwab"
   - Identifies a specific pattern a competitor uses successfully that the user hasn't tried
   - Shows example posts from the competitor
   - Action: specific content idea to try

4. **Timing Mismatch** — "You're posting when nobody's looking"
   - Compares user's posting schedule to when competitors post and when engagement peaks
   - Visual: simple timeline showing user's posts vs competitor activity

5. **Gap in the Market** — "Nobody in your niche is doing educational reels"
   - Content types or topics competitors aren't covering well
   - Action: specific content opportunity to own

6. **Hashtag Opportunity** — "These tags work for competitors but you're not using them"
   - Side-by-side: their top tags vs yours
   - Action: tags to add with expected impact

### 3.3 Competitor Deep-Dive

Click any competitor card to expand into a detail view:

- **Recent posts** (scraped) with engagement numbers
- **Content mix** — simple donut chart (quotes, carousels, reels, tips, etc.)
- **What they do better than you** — 2-3 specific bullet points
- **What you do better than them** — 2-3 specific bullet points
- **Their posting pattern** — when and how often

---

## 4. Onboarding Wizard

Triggered on first login for new users. A step-by-step overlay wizard.

### Steps

**Step 1: "What's your brand?"**
- Brand name (text input)
- Upload logo (file picker → processes and stores via existing logo upload API)
- Pick brand colors (color pickers with defaults)
- Instagram handle (text input, validated format)
- Brief description of brand/niche (textarea, 1-2 sentences — used for competitor suggestions)

**Step 2: "Connect your tools"**

Sub-sections:

*Scheduling (required):*
- Buffer API key — paste and validate

*Image Source (pick at least one):*
- Pixabay API key (default/recommended)
- Unsplash API key
- Pexels API key
- AI Image Generation — OpenAI or Stability AI API key

Each has a "Connect" button that validates the key against the respective API.

**Step 3: "Who are your competitors?"**
- Auto-populated with AI suggestions based on brand description from Step 1
- User can toggle on/off each suggestion
- "Add more" field for manual handles
- Selected competitors queued for initial scrape

**Step 4: "Analyzing your account..."**
- Progress animation while scraping user's Instagram handle
- Runs initial intelligence analysis
- Shows their Health Score when complete

**Step 5: "You're ready"**
- Summary of what's set up (brand, connections, competitors)
- "Go to Dashboard" button
- Note: "You can change any of this in Settings"

**Skippable:** Users can skip any step via a "Skip for now" link. Incomplete setup items appear as prompts in the dashboard sidebar.

### Storage

Onboarding completion tracked in `user_preferences`:
- Add `onboarding_completed` boolean column (default false)
- Add `onboarding_step` integer column (tracks where they left off if skipped)

---

## 5. Multiple Image Sources

### 5.1 Supported Sources

| Source | Type | API | Free Tier |
|--------|------|-----|-----------|
| Pixabay | Stock photos | REST, key-based | 100 req/min |
| Unsplash | Stock photos | REST, key-based | 50 req/hr |
| Pexels | Stock photos | REST, key-based | 200 req/hr |
| OpenAI (DALL-E) | AI generation | REST, key-based | Pay per image |
| Stability AI | AI generation | REST, key-based | Pay per image |

### 5.2 Database Changes

Add to `linked_accounts` — each image source stored as a provider:
- `pixabay`, `unsplash`, `pexels`, `openai_images`, `stability_ai`

No schema changes needed — `linked_accounts` already supports arbitrary providers with encrypted tokens.

### 5.3 Settings UI

In Settings page, new section: **"Image Sources"**

Same card pattern as Buffer/Pixabay connections:
- Each source: name, status (connected/not), connect/disconnect button
- API key input + validation on connect

### 5.4 Generate Page Changes

Replace the current hardcoded Pixabay search with:
- **Source selector dropdown** above the search bar: shows only connected sources
- For stock photo sources (Pixabay/Unsplash/Pexels): search bar with query
- For AI generation (OpenAI/Stability): prompt textarea instead of search bar, "Generate" button
- "All Stock Photos" option searches across all connected stock sources, merges results

### 5.5 Image Source Abstraction

Create `src/lib/image-sources/` with:

```
src/lib/image-sources/
├── index.ts          # ImageSource interface + factory
├── pixabay.ts        # Existing, refactored
├── unsplash.ts       # New
├── pexels.ts         # New
├── openai.ts         # New (DALL-E generation)
└── stability.ts      # New (Stable Diffusion generation)
```

Common interface:
```typescript
interface ImageSource {
  search(query: string, apiKey: string): Promise<ImageResult[]>;
}

interface ImageGenerationSource {
  generate(prompt: string, apiKey: string): Promise<ImageResult[]>;
}

interface ImageResult {
  id: string;
  previewURL: string;
  largeImageURL: string;
  tags: string;
  source: string;  // 'pixabay' | 'unsplash' | 'pexels' | 'openai' | 'stability'
}
```

### 5.6 API Route Changes

Replace `/api/pixabay` with `/api/images`:
- GET: `?source=pixabay&q=meditation` for stock search
- POST: `{ source: 'openai', prompt: 'person meditating at sunrise' }` for AI generation
- Looks up the user's API key for the requested source from `linked_accounts`
- Returns unified `ImageResult[]` format

---

## 6. Database Changes

### New columns on `user_preferences`:

| Column | Type | Default |
|--------|------|---------|
| onboarding_completed | boolean | false |
| onboarding_step | integer | 0 |

### New table: `scraped_accounts`

Replace the JSON file storage with a proper DB table.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users, not null |
| handle | varchar(100) | Instagram handle, not null |
| is_competitor | boolean | true = competitor, false = own account |
| follower_count | integer | Nullable, updated on scrape |
| last_scraped_at | timestamp | Nullable |
| created_at | timestamp | Default now() |

Unique constraint: (user_id, handle)

### New table: `scraped_posts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users, not null |
| account_id | uuid | FK → scraped_accounts, not null |
| shortcode | varchar(50) | Instagram post ID, not null |
| caption | text | Nullable |
| likes | integer | Default 0 |
| comments | integer | Default 0 |
| image_url | text | Nullable |
| is_video | boolean | Default false |
| hashtags | text[] | Array of hashtags |
| posted_at | timestamp | When the post was published |
| scraped_at | timestamp | Default now() |

Unique constraint: (user_id, shortcode)

### New table: `insights_cache`

Caches computed insights so they don't need recalculating on every page load.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users, not null |
| type | varchar(20) | 'analytics' or 'competitors' |
| data | jsonb | The computed insight cards |
| health_score | integer | 0-100, nullable (analytics only) |
| computed_at | timestamp | Default now() |

Unique constraint: (user_id, type)

---

## 7. Intelligence Engine Enhancements

Enhance `src/lib/content-intelligence.ts` to produce the insight card format:

### Input
- User's posts (from Buffer API + scraped_posts)
- Competitor posts (from scraped_posts where is_competitor = true)
- User's brand settings

### Output: `InsightCard[]`

```typescript
interface InsightCard {
  id: string;
  priority: number;        // 1 = most important, higher = less
  type: string;            // 'best-content-type', 'optimal-timing', 'hashtag-health', etc.
  icon: string;            // Lucide icon name
  title: string;           // Plain English, e.g. "Your carousels get 2.3x more engagement"
  verdict: 'positive' | 'negative' | 'opportunity';
  summary: string;         // 1-2 sentence explanation
  action: string;          // Specific thing to do
  data: Record<string, unknown>;  // Card-specific data for rendering (bars, heatmap, etc.)
}
```

### Priority Calculation

Cards are ranked by **potential impact**:
- Biggest gap between current behavior and optimal → highest priority
- E.g., if user posts 1x/week but competitors average 7x/week, frequency card is #1
- If hashtags are already optimized, hashtag card drops to bottom

### Health Score Calculation

```
engagement_score = (user_avg_engagement / niche_avg_engagement) * 40
consistency_score = (posts_last_4_weeks / target_posts) * 25  // capped at 25
trend_score = (this_2wk_engagement / prev_2wk_engagement - 1) * 100  // normalized to 0-20
variety_score = (unique_content_types_used / total_available_types) * 15

health_score = clamp(engagement_score + consistency_score + trend_score + variety_score, 0, 100)
```

Niche average derived from tracked competitors' engagement rates.

---

## 8. New File Structure

```
src/
├── lib/
│   ├── image-sources/
│   │   ├── index.ts              # Interface + factory + unified search
│   │   ├── pixabay.ts            # Refactored from existing
│   │   ├── unsplash.ts           # New
│   │   ├── pexels.ts             # New
│   │   ├── openai-images.ts      # New (DALL-E)
│   │   └── stability.ts          # New (Stable Diffusion)
│   ├── insights-engine.ts        # New — produces InsightCard[] for analytics
│   ├── competitor-engine.ts      # New — produces InsightCard[] for competitors
│   └── health-score.ts           # New — computes 0-100 health score
├── app/
│   ├── (dashboard)/
│   │   ├── analytics/page.tsx    # Redesigned — Health Score + insight cards
│   │   └── competitors/page.tsx  # Redesigned — competitor cards + insight cards
│   └── api/
│       ├── images/route.ts       # New — replaces /api/pixabay, multi-source
│       ├── insights/route.ts     # New — GET insights for analytics or competitors
│       ├── competitors/route.ts  # New — CRUD for tracked competitors
│       └── competitors/suggest/route.ts  # New — AI competitor suggestions
├── components/
│   ├── insight-card.tsx          # New — reusable insight card component
│   ├── health-score.tsx          # New — circular score display
│   ├── competitor-card.tsx       # New — competitor summary card
│   ├── onboarding-wizard.tsx     # New — step-by-step setup wizard
│   ├── image-source-selector.tsx # New — dropdown for generate page
│   └── analytics-dashboard.tsx   # Rewritten — uses insight cards
│   └── competitor-dashboard.tsx  # Rewritten — uses insight cards
```

---

## 9. Implementation Phases

### Phase 1 — Foundation
- New DB tables (scraped_accounts, scraped_posts, insights_cache)
- Add onboarding columns to user_preferences
- Migrate scraper from JSON files to DB
- InsightCard interface + health score calculator
- Insight card UI component

### Phase 2 — Analytics Redesign
- Health Score component + banner
- Insights engine (produces analytics insight cards)
- Analytics page rewrite using insight cards
- Insights caching API

### Phase 3 — Competitors Redesign
- Competitor CRUD API + management UI
- AI competitor suggestion endpoint
- Competitor engine (produces competitor insight cards)
- Competitors page rewrite using insight cards
- Competitor deep-dive view

### Phase 4 — Onboarding Wizard
- Wizard component with 5 steps
- Onboarding state tracking
- Skip/resume logic
- Dashboard prompts for incomplete setup

### Phase 5 — Multiple Image Sources
- Image source abstraction layer
- Unsplash, Pexels, OpenAI, Stability integrations
- Settings UI for connecting sources
- Generate page source selector
- Replace /api/pixabay with /api/images
