# Next Session TODO

## Critical Bugs

### 1. Image Processing Failed (blocks scheduling)
- **Where:** `/generate` and `/batch` — clicking Schedule gives "Image processing failed. Please try again or use a different image."
- **Files to check:** `src/app/api/buffer/route.ts`, `src/components/post-generator.tsx`
- **Notes:** Was working before the caption AI upgrade. May be related to image proxy/processing endpoint, not the caption changes.

### 2. Batch Hook Overlay Not Showing on Images
- **Where:** `/batch` — hook text is generated but not rendered on the image preview cards
- **Screenshot:** `c:\Users\nickc\Downloads\batch2.png` — hooks show below the image as text, not overlaid on the image like they used to be
- **Files to check:** `src/components/batch-gallery.tsx` — look for overlay rendering logic, compare with `post-generator.tsx` which has working overlay styles (editorial, bold-card, gradient-bar, full-tint)

## Competitor Data Issues

### 3. You vs Competitors — Competitor Post Data All Zeros
- **Problem:** User's own account shows real data, but ALL competitor accounts show 0% eng, 0 likes, 0 comments despite having follower counts
- **Root cause:** Instagram scraping isn't successfully fetching competitor POSTS. It gets account-level data (followers) but post-level data fails (likely Instagram rate limiting or scraping method broken)
- **Files to check:** `src/app/api/sync/route.ts`, `src/app/api/competitors/scrape/route.ts`
- **What works:** Account-level data (followers, following, post count) IS being scraped
- **What fails:** Individual post data (likes, comments, captions) is NOT being scraped
- **Consider:** Alternative scraping approaches, or using the existing `handleDeepScan` (Playwright-based) more aggressively

### 4. Competitive Scorecards Still Showing N/A
- **Problem:** Since no competitor posts are scraped (issue #3 above), all scorecards show N/A. Fix #3 first.
- **Depends on:** Issue #3 being resolved

## Quality Improvements

### 5. Caption/Hook Quality Ongoing
- Captions are better after prompt upgrade but still room for improvement
- Anti-fabrication rules are in place — monitor for compliance
- Hooks are more creative now but test across multiple generations
- Never say "download" rule is enforced

### 6. Analytics — LarryBrain-Style Post Analysis
- PostAnalyzer component was added to `/analytics` (paste a URL, get AI analysis)
- Could be enhanced: auto-analyze the user's own recent posts without requiring URL input
- Show "this post worked because X" and "this post failed because Y" for each post in the leaderboard
- Specific suggestions per post on what to change

## Already Fixed This Session
- [x] Caption AI upgraded with PAS/AIDA frameworks, scroll-stopping hook rules
- [x] Anti-fabrication rules added (no fake stats, no "research shows 200%")
- [x] Never say "download" (web app)
- [x] Competitors page: AI insights moved below scan button
- [x] Competitors page: +Add button removed
- [x] Scorecards show N/A when no post data (not misleading F)
- [x] Analytics filters by selected brand (Affectly vs PaceBrain)
- [x] PostAnalyzer added to analytics page
- [x] All pushed to develop branch
