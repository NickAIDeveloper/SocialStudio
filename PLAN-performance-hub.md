# Plan: Performance Hub + God-Mode Smart Posts

> **Supersedes `PLAN-insights-hub.md`** (that plan kept four separate tabs; this
> one merges Analytics + Meta into a single Performance page so the redundancy
> actually goes away).

## Goals

1. **Kill the Analytics vs Meta duplication.** One page — `/analytics` —
   answers performance questions. A source toggle picks the feed (Meta API vs
   scrape). Sections are organized by question, not by source.
2. **Smart Posts gets a god-mode flow.** When Meta is connected, it runs a
   deep per-IG-account analytics scan and asks the LLM to design a post
   engineered for maximum engagement *for that specific account*. Each IG
   account is treated separately.
3. **Preserve the scrape path verbatim.** Users without Meta keep the
   existing Generate-from-scrape-insights button. No behavior change on that
   path.
4. **Per-IG-account isolation.** Selecting `@brand_a` never bleeds data from
   `@brand_b` — neither on Performance nor Smart Posts.

## Non-goals

- Do NOT touch `/generate`, `/batch`, `/schedule`, `/home`, `/settings`,
  `/profile`, `/competitors`. Out of scope.
- Do NOT merge OAuth connection UI into the hub. `/meta` OAuth callback
  flow stays; we just redirect the landing page.
- Do NOT rewrite the existing scrape insight pipeline (`lib/smart-posts.ts`,
  `/api/insights`). God-mode is additive.
- Do NOT gate scrape behind Meta. If Meta is not connected, Smart Posts
  silently hides the source toggle and shows only the scrape button.

## Routes

| Current                | After                                   | Notes |
|------------------------|------------------------------------------|-------|
| `/analytics`           | `/analytics` (becomes Performance hub)   | Adds `?source=meta\|scrape&ig=<igUserId>` |
| `/meta`                | redirects → `/analytics?source=meta`     | Preserves `?connected=1` query from OAuth callback |
| `/smart-posts`         | `/smart-posts` (adds god-mode flow)      | Adds `?source=meta\|scrape&ig=<igUserId>` |
| `/competitors`         | unchanged                                | Untouched |

`/meta` keeps its URL only as a one-line redirect component so bookmarks and
the OAuth callback still work.

## New files

### Performance page

- `src/components/performance/performance-page.tsx` — the new unified page
  body. Renders source toggle, brand + IG-account selectors, then conditional
  sections. Replaces both `analytics-dashboard.tsx` (body) and `meta-hub.tsx`
  as the top-level mount point. The two existing components are **reused as
  sub-sections** (see below), not deleted.
- `src/components/performance/source-toggle.tsx` — two-button pill:
  `Meta insights | Scrape`. Disabled state for Meta when no IG connected, with
  "Connect Meta in Settings" tooltip.
- `src/components/performance/ig-account-picker.tsx` — extracted from the
  existing `InstagramSection` in `meta-hub.tsx:320-470`. Lifts the
  `selectedIg` state up to a URL query param so Smart Posts can read it too.
- `src/components/performance/section-header.tsx` — reusable
  `<SectionHeader title subtitle unavailable?>` that renders a
  "Connect Meta to unlock" CTA when the active source can't fill the section.

### Smart Posts god-mode

- `src/app/api/smart-posts/god-mode/route.ts` — new POST endpoint.
  - Input: `{ brandId, igUserId }`
  - Steps: (1) verify brand + IG ownership, (2) fetch deep profile via
    `lib/meta/deep-profile.ts`, (3) ask Cerebras to produce a seed + rationale,
    (4) call the existing `/api/smart-posts/generate` path internally with the
    seed flattened into `metaOverrides` + a new `godModeRationale` field.
  - Output: same shape as `/api/smart-posts/generate` plus
    `godModeRationale: string` and `deepProfile: {...}` for the UI to render
    the "Why this works" panel with real numbers.
- `src/lib/meta/deep-profile.ts` — pure function that pulls everything Meta
  gives us for one IG account and derives a profile object. Called by the
  god-mode route. Cached per `igUserId` in memory for 15 minutes.
- `src/lib/meta/deep-profile.types.ts` — exports the `DeepProfile` type so
  both the route and the Smart Posts UI can type against it.
- `src/components/smart-posts/god-mode-button.tsx` — the Meta-source button
  variant. Shows account handle in the label.
- `src/components/smart-posts/why-this-works.tsx` — the "Why this works"
  panel inside the post preview. Consumes `godModeRationale` +
  `contributions`. Also used by the scrape path when `contributions` is
  populated, so both flows get it.

