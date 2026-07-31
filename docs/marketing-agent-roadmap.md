# Marketing-Agent Roadmap

**Written:** 2026-07-30
**Source:** *"How I use Claude Code + MCPs to run my marketing"* — Cody Schneider on The Startup Ideas Podcast (28 Jul 2026, 37 min)
**Purpose:** Compare his described system against what social-app actually does today, then a staged plan to close the gap.

---

## 1. What he actually described

He is deliberate about rejecting "an n8n workflow is an agent". His definition has three parts, all three required:

1. **Unified data clarity** — one place holding the whole pipeline, so the agent sees every source *in context with* every other source.
2. **Autonomous decisions on a cadence** — a thinking loop, not a linear trigger chain.
3. **Cloud-hosted** — "an agent is just code under the hood… a decision tree with a live data stream and an LLM thinking, optimising for an outcome."

### His stack

| Layer | Tool | Notes |
|---|---|---|
| Data pipeline | **Airbyte** (self-hosted) | pre-built connectors |
| Warehouse | **ClickHouse** (self-hosted) | |
| Sources unified | Facebook Ads, Google Analytics, PostHog, HubSpot, **Stripe** | Stripe is the point — ties ad → revenue |
| Agent hosting | Railway / Heroku / any cloud | explicitly *not* a Mac Mini |
| Pain-point research | Perplexity → scrape **Reddit** → "rank stack by most referenced" → top 3 | Reddit because "those are real people just complaining" |
| Statics | **Kai AI** (model aggregator), **Google Nano Banana** | seeded with a competitor's existing ad as example |
| Video / UGC | **HeyGen**; experimenting with **Seedance** | Seedance caps ~9s, stitching is the hard part |
| Creative QA | **vision model over the outputs** | "does this match brand style guides" — fonts, colours, text readability |
| Publishing | **Facebook Marketing API** | |
| Targeting | none — post-**Andromeda** | creative + landing page decide who sees it |

### His learning loop

- **2 ad sets/day × 5 ads = 10 ads/day**, auto-uploaded.
- Run **2–3 days** for initial signal.
- Kill worst performers; **winners live on** and enter a **winner's pool** competing for budget.
- Critically: he stores **the JSON prompts sent to Nano Banana and the scripts sent to HeyGen** in a database, and has the agent analyse *those* — learning over creative *inputs*, not just outputs.

### The entropy problem

His most original point, and the one Greg says nobody talks about: **the agent gets stuck thinking the same way.** Three fixes:

1. **Facebook Ads Library** — pull competitor ads to "put new DNA into the system".
2. **YouTube + podcast transcripts** — mine insights, run ads off them.
3. **Viral-trend APIs** (he names *viralload*) — "most viral posts in the beauty category last week" → extract formats → feed creative.

### Operating principles

- Marketing is **continuous, not campaigns**. "People think I start a thing and stop a thing — that is not how this works anymore."
- **Don't impose your idea on the market.** "We're not Don Draper." Test 1000 creatives; signal in 48 hours.
- Same ad, **reposition 10–20 times** — people quit after 3.
- **Conversational analytics** over business data: *"we're having trouble hitting payroll, what's wrong?" → "your accounts receivable are off."*
- API hygiene: use the Facebook API **for writes** (publish/pause/promote). He claims bulk-pulling millions of rows is what actually gets accounts banned, not the agent itself.

### Where I'd push back

Two things not to cargo-cult:

- **"Set this whole system up in the next hour and a half"** is podcast hyperbole. The data layer alone is weeks.
- **Airbyte + ClickHouse self-hosted is wrong-sized for us.** That stack exists to unify dozens of sources at volume. We have two brands and a handful of sources already sitting in one Neon Postgres. Adding a warehouse now buys operational burden, not insight. Revisit when we genuinely outgrow Postgres — his *principle* (one queryable place, joined to revenue) matters; his *tooling* doesn't.
- His ban explanation is plausible and worth respecting as a guardrail, but treat it as one practitioner's read, not documented Meta policy.

---

## 2. Where we actually stand

### What we already have that matches — more than you'd think

