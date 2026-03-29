# Social Studio UI Redesign — Design Spec

## Overview
Redesign Social Studio's UI with Instagram-inspired aesthetics: clean, polished, professional. Replace the confusing dashboard with a command center home page. Add a new Analytics page powered by Buffer Analytics API. Relocate competitor insights to a dedicated page.

## Visual Direction: "Clean Studio"
- Dark mode, zinc base palette
- Teal accent (Affectly), Blue accent (PaceBrain)
- Geist Sans for UI, Geist Mono for metrics/timestamps
- Card-based layouts with consistent spacing (gap-6, p-6)
- No gradients/glassmorphism on surfaces — let composition create hierarchy
- Lucide icons at h-4 w-4 / h-5 w-5

## 1. Left Sidebar Navigation

**Component:** `src/components/sidebar.tsx` (replaces `nav.tsx`)

**Structure:**
- Fixed left, 240px expanded / 64px collapsed
- Top: Logo + "Social Studio" (collapses to icon only)
- Nav items with Lucide icons + labels:
  - Home (`/`) — LayoutDashboard
  - Create (`/generate`) — PenSquare
  - Batch (`/batch`) — Grid3x3
  - Schedule (`/schedule`) — Calendar
  - Analytics (`/analytics`) — BarChart3
  - Competitors (`/competitors`) — Users
- Bottom: Brand filter (All / Affectly / PaceBrain) as segmented control
- Collapse toggle button
- Active state: bg-zinc-800/80 with left accent bar (2px, teal)
- Hover: bg-zinc-800/40

**Layout integration:** Root layout wraps children in flex row — sidebar + main content area with `flex-1 overflow-y-auto`.

## 2. Command Center Home (`/`)

**Component:** `src/components/command-center.tsx` (replaces competitor dashboard on home)

**Top row — Metric cards (4 cards in grid):**
- Posts This Week: count with trend indicator
- Next Scheduled: time + brand badge, or "None scheduled" CTA
- Queue Depth: total posts in Buffer queue
- Top Content Type: most-used type this week

Cards use shadcn Card component, compact layout, Geist Mono for numbers.

**Middle — Quick Actions (3 cards):**
- "Create Post" — PenSquare icon, "Generate captions, find images, schedule" subtitle
- "Generate Batch" — Grid3x3 icon, "Create 20 posts at once" subtitle
- "View Analytics" — BarChart3 icon, "See what's performing" subtitle

Each is a clickable card that navigates to the respective page. Prominent, clear purpose.

**Bottom — Recent Activity:**
- List of recent posts (from Buffer API — sent posts)
- Each row: small thumbnail, caption snippet (truncated), brand badge, status badge (sent/scheduled/failed), relative timestamp
- Empty state: friendly message + CTA to create first post

## 3. Analytics Page (`/analytics`)

**Route:** `src/app/analytics/page.tsx`
**Component:** `src/components/analytics-dashboard.tsx`

**API:** `src/app/api/buffer/route.ts` — extend with `action=analytics` and `action=posts`

**Buffer GraphQL queries needed:**
- `sentPosts` — fetch sent posts with engagement data
- `channelAnalytics` — aggregate channel performance

**Header:** Page title + date range selector (7d/30d/90d pills) + brand filter

**Summary cards (4):**
- Total Posts Sent
- Avg Engagement
- Best Day to Post
- Top Performing Post

**Post Performance Grid/Table:**
- Toggle: Grid view (visual cards) / Table view (data rows)
- Columns: Image, Caption, Brand, Type, Posted, Likes, Comments, Engagement Rate
- Sortable by each metric
- Click to expand with full caption + hashtags

**Insights Sidebar (right, 300px):**
- "Top Hashtags" — most used in high-performing posts
- "Best Times" — derived from post performance data
- "Content Mix" — pie/donut showing content type distribution

## 4. Competitors Page (`/competitors`)

**Route:** `src/app/competitors/page.tsx`
- Imports existing `CompetitorDashboard` component
- Same content, just moved to its own route
- Minor styling refresh to match new card system

## 5. Existing Pages — Shell Update

All pages (Create, Batch, Schedule, Competitors) remove `<Nav />` import and rely on sidebar from layout. Page content gets full width of main area.

## 6. Data Layer

**Buffer Analytics API additions to `src/lib/buffer.ts`:**
- `getSentPosts(channelId, since, limit)` — GraphQL query for sent posts
- `getPostAnalytics(postId)` — individual post metrics (if available)

**Mock data fallback:** `src/data/analytics-mock.ts` — realistic sample data for when Buffer API doesn't return analytics (Buffer's free plan may not expose all metrics). The UI works with mock data and upgrades seamlessly when real data is available.

## 7. Files to Create
- `src/components/sidebar.tsx` — Left sidebar navigation
- `src/components/command-center.tsx` — Home page command center
- `src/components/analytics-dashboard.tsx` — Analytics page
- `src/app/analytics/page.tsx` — Analytics route
- `src/app/competitors/page.tsx` — Competitors route
- `src/data/analytics-mock.ts` — Mock analytics data

## 8. Files to Modify
- `src/app/layout.tsx` — Add sidebar to layout shell
- `src/app/page.tsx` — Replace with command center
- `src/app/globals.css` — Add sidebar utilities if needed
- `src/app/generate/page.tsx` — Remove Nav import
- `src/app/batch/page.tsx` — Remove Nav import
- `src/app/schedule/page.tsx` — Remove Nav import
- `src/lib/buffer.ts` — Add analytics queries
- `src/app/api/buffer/route.ts` — Add analytics action handlers