### Shared

- `src/lib/url-state.ts` — small hook `useHubState()` that reads/writes
  `?source=…&brand=…&ig=…` in the URL plus mirrors to localStorage under
  `hub.source`, `hub.brand`, `hub.ig`. Shared between Performance and
  Smart Posts.

## Files modified (not replaced)

- `src/app/(dashboard)/meta/page.tsx` — replace with a redirect to
  `/analytics?source=meta` that preserves incoming query params.
- `src/app/(dashboard)/analytics/page.tsx` — swap its body from
  `<AnalyticsDashboard />` to `<PerformancePage />`. Keep Suspense boundary.
- `src/app/(dashboard)/smart-posts/page.tsx` — add Suspense boundary for the
  new `useSearchParams` usage if not already present.
- `src/components/smart-posts-dashboard.tsx` — wire in the IG picker and
  source toggle, add god-mode generate path.
- `src/components/meta-hub.tsx` — no longer mounted as a page root. Either
  (a) export its inner sections (HeroCard, FormatStrip, Heatmap,
  CaptionPatterns, PostAutopsy, InstagramSection) so `performance-page.tsx`
  can assemble them, or (b) leave the component intact and render it inside
  the Performance page wrapped with the shared header. **(a) is cleaner** —
  we want the sections individually addressable.

## Shared URL / local state

Single source of truth: URL query params.

- `?source=meta|scrape` — defaults: `meta` if IG connected, else `scrape`.
- `?brand=<id>` — required when there is more than one brand. Persists.
- `?ig=<igUserId>` — only meaningful when `source=meta`. Ignored otherwise.

`useHubState()` returns `{ source, brand, ig, setSource, setBrand, setIg }`.
Setters push state + write `localStorage` under `hub.*` for cross-session
persistence. Hydration pattern: URL wins; localStorage fills blanks; sensible
defaults last.

## Deep Meta analytics: what we collect per IG account

`lib/meta/deep-profile.ts` returns:

```ts
interface DeepProfile {
  igUserId: string;
  handle: string;
  followerCount: number | null;
  sampleSize: number;              // number of posts analyzed
  medians: {
    reach: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    shares: number | null;
  };
  formatPerformance: Array<{
    format: 'REEL' | 'CAROUSEL' | 'IMAGE';
    count: number;
    medianReach: number;
    medianSaves: number;
    medianShares: number;
    liftVsOverall: number;         // e.g. 2.3 means 2.3x the overall median reach
  }>;
  hookPatterns: Array<{
    // Clustered first-line patterns from top-performing captions.
    // Clustering is naive — first 4 words normalized — good enough for a
    // prompt signal, not an ML pipeline.
    pattern: string;
    exampleCaptions: string[];
    avgReach: number;
    occurrences: number;
  }>;
  captionLengthSweetSpot: {
    shortMedian: number;           // 0-80 chars
    mediumMedian: number;          // 81-250 chars
    longMedian: number;            // 251+ chars
    winner: 'short' | 'medium' | 'long';
  };
  timing: {
    // 7x24 heatmap of median reach per post published in that slot.
    // Null where we have zero posts in the slot.
    heatmap: Array<Array<number | null>>;
    bestSlots: Array<{ day: string; hour: number; medianReach: number }>;
    // If Meta exposes audience-online hours, merge that in — it's the
    // strongest timing signal because it tells us *when followers are
    // around*, not just when we happened to post.
    audienceOnlineHours?: Array<{ day: string; hour: number; activeRatio: number }>;
  };
  topicSignals: {
    // Hashtag + first-noun extraction from top posts.
    winning: string[];             // top 10 by engagement-weighted frequency
    losing: string[];              // bottom 10
  };
  audience?: {
    // Only present when Meta returns it (requires ≥100 followers).
    topCountries: Array<{ code: string; share: number }>;
    topCities: Array<{ name: string; share: number }>;
    ageGenderMix: Array<{ bucket: string; share: number }>;
  };
}
```

All of this is derivable from endpoints we already call in
`/api/meta/instagram/insights`. We don't need new Meta scopes. The deep
profile is a **derived view** of what we already fetch, not a new fetch.

## The god-mode prompt

The `/api/smart-posts/god-mode` route hands the deep profile to Cerebras
with this shape (paraphrased):