| His requirement | Our equivalent | Status |
|---|---|---|
| Autonomous cadence + thinking loop | `brain-daily.yml` → snapshot → compute → brief → autopilot run | **Working** (12/12 days) |
| Learning from outcomes | angle→reach attribution, `postAnalytics` caption-match, LRU tie-break | **Working** |
| Entropy control | `creative-angles.ts` LRU rotation, text no-reuse, image no-reuse (URL norm + pHash Hamming ≤6) | **Working** — genuinely ahead of most |
| Creative quality gate | `runGrade`, `shouldHoldForQuality`, best-of-N via `keepBetterDraft` | **Working** |
| Data-driven timing | `brain.formula.bestSlot` → `nextPostSlot` | **Working** |
| Publishing | Buffer → Instagram, with status reconciliation + channel-health guard | **Working** (as of today) |
| Competitor signal | `scrapedAccounts` / `scrapedPosts`, `/api/competitors/sync` | **Working** |

We are not behind on the *loop*. We're behind on *what the loop optimises for* and *how much creative it produces*.

### The real gaps

1. **No revenue attribution — at all.** We optimise reach and engagement. He optimises dollars. There is no Stripe data in our system, no UTM→signup→subscription chain, no way to answer "which post or ad produced a paying customer". This is his requirement #1 and our single biggest hole.
2. **Ad performance data isn't even flowing.** `/api/ads/sync-insights` returns **405** in production (found today — middleware matcher regression). So the ads half of the loop is blind.
3. **The ads rail is built, but it's blind to revenue.** Corrected 2026-07-31 — the integration is substantial: `generate` → `publish` → `sync-insights` → `advice`, plus `upload-image`/`upload-video`, `ad-templates`, `geo-overlap`, `competitor-summary`. The hard part (publishing into Meta) is done. What's missing is the *signal*:
   - `insights-store.ts` captures only `spend, impressions, reach, clicks, ctr, cpc` — **no `actions`, no conversions, no purchase value**.
   - **No Meta Pixel and no Conversions API anywhere in `src`.**
   - Objectives are `TRAFFIC | ENGAGEMENT | LEADS | APP` — **no `CONVERSIONS`**.

   This is the crux for a revenue machine. Post-Andromeda, Meta optimises for whatever event you feed back. Feeding it clicks makes it find cheap clickers, not customers. Sending purchase events makes Meta's own algorithm optimise for revenue — which does more than any kill/promote loop we would write. **The most valuable agent here is Meta's, and it is currently being fed the wrong signal.**
   (Still true: nothing generates 10 ads/day, auto-kills losers, or runs a winner's pool — but that's a smaller lift than it looked, see M4.)
4. **Creative is stock photos + text overlay.** god-mode composites 1080×1080 with a hook overlay and logo from Pixabay/Unsplash/Pexels. He generates purpose-built statics. This is a hard ceiling on quality, and it's the root of our recurring off-topic-image and image-reuse bugs — we're *selecting* from a pool instead of *creating* to a brief.
5. **No vision QA.** `runGrade` judges text only. Nothing checks the rendered image. Notably, a vision gate would have caught both the empty-hook libvips crash and the off-topic brand-domain photos.
6. **No external DNA.** Our anti-repetition is all *internal* (rotate angles, avoid used images). Nothing injects outside novelty: no Ads Library, no transcript mining, no viral-trend feed.
7. **Single channel, low volume.** Instagram only, ~1 post every other day per brand. No video, no Google Ads, no LinkedIn/X, no email, no SEO.
8. **No conversational analytics.** Every question I answered today needed a bespoke `scripts/diag-*.ts`. That's the gap he'd point at hardest.

---

## 3. The plan

Sequenced so each milestone is *usable on its own* and each one makes the next cheaper. Every milestone has a checkpoint you can verify — a query to run or a number to look at — not "it feels done".

### Phase 0 — Repair the plumbing (blocking, ~half a day)

Nothing downstream is trustworthy until the data actually flows.

- [x] Middleware matcher fix for `refresh-tokens`, `sync-insights`, `channel-health` + filesystem-derived regression test (`src/__tests__/middleware-cron-routes.test.ts`)
- [ ] **Deploy it** — the fix is in the working tree, not shipped
- [ ] Investigate `snapshot.ads: 200 failed` (every brand, every run — separate from the 405)
- [ ] Decide scheduler (see Appendix A)

**Checkpoint:** tomorrow's 05:35 log reads `ig-token refresh: status=200` and `sync-insights: status=200 synced=<non-zero>`. IG tokens expire **2026-08-19** — this must land well before then.

### Milestone 1 — Close the conversion loop — **DEFERRED, see volume gate**

> **⛔ Deferred 2026-07-31 on evidence.** Queried the live PaceBrain Supabase (`obsjqaigxyehwdpjtxcc`):
>
> ```
> total users (all time)   23
> signups last 90 days      7      (~2.3 / month)
> signups last 30 days      3
> ```
>
> (27 subscription rows against 23 users ⇒ those "active" subs are the manually-granted comps, not organic conversions.)
>
> **This invalidates the premise of M1 as originally written.** Meta needs ~**50 conversions per ad set per week** to exit the learning phase. At ~0.5/week we are two orders of magnitude short, so a `CONVERSIONS` objective would never leave learning and would perform **worse** than the TRAFFIC objective already in use — it would be optimising on noise. A pixel and CAPI would add nothing, because there is no signal to feed.
>
> The honest read: **this is a volume problem, not an attribution problem.** At 7 signups per quarter, `gv_cid` click logs plus a manual timestamp match is a five-minute job. Building an attribution spine to measure 2 events/month costs more than reading the rows by hand.
>
> **Do not touch pacebrain.app or affectly.app.** No pixel, no CAPI, no postback endpoint, no `CONVERSIONS` objective.
>
> **Volume gate — revisit M1 when *either* is true:**
> - sustained **≥ 50 signups/week** on a marketed product (Meta's learning-phase threshold), **or**
> - **≥ 20 signups/month** attributable to paid, where guessing which ad caused them is actually costing money.
>
> Until then the correct objective is **TRAFFIC**, and the correct question is "which creative earns clicks", which `gv_cid` + existing `ctr`/`cpc` already answers.
>
> **Not verified:** affectly.app is not in this Supabase account, so its volume is unknown — check before assuming it differs.

### Milestone 1 (original, for when the gate opens) — Close the conversion loop (~1 week)

**Revised 2026-07-31 — no Stripe.** This platform takes no payments, so there is nothing to ingest here. The money is earned in the **products being marketed** (pacebrain.app, affectly.app), which hold their own subscriptions. So M1 is not "add billing data to social-app" — it is **cross-property attribution**: carry an id across to the product, and get an outcome back.

That reframes a "conversion" as *an event in the marketed product* — a signup, an activation, a trial start, or a subscription — not a Stripe charge in this app.

**M1a — Carry the id across ✅ DONE**
- `src/lib/ads/tracked-url.ts` — `buildTrackedUrl` writes `utm_*` (for whatever analytics the destination already runs) plus **`gv_cid`**, our own click id that survives sites stripping utm params. App Store URLs pass through untouched (Meta validates them against `promoted_object`; extra params break the match — error 1487810).
- Wired into `/api/ads/publish`: a `clickId` is minted before the creative and persisted on the ad row.
- `meta_ads.click_id` (nullable uuid) + index, applied to Neon.

**M1b — Get the outcome back** — pick one (see *Open question* below):
- **Option A — Meta Pixel on the destination site.** Cheapest by far. A pixel on pacebrain.app firing a signup event means Meta reports conversions per ad, and `ad-insights.ts` **already requests `actions`** and stores `results`/`resultType` — so most of the capture exists. Add `action_values` to `FIELDS`, and a `CONVERSIONS` objective alongside TRAFFIC/ENGAGEMENT/LEADS/APP. Downside: you only ever see what Meta chooses to tell you about itself, and nothing for organic.
- **Option B — Conversion postback.** The marketed product POSTs to a new `/api/revenue/conversion` when a visitor carrying `gv_cid` converts. First-party truth, works for organic and paid alike, independent of Meta. Downside: requires a change in each marketed product.

Not mutually exclusive — B is the real spine, A is a cheap head start.

This also sidesteps a known blocker: the APP objective is unusable while the business portfolio can't claim apps, but TRAFFIC→pacebrain.app **with a pixel and CONVERSIONS** gets conversion optimisation without needing the app claim at all.

**Checkpoint:** answer in SQL *"which ad produced signups in the last 30 days, and at what cost per signup?"* — if it needs a hand-written script, not done.

> **⚠ Open question blocking M1b:** can we add code to **pacebrain.app** and **affectly.app**? Everything downstream depends on it. If yes → Option B (and a pixel too). If the sites can't be touched → attribution is limited to Meta's own reporting, organic stays unattributable, and the honest answer is that this platform cannot become a revenue machine for those brands until it can.
>
> **Organic caveat worth stating plainly:** Instagram organic posts carry no clickable link, so `gv_cid` cannot ride along on them. Organic attribution can only ever be link-in-bio, a per-brand landing page, or a discount/referral code — it is structurally harder than paid, and no amount of engineering here changes that.

### Milestone 2 — Creative as data (~3 days)

His sharpest technical idea: learn over the *inputs*.

- Persist every generation's **prompt, hook, angle, overlay style, image source and model** as a first-class row (extends `posts`; `angle`/`imageHash` already there).
- Join to outcomes from Milestone 1 + `postAnalytics`.
- Expose "what creative attributes correlate with reach/revenue" to the brain's brief.

**Checkpoint:** `SELECT` top 10 hook patterns by reach-per-impression, and the brief demonstrably cites them in the next generation.

### Milestone 3 — Generated creative + vision QA (~1 week)

- Swap stock-photo selection for **generated statics** against a brand brief (keep stock as fallback).
- **Vision gate** before publish: on-brand colours/fonts, text legible, subject matches the caption topic. Reject → regenerate, don't ship.
- Retire the brand-domain scoring hack once generation makes off-topic images impossible by construction.

**Checkpoint:** 20 consecutive autopilot posts with zero off-topic images, zero empty-hook renders, and a recorded vision-gate pass rate.

### Milestone 4 — Agentic ads (~1 week, needs M1)

Revised down from 2 weeks: `generate` and `publish` already exist, so this is an orchestration layer over built rails, not a new integration. Much of the optimisation is also handed to Meta once M1b feeds it purchase events.

Do **not** start before M1 — otherwise the agent optimises for clicks and burns money.

- Generate **2 ad sets × 5 ads/day** from researched pain points.
- 2–3 day signal window → auto-pause losers → winners into a **budget-competing pool**.
- Hard guardrails: daily spend cap, max concurrent ads, kill-switch, write-only API usage.
- Human-in-the-loop for the first 2 weeks, then hand over.

**Checkpoint:** one full week unattended, spend within cap, and CAC from Milestone 1 flat-or-better than manual.

### Milestone 5 — Entropy injection (~1 week)

- **Meta Ads Library** ingestion for competitor creative.
- **Transcript mining** — YouTube/podcast insights per brand niche (this document is an instance of the technique).
- **Viral-trend feed** for format discovery.
- A **novelty metric** so we can prove creative isn't converging.

**Checkpoint:** novelty metric trends flat-or-up over 30 days while engagement holds — i.e. variety without quality loss.

### Milestone 6 — Conversational analytics (cross-cutting, pull earlier if it hurts)

- A read-only, schema-aware query surface over the unified data.
- Replaces the `scripts/diag-*.ts` sprawl.

**Checkpoint:** answer three real questions ("why did pacebrain reach drop last week?", "best angle for affectly in July?", "CAC by channel?") with no new script written.

### Milestone 7 — Channel expansion (after 1–4 are stable)

Ordered by our actual leverage: **email/newsletter** → **SEO agent** → **LinkedIn/X** → **TikTok/Reels video**. Deliberately last: adding channels before the revenue loop closes multiplies unmeasurable work.

---

## 3b. Isolation strategy — shipping revenue features without destabilising the platform

**Constraint (2026-07-31):** the platform must stay operational throughout. Autopilot posts every other day per brand; nothing below may put that at risk.

The hot path that must not change:

```
brain-daily → snapshot → compute → brief → autopilot/run → god-mode → Buffer → Instagram
```

Six rules, all of which reuse patterns already proven in this repo.

### 1. Additive schema only

New **tables** (`stripe_customers`, `stripe_subscriptions`, `attribution_events`, `ad_conversions`), and only **nullable** columns on existing tables. Never alter a type, never drop, never add `NOT NULL` without a default. Apply with `ADD COLUMN IF NOT EXISTS` (see `scripts/add-channel-health-columns.ts`) rather than `drizzle-kit push`, so unrelated drift is left alone. A rollback is then just "stop reading the column".

### 2. New routes — never edit the hot path

Revenue work lands in **new** endpoints: `/api/stripe/webhook`, `/api/revenue/*`, `/api/meta/capi`. Zero edits to `autopilot/run`, `brain/compute`, or `brief`. If a revenue feature needs something from the hot path, it *reads* from the DB afterwards rather than being spliced in.

### 3. Three-stage wiring — data before decisions

The rule that makes M1 zero-risk:

| Stage | What happens | Behaviour change |
|---|---|---|
| 1. Ingest | Stripe + attribution rows land in Neon. Nothing reads them. | **None** |
| 2. Surface | Dashboards/queries read them. | **None** — read-only |
| 3. Decide | Revenue signal feeds the brief and creative selection. | Behind a flag, off by default |

Stages 1 and 2 can ship to production immediately and cannot affect posting, because nothing in the hot path reads them. Only stage 3 changes what the system does — and it's flagged.

### 4. The house flag pattern for anything touching generation

Copy `src/lib/smart-posts/generate.ts:216-226` exactly: env flag → dynamic import → `try/catch` degrading to the previous behaviour. Suggested flags: `REVENUE_SIGNAL_ENABLED`, `ADS_AGENT_ENABLED`. Both default off. A revenue-lookup failure must never block a post, in the same way a brain failure never blocks a caption today.

### 5. Separate cron jobs, separate alerts

New sweeps (Stripe pull, CAPI replay) get their **own** cron-job.org entries, not extra steps inside `run-daily.mjs`. Two reasons: a Stripe outage then cannot delay or fail the brain run, and each job gets its own failure notification. Note `run-daily.mjs` catches and logs step failures — good isolation, but it is exactly why the `405` hid for 40 days. Separate jobs fix both halves.

### 6. The ads agent may only touch its own ads

Hard requirement for M4: tag every agent-created ad at creation (name prefix or a `source` column on `meta_ads`) and scope every pause/promote call to that tag. The agent must be **incapable** of pausing an ad you built by hand in `/ads`. Plus: campaign-level daily spend cap, max concurrent ads, and a kill switch. Add the `CONVERSIONS` objective **alongside** TRAFFIC/ENGAGEMENT/LEADS/APP — never repoint an existing objective.

### ⚠ Known clash risk — the Stripe webhook will 405

A Stripe webhook is cookieless, so it **must** be added to the `src/middleware.ts` matcher exclusions or NextAuth will redirect it to `/login` and Stripe will see a `405` — the identical failure that silently killed the IG token refresh for 40 days, except here it would silently drop payment events.

`src/__tests__/middleware-cron-routes.test.ts` will **not** catch this: it derives routes by grepping for `verifyBrainSignature`, and a Stripe webhook verifies a Stripe signature instead. **Extend that test's detection to cover Stripe/webhook routes at the same time as adding the endpoint.**

---

## 4. Honest strategic read

**Revised 2026-07-31 after seeing the numbers.** His system is a **paid-acquisition revenue machine** running at volume. Ours markets products with **23 total users and ~2 signups/month**. Copying his architecture wholesale would be a category error, and copying his *sequencing* would be worse — he optimises for revenue because he has enough conversions to optimise on. We do not.

### Revised order of work

The original plan put M1 (revenue loop) first. On the evidence that is wrong. Corrected sequence:

1. **Phase 0 — deploy the plumbing fixes.** Unchanged, still blocking, IG tokens die 2026-08-19.
2. **M2 — creative as data.** Cheap, we already store most of it, and it works at *any* volume because it learns from reach/CTR, not conversions.
3. **M3 — generated creative + vision QA.** Raises the quality ceiling of what goes to market. At 23 users the constraint is that too few people see something worth acting on.
4. **M4 — agentic ads on the TRAFFIC objective.** More creative shots on goal is exactly right here; conversion optimisation is not. Volume of *tests*, not volume of spend.
5. **M5 — entropy injection.** Widens the range of ideas being tested.
6. **M1 — conversion loop.** Only once the volume gate opens.

The through-line: at this stage every milestone should increase **the number and variety of creative attempts reaching an audience**, because we do not yet know what works. Measurement infrastructure answers "which of these winners is best" — a question we are not yet in a position to ask.

### The three things worth taking from the podcast, re-ranked for our stage

1. **Learn over creative inputs, not just outputs.** (M2) — works at any volume.
2. **Inject external DNA on a cadence.** (M5) — we solved repetition mechanically; he solves it by importing novelty. Ours prevents duplicates, his creates range. At 23 users, range is what we are short of.
3. **Optimise for revenue, not reach.** (M1) — *correct, but premature.* Right idea, wrong stage.

And the one thing we should keep that he'd envy: our **reliability discipline**. Status reconciliation, pHash dedup, channel-health guards, quality gates. His post glosses over the fact that these systems fail silently — as ours did for 40 days on a `405` and 5 days on a dead Buffer channel. Volume without observability just produces failure faster.

---

## Appendix A — Scheduler decision (open)

Investigated 2026-07-30. GitHub Actions is currently **healthy** (12/12 daily successes); the outages were routing and credential bugs, not scheduling.

**cron-job.org free tier caps execution timeout at 30 seconds** (verified in the job editor: *"The maximum timeout is 30 seconds"*). Measured durations:

| Job | Duration | Fits 30s? |
|---|---|---|
| `channel-health` | ~1s | yes |
| `refresh-tokens` | few s | yes |
| `snapshot.ig` | **22.9s** | marginal |
| full per-brand sequence | **32.7s** | no |
| `autopilot/run` (god-mode) | **90–180s** | never |

Also: a cron-job.org timeout marks the job failed *and* Vercel cancels functions on client disconnect — an autopilot run could die mid-generation, leaving an uploaded image with no post row.

**This is not hypothetical — the same account already shows it in production on another project:**

```
PaceBrain Daily Tasks    Failed (timeout) (30 s)   ← every night at 01:00
PaceBrain Adapt Plans    Successful (23.65 s)      ← one slow day from failing
PaceBrain Garmin Sync    Successful (19.75 s)
```

**Second discovery: cron-job.org does not follow redirects** ("cron-job.org does not automatically follow redirections" — shown on a test run). This is precisely why it is a better scheduler for us than the current setup: `run-daily.mjs` uses Node `fetch`, which *does* follow, so the apex→www→`/login` chain collapsed into a bland `405` that the script swallowed and GitHub reported green. cron-job.org surfaces the `307` as an outright failure and emails about it. Use `https://www.` URLs directly, and leave "treat 3xx as success" **unchecked** — a 3xx is the login-redirect symptom and must count as a failure.

**Options:**

- **A. Hybrid (recommended).** cron-job.org runs the three short sweeps (`refresh-tokens`, `sync-insights`, `channel-health`); GitHub Actions keeps the long per-brand orchestration. Works on the free tier today, and cron-job.org's **failure notification** would have caught the `405` on day one — the actual bug.
- **B. Sustaining Membership.** Paid tier raises the timeout; makes full migration viable. Cheapest route to "all in one place".
- **C. Async endpoints.** Accept-and-enqueue (Vercel Queues) so every endpoint returns in <1s. Correct long-term architecture, meaningful work.

### Provisioned 2026-07-31 (all three **disabled**, pending deploy)

| # | Job | URL (`www`, not apex) | Schedule (UTC) |
|---|---|---|---|
| 1 | IG token refresh | `/api/meta/instagram/refresh-tokens` | `30 2 * * *` |
| 2 | Buffer channel health | `/api/autopilot/channel-health` | `35 2 * * *` |
| 3 | Ads sync-insights | `/api/ads/sync-insights` | `40 2 * * *` |

Each: `POST`, body `{}`, headers `Content-Type: application/json` + `x-brain-signature: <sign("{}")>`, timezone UTC, timeout 30s, **notify on failure**, save responses, 3xx *not* treated as success.

They are **disabled on purpose** — a test run against job 1 returned `307`, confirming the middleware fix is not yet deployed. Enable all three only after the deploy, then check each response body once.

Also note the GitHub cron is set to `0 3 * * *` but actually fires around **05:35 UTC** — GitHub delays scheduled workflows under load. cron-job.org fires on time, which is a secondary reason to prefer it for the token refresh.

Other prep: API key `social-app brain cron` created (**password-gated to reveal** — needed for REST-API provisioning; the three jobs above were made through the UI instead). The HMAC signature covers the **request body only**, so `sign("{}")` is one constant header that authenticates a POST to any of these endpoints, including with `?brandId=`. `/api/brain/snapshot` now defaults `runId`/`day` server-side so a static `{}` body works. **The signature is a static, non-expiring credential with no replay protection — rotate `BRAIN_CRON_SECRET` if it ever leaks, and re-derive the header value afterwards.**