> You are designing a single Instagram post to maximize engagement for a
> specific account. Here is the account's full performance profile: `{json}`.
>
> Produce JSON with fields: `contentType`, `hookPattern`, `captionLengthHint`,
> `suggestedPostTime {day, hour}`, `avoidTopics`, `topicHint`,
> `captionPatternHint {label}`, `rationale` (4-6 plain-English sentences
> explaining why each choice was made, citing specific numbers from the
> profile — e.g. "Carousels reach 2.3× your median" not "carousels work
> well"). **No em dashes. No arrows. No AI tell-tales.**

The validator from fix #2 (`sanitizeMetaOverrides`) gets reused on the LLM's
output — the LLM is just another untrusted boundary.

## Performance page: sections

One top bar (source toggle + brand selector + IG picker when `source=meta`)
then a stacked layout of sections. Each section is self-describing; when the
active source can't answer it, the section renders a tasteful CTA instead of
disappearing (so the *question* stays visible — that's the whole point of
organizing by question).

| Section               | Meta source                       | Scrape source                           |
|-----------------------|-----------------------------------|-----------------------------------------|
| Top post              | HeroCard from `meta-hub.tsx`      | Top of leaderboard from `analytics-dashboard.tsx` |
| Caption patterns      | `CaptionPatterns` AI miner        | Same miner — different post input set   |
| Timing                | Heatmap + audienceOnlineHours     | Heatmap only (no audience data)         |
| Format mix            | FormatStrip                       | Same data derived from scraped posts    |
| Post autopsy          | PostAutopsy                       | Same UI, scrape post as input           |
| Audience demographics | audience block                    | "Connect Meta to unlock" CTA            |
| Deep profile          | first-class section (see below)   | hidden                                  |

### Deep profile section (Performance page)

When `source=meta`, render the full `DeepProfile` (from
`lib/meta/deep-profile.ts`) as its own visible section on the Performance
page — not just as an internal input to god-mode. This gives users direct
access to the same numbers the LLM is reasoning over.

Layout (top to bottom):

- **Header strip:** handle, follower count, sample size, last-refreshed
  timestamp, manual refresh button.
- **Format performance table:** rows = format, columns = count, median
  reach, median saves, median shares, lift vs overall. Highlight the row
  with the highest lift.
- **Caption length sweet spot:** three-bar chart (short / medium / long)
  with median reach per bucket. Winner badge on the leader.
- **Top hook patterns:** card list. Each card: the normalized first-4-word
  pattern, avg reach, occurrences, one example caption excerpt.
- **Topic signals:** two columns — Winning, Losing — as tag chips.
- **Audience block:** top countries, top cities, age/gender mix. Only
  renders if Meta returned data (follower count ≥ 100).

The section reuses `lib/meta/deep-profile.ts` — same endpoint the god-mode
route hits — so god-mode's reasoning is transparently the same data the
user sees.

## Smart Posts page: new flow

Top bar (same `useHubState` inputs as Performance):

```
[ Brand: Affectly ▼ ]  [ IG Account: @affectly ▼ ]  [ Meta | Scrape ]
```

- IG picker only renders when `source=meta`.
- Source toggle only renders when Meta has ≥1 IG connected.
  Otherwise, scrape is the only path and the toggle is hidden.

**Single Generate button** (preserves the one-button feedback memory).
Label switches:

- `source=meta`: *"Generate god-mode post for @affectly"*
- `source=scrape`: *"Generate Perfect Post"*

Click behavior:

- `source=meta`: POST `/api/smart-posts/god-mode` with `{ brandId, igUserId }`.
- `source=scrape`: POST `/api/smart-posts/generate` (existing path, no change).

**Click-only, never auto-run.** Both paths fire only on explicit button
click. No LLM call on page mount. The Performance-page deep profile is
fetched on mount (cheap, no LLM), but god-mode generation waits for intent.

**Scheduling stays a separate action.** Neither path auto-schedules to
Buffer on generate. The `Schedule to Buffer` button in the post preview
remains the only way to push to Buffer. `scheduledAt` in the response is
a suggestion, not a commitment.

Rendered post preview gains a **"Why this works"** panel (new
`why-this-works.tsx`) between the caption and the action buttons:

- Scrape path: bullets derived from `contributions` strings, reworded into
  plain English ("Carousels average 2.3× your median reach, so we built one",
  etc. — see discussion preceding this plan).
- God-mode path: the `godModeRationale` sentences from the LLM, rendered as
  bullets, plus any numeric call-outs from the `deepProfile` block (e.g.
  *"Monday 19:00 is your best slot (medianReach 4.1× your overall median)"*).

Both paths produce the same visual component — the narrative is populated
from different sources.

## Rollout order

Each step is an independently committable increment. Numbered so subagent or
inline executor can pick them off one at a time.

### 1. Shared URL state

Create `src/lib/url-state.ts` with `useHubState()`. Unit-test it with a
small React Testing Library test that renders a child reading `source` and
asserts it updates when `setSource('meta')` is called. Commit.

### 2. Extract sections out of `meta-hub.tsx`

Move `HeroCard`, `FormatStrip`, `Heatmap`, `CaptionPatterns`, `PostAutopsy`,
`InstagramSection` into `src/components/performance/meta-sections/` — one
file each. No behavior change. Existing `meta-hub.tsx` re-exports them so
the `/meta` page keeps rendering during rollout. Commit after each move.

### 3. Build `PerformancePage`

Create `src/components/performance/performance-page.tsx`. Renders:
- `SourceToggle` (defaults to `meta` when IG connected, else `scrape`)
- `BrandSelector` (lift the one from `smart-posts-dashboard.tsx`)
- `IgAccountPicker` (when `source=meta`)
- Conditional section stack per the table above

Hardcoded no-data empty states for every section so we can ship the shell
before wiring data. Commit.

### 4. Wire Performance data paths

`source=scrape`: use existing `/api/insights?type=analytics&brandId=…` exactly
as `analytics-dashboard.tsx` does today.
`source=meta`: use existing `/api/meta/instagram/insights?igUserId=…` exactly
as `meta-hub.tsx` does today. Sections already know how to render these
shapes — we're just threading the source selection. Commit.

### 5. Redirect `/meta` → `/analytics?source=meta`

Replace `src/app/(dashboard)/meta/page.tsx` with a client redirect that
preserves all incoming query params (so `/meta?connected=1` lands at
`/analytics?source=meta&connected=1` and the OAuth success toast still
fires). Update the OAuth callback `src/app/api/meta/oauth/callback/route.ts`
if it hardcodes the return URL — aim it at the new path. Commit.

### 6. Swap analytics page body

`src/app/(dashboard)/analytics/page.tsx` renders `<PerformancePage />`
instead of `<AnalyticsDashboard />`. Keep the Suspense boundary. Leave
`analytics-dashboard.tsx` file in place; it's consumed by `PerformancePage`
via the scrape-source sections. Commit.

### 7. Build the deep-profile lib

Create `src/lib/meta/deep-profile.types.ts` with the `DeepProfile` interface
above. Create `src/lib/meta/deep-profile.ts` that:

- Accepts `igUserId`, reuses existing Meta fetch helpers.
- Computes `medians`, `formatPerformance`, `hookPatterns`,
  `captionLengthSweetSpot`, `timing.heatmap`, `timing.bestSlots`,
  `topicSignals` from the same posts + medians we fetch today.
- Optionally fetches audience demographics if Meta returns them; swallows
  errors (null) so a missing demographics response doesn't fail the scan.
- In-memory cache keyed by `(userId, igUserId)` with 15-min TTL.

Write Jest tests over a fixture JSON of 30 posts covering the reducers
(format medians, hook clustering, timing bucketing). No LLM call in these
tests. Commit.

### 7b. Render the Deep Profile section on Performance

Create `src/components/performance/deep-profile-section.tsx` that consumes
`DeepProfile` and renders the layout described in "Deep profile section"
above (header strip, format table, caption-length chart, hook patterns,
topic signals, audience block). Wire it into `PerformancePage` under the
`source=meta` branch. The section has its own fetch (same endpoint the
god-mode route uses internally) with a 15-min cache and a manual refresh
button. No LLM call here.

Write a Jest snapshot test against the fixture used in step 7. Commit.

### 8. Build `/api/smart-posts/god-mode`

POST route. Body: `{ brandId: string, igUserId: string }`.

```ts
// src/app/api/smart-posts/god-mode/route.ts (shape, not final code)
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const { brandId, igUserId } = await req.json();

  // verify brand ownership (existing pattern)
  // verify IG account belongs to the user (existing pattern)

  const profile = await buildDeepProfile({ userId, igUserId });
  if (profile.sampleSize < 5) {
    return NextResponse.json(
      { error: 'not_enough_data', message: 'We need at least 5 recent posts on this account before god-mode can design one. Post a few more and try again.' },
      { status: 422 }
    );
  }

  const llmSeed = await askGodMode(profile);   // Cerebras call, strict JSON
  const sanitized = sanitizeMetaOverrides(llmSeed.overrides);
  if (!sanitized) return llmParseErrorResponse(...);

  // Reuse existing generate pipeline
  const genRes = await generateFromSeed({
    userId,
    brandId,
    metaOverrides: sanitized,
    extraContributions: { 'god-mode': llmSeed.rationale },
  });
  return NextResponse.json({ ...genRes, godModeRationale: llmSeed.rationale, deepProfile: profile });
}
```

Write integration test with Cerebras mocked. Assert: `not_enough_data` when
sampleSize < 5; validator rejection path; happy path returns
`godModeRationale` string + `deepProfile`. Commit.

### 9. Refactor `/api/smart-posts/generate` for reuse

Extract the body of the current `generate/route.ts` POST handler into a
`generateFromSeed()` function in `src/lib/smart-posts/generate.ts`. The
route just calls it. This lets god-mode reuse the caption → image → render
→ scheduledAt pipeline without an internal HTTP fetch. Behavior unchanged
for existing callers. Commit.

### 10. Smart Posts UI — IG picker + source toggle

Modify `smart-posts-dashboard.tsx`:

- Read `useHubState()` at top.
- Render IG picker next to the brand selector when `source=meta`.
- Single Generate button; label + endpoint switch on source.
- On response, render the new `<WhyThisWorks />` panel.

Commit.

### 11. Why This Works panel + prose rewrite

Create `src/components/smart-posts/why-this-works.tsx`. Props:
`{ rationale?: string; contributions?: Record<string,string>; deepProfile?: DeepProfile }`.

Server-side: rewrite the contribution strings in `src/lib/smart-posts.ts`
(the `reasoning` and contribution assignments) so they are plain-English,
no dashes/arrows. This is the wording refactor from the prior conversation.

Commit.

### 12. E2E smoke

Playwright script:
1. Log in.
2. Visit `/analytics`. Assert both sections render with scrape source.
3. Toggle to Meta (Meta connected in fixture). Assert sections swap.
4. Navigate to `/smart-posts`. Assert IG picker visible; button says
   *"Generate god-mode post for @…"*.
5. Click generate; intercept Cerebras; assert Why This Works panel
   contains the rationale.
6. Toggle to Scrape; assert button changes to *"Generate Perfect Post"*;
   IG picker hides.
7. Visit `/meta?connected=1`; assert redirect to
   `/analytics?source=meta&connected=1` and success toast.

Commit + merge to develop + fast-forward main.

## Risks

- **Cerebras JSON drift in god-mode.** The prompt asks for structured output;
  sometimes it won't comply. Mitigation: reuse the `parseLlmJson` +
  `sanitizeMetaOverrides` pair from the preceding fix. Reject + 502 rather
  than silently degrade.
- **Deep profile compute cost on every open.** 15-min in-memory cache + a
  cheap "last-refreshed" timestamp in the UI with a manual refresh button.
- **Audience demographics require ≥100 followers** — Meta returns 400 for
  smaller accounts. Treat it as optional; the section just doesn't render.
- **Per-IG-account isolation** is the most likely place to leak data. Every
  fetch must include `igUserId` as a filter, and brand ownership must be
  verified before we trust `igUserId` (don't let user A query user B's IG).
  Add a test that hits god-mode with a foreign `igUserId` and expects 403.
- **URL + localStorage sync.** If we mirror state to localStorage, a user who
  logs out + in as someone else could see stale selection. Clear `hub.*`
  keys on logout.
- **OAuth callback path.** The Meta OAuth redirect currently lands on
  `/meta?connected=1`. Step 5 handles this via a redirect shim, but verify
  by running the connect flow end-to-end before closing the rollout.
- **`/competitors` stays separate.** If this feels inconsistent after the
  merge (Performance, Smart Posts, Competitors), we can roll it into a
  fourth top-level nav item later. Explicitly out of scope here.

## Success criteria

- `/meta` no longer exists as a page; bookmarks land at
  `/analytics?source=meta` with no visible difference to the user.
- `/analytics` is the single Performance page. Toggle source; sections swap
  cleanly.
- Smart Posts has ONE generate button. Its label and endpoint switch on
  source. IG account dropdown scopes all data.
- Meta god-mode path returns a post + rationale grounded in numeric signals
  from the deep profile.
- No demographic leak across IG accounts — proven by an integration test.
- Scrape path produces the same output it does today — proven by a snapshot
  test of the seed and `contributions` for a known fixture.
- No regressions in `/generate`, `/batch`, `/schedule`, `/home`,
  `/settings`, `/profile`, `/competitors`.

## Decisions locked in

- **God-mode is click-only.** No auto-run on page mount. Deep profile fetch
  on mount is fine (no LLM); generation waits for the button.
- **Deep profile is a visible section** on the Performance page, not just an
  internal input to god-mode. Users see the exact numbers the LLM reasons
  over.
- **Scheduling stays separate.** Neither generate path pushes to Buffer
  automatically. `Schedule to Buffer` button in the post preview remains
  the only path.
