# Daily Brand Brain — Design

**Status:** Approved (2026-05-09)
**Subsystem:** #1 of 5 in the broader autonomous-marketing roadmap.
**Out of scope (separate specs):** competitor post-level ingest (#2), deeper
generator integration (#3), caption format matcher (#4), autopilot
create+schedule (#5).

## Goal

Build a daily, per-brand "brain" that ingests Meta Instagram insights (and Meta
Ads when campaigns exist) plus competitor account-level data, derives
structured signals, and writes a short narrative brief. Smart Posts and Create
read the brain on every generation so the system continuously gets sharper
about what works for each brand without user input.

Inspired by the Larry Loop pattern (post performance → identify what's
working → feed into next generation, run continuously), adapted to a
multi-tenant SaaS on Vercel Hobby.

## Non-goals

- Replacing the existing `/analyze` pipeline (`run-analysis.ts`,
  `insights-engine.ts`). The brain composes those; it doesn't supersede them.
- Touching `/generate`, `/batch`, `/schedule`, `/home`, `/settings`, `/profile`
  beyond the minimum injection points specified below.
- Submitting the GoViraleza app for App Review. Brain v1 runs in Dev Mode
  against the user's connected accounts.
- Replacing Smart Posts' single composite Generate button (existing memory).
- Building any UI for autopilot. The brain produces the inputs autopilot will
  later consume; autopilot itself is a separate spec.

## Architecture

```
                          Brand 1   Brand 2   Brand N
                              \        |        /
GitHub Actions (daily)  ───►   per-brand orchestration
   03:00 UTC                           │
   .github/workflows/                  ▼
   brain-daily.yml          ┌─────────────────────────────┐
                            │ POST /api/brain/snapshot    │  pull raw data
                            │   ?brandId=X&source=ig|ads| │  (IG insights,
                            │           competitor_account│   Ads, competitor)
                            │ HMAC-auth                   │
                            └─────────────┬───────────────┘
                                          │ writes raw rows
                                          ▼
                            ┌─────────────────────────────┐
                            │ POST /api/brain/compute     │  derive signals
                            │   ?brandId=X                │  (top format,
                            │ HMAC-auth                   │   top slot, hooks)
                            └─────────────┬───────────────┘
                                          │ writes signals
                                          ▼
                            ┌─────────────────────────────┐
                            │ POST /api/brain/brief       │  Cerebras LLM
                            │   ?brandId=X                │  writes ~500-word
                            │ HMAC-auth                   │  brief
                            └─────────────┬───────────────┘
                                          │ writes brief
                                          ▼
                                 ┌────────────────┐
                                 │ brand_brain    │  DB
                                 │ brain_signals  │
                                 │ brain_snapshots│
                                 └────────┬───────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
        Smart Posts                    Create / Batch              /analyze
        (silent inject)               (silent inject)              (Brain panel)
```

Three small endpoints rather than one large one because Vercel Hobby caps
function execution at 10s. Each endpoint completes in well under that;
GitHub Actions orchestrates the full pipeline per brand and tolerates total
runtimes of minutes without timeout pressure.

## Database schema

Three new tables in `src/lib/db/schema.ts`. All keyed by `brand_id` so a
multi-brand user gets fully independent brains.

### `brain_snapshots`

Raw audit trail. One row per (brand, source, day). 90-day retention.

```
brain_snapshots {
  id              uuid pk
  brand_id        uuid fk → brands(id)
  source          enum('ig','ads','competitor_account')
  captured_at     timestamptz                 // start of day UTC
  payload         jsonb                       // raw API response, trimmed
  metrics_summary jsonb                       // { reach, views, likes, ... }
  created_at      timestamptz default now()
}
unique (brand_id, source, captured_at)
index (brand_id, captured_at desc)
```

### `brain_signals`

Derived structured signals. Latest-per-brand is what generators query;
history rows let us spot trends and feed the brief.

```
brain_signals {
  id                 uuid pk
  brand_id           uuid fk → brands(id)
  computed_at        timestamptz
  window_days        int                       // 7, 14, or 28
  top_format         enum('REEL','CAROUSEL','IMAGE') | null
  top_slot_dow       int | null                // 0-6, Sunday=0
  top_slot_hour      int | null                // 0-23 local
  hook_patterns      jsonb                     // [{ pattern, sample_size, median_reach }]
  cta_patterns       jsonb
  caption_shape      jsonb                     // { avg_lines, avg_paragraphs, emoji_density, hook_to_body_ratio }
  topic_clusters     jsonb                     // [{ topic, sample_size, median_engagement }]
  competitor_summary jsonb                     // account-level only for v1
  ad_summary         jsonb | null              // null until campaigns exist
  raw_kpis           jsonb                     // engagement deltas, follower growth
}
unique (brand_id, computed_at, window_days)
index (brand_id, computed_at desc)
```

Every signal field is nullable so a partial brain still writes — a brand with
IG connected but no competitor data still gets a row with `top_format` set
and `competitor_summary` null.

### `brand_brain`

One row per brand. The narrative brain. Always overwrites latest.

```
brand_brain {
  brand_id         uuid pk fk → brands(id)
  brief_md         text                        // ~500-word LLM brief
  brief_version    int                         // bumps on every successful regen
  signals_id       uuid fk → brain_signals(id) // which signals row produced this brief
  generated_at     timestamptz
  last_run_at      timestamptz                 // when cron last touched this brand (success OR fail)
  last_run_status  enum('ok','partial','failed','skipped_no_connection')
  last_run_error   text | null
  ingested_sources jsonb                       // { ig: 'ok', ads: 'skipped_no_campaigns', competitors: 'partial' }
}
```

## Endpoints

All under `src/app/api/brain/`. The first three are HMAC-authed and called
only by GitHub Actions. The last two use NextAuth session auth and back the
UI.

### `POST /api/brain/snapshot?brandId=<id>&source=<ig|ads|competitor_account>`

Auth: `x-brain-signature: <HMAC-SHA256 of body using BRAIN_CRON_SECRET>`
Body: `{ runId: <uuid>, day: <YYYY-MM-DD UTC> }`

Behaviour:
1. Look up brand → user → decrypted Meta or IG token via existing helpers.
2. Check `meta_insights_cache` for today's data; reuse if fresh.
3. Otherwise hit Graph API with conservative spacing/usage-header check.
4. Trim payload, compute `metrics_summary`, insert into `brain_snapshots`.
5. Return `{ status: 'ok'|'partial'|'skipped'|'failed', reason?, sample_size }`.

If the brand has no Meta/IG token, return `{ status: 'skipped',
reason: 'no_connection' }` with HTTP 200. The orchestrator continues to the
next brand without retry.

For `source=ads`: if no ad accounts exist or no campaigns ran in the window,
return `{ status: 'skipped', reason: 'no_campaigns' }`.

For `source=competitor_account`: account-level data only in v1. Per-post
competitor data is subsystem #2.

### `POST /api/brain/compute?brandId=<id>`

Auth: HMAC.

Behaviour:
1. Read last 28 days of `brain_snapshots` for this brand.
2. Compute structured signals via existing helpers from
   `src/lib/meta/ig-analytics.ts` (`computeFormatPerformance`,
   `computeHeatmap`, `computeBenchmarks`) and `src/lib/insights-engine.ts`.
3. Insert one row with `window_days=28` and a second with `window_days=7`.
4. Return `{ signalsId, top_format, top_slot, ... }`.

Pure SQL+TS over rows already written; never calls Meta. Idempotent — running
twice for the same day overwrites the latest signals row safely (unique
constraint includes `computed_at`, so a second call inserts a new row with a
later timestamp; the consumer always reads `order by computed_at desc limit 1`).

### `POST /api/brain/brief?brandId=<id>`

Auth: HMAC.

Behaviour:
1. Read latest `brain_signals` (28d + 7d) and previous `brand_brain` row.
2. Build a Cerebras prompt: signals + last brief + week-over-week deltas.
3. Cerebras returns ~500-word markdown brief in the fixed-header template
   (see "Brief template" below).
4. Validate the response contains every required header. If not, retry once.
   If second attempt fails, fall back to a deterministic brief built directly
   from signals (`brief_version=0`, ugly but functional).
5. UPSERT `brand_brain`: overwrite `brief_md`, bump `brief_version`, update
   `generated_at`, `last_run_at`, `last_run_status`, `ingested_sources`.
6. Return `{ briefVersion, charCount, tokensUsed }`.

If LLM call fails entirely → keep previous `brief_md`, set
`last_run_status='partial'`, set `last_run_error`. The brain is still useful;
generators read the previous brief.

### `POST /api/brain/trigger?brandId=<id>`

Auth: NextAuth session.

Enqueues an immediate single-brand run by calling
`/api/brain/snapshot` (×3 sources) → `/compute` → `/brief` server-side. Used
by the "Run now" button on the Brain panel.

### `GET /api/brain?brandId=<id>`

Auth: NextAuth session.

Returns the latest `brand_brain` row, latest `brain_signals` (28d and 7d),
and the last 7 days of run history (timestamp, status, sources). Drives the
`/analyze` Brain panel.

## Brief template (the contract)

Cerebras must produce markdown using these exact section headers in this
order. The contract lets Smart Posts/Create extract specific chunks via
deterministic parsing.

```markdown
## What's working
- {bullet 1, ≤25 words, with a metric}
- {bullet 2}
- {bullet 3}

## What's not working
- {bullet, with the contrast vs the working bullets}

## Formula for the next 7 days
- **Format:** {REEL|CAROUSEL|IMAGE}
- **Best slot:** {Day, Hour local}
- **Hook patterns:** {2-3 short phrases}
- **CTA pattern:** {phrase}
- **Caption shape:** {N lines, N paragraphs, emoji density: low|medium|high}

## Topics to lean into
- {topic 1}
- {topic 2}

## Topics to drop
- {topic 1, only if a clear loser exists; else "—"}

## Competitor watch
- {one-line summary of account-level moves; "—" if no signal}
```

Prompt rules enforced via system message:
- Use the exact section headers.
- Cite at least one number per bullet in "What's working" / "What's not working".
- Topics come from `topic_clusters`. Don't invent topics.
- Competitor watch is account-level only in v1. No post-level claims.
- If a section has no data, write "—" rather than fabricating.
- Total length ≤ 500 words.

## Rate-limit + ban-avoidance discipline

Conservative policy: prefer partial brains over getting GoViraleza flagged.

1. **Reuse `meta_insights_cache`** — existing 1h-TTL table. Brain ingest
   checks cache first.
2. **Honor `X-App-Usage`, `X-Business-Use-Case-Usage`, `X-Ad-Account-Usage`
   headers** — if any dimension ≥80%, return `partial` and resume tomorrow.
   Existing client wrapper in `src/lib/meta/client.ts` already parses these
   headers; brain just respects them.
3. **Per-call spacing** — 250ms between IG `/insights` calls within a single
   brand run.
4. **Per-brand jitter** — orchestrator waits a random 0-30s before each
   brand's run so multiple brands on the same Meta business don't fire at
   the same UTC second.
5. **Backoff with cap** — on 4xx/5xx, retry 3× with exponential backoff
   (1s, 4s, 16s + jitter). After 3 failures, mark `partial`, move on. Never
   retry indefinitely.
6. **Long-lived tokens only** — already the codebase pattern.
7. **Token expiry awareness** — if a brand's token has <7 days left or is
   revoked, log `skipped_no_connection`, surface a banner on `/analyze`
   ("reconnect Meta to resume brain ingest").

## GitHub Actions workflow

```yaml
# .github/workflows/brain-daily.yml
name: Daily Brain Run
on:
  schedule:
    - cron: '0 3 * * *'   # 03:00 UTC daily
  workflow_dispatch: {}    # manual trigger for testing

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run brain pipeline
        env:
          BRAIN_CRON_SECRET: ${{ secrets.BRAIN_CRON_SECRET }}
          BRAIN_BASE_URL: https://goviraleza.com
        run: node scripts/brain/run-daily.mjs
```

The actual orchestration logic lives in `scripts/brain/run-daily.mjs` so it
can be invoked locally with `node scripts/brain/run-daily.mjs` for debugging.
The YAML is just the trigger.

`run-daily.mjs` responsibilities:
1. List active brands via a cheap GET (or read directly from DB if a
   service-role connection is available; v1 uses an authed GET).
2. For each brand: jitter 0-30s, then call snapshot (3 sources sequentially)
   → compute → brief.
3. Sign each request body with HMAC-SHA256 using `BRAIN_CRON_SECRET`.
4. Continue on per-brand failure; emit a final summary.
5. Exit 0 unless a fatal error (auth secret missing, base URL unreachable);
   per-brand failures should not fail the workflow.

## Consumption — Smart Posts and Create

Touch points (minimal, by design):

- `src/lib/smart-posts/generate.ts` — read `brand_brain` at top of generate.
- `src/app/api/captions/route.ts` — read `brand_brain` before LLM call.
- `src/components/post-generator.tsx` — render brain badge.
- `src/components/smart-posts-dashboard.tsx` — render brain badge.

Pattern (pseudocode):

```ts
const brain = await readBrandBrain(brandId);
if (brain) {
  llmContext.system += `\n\nBRAND BRAIN (v${brain.briefVersion}, ${brain.generatedAt}):\n${brain.briefMd}`;
  defaultFormat ??= brain.formula.format;
  defaultSlot ??= brain.formula.bestSlot;
  captionShapeHint = brain.formula.captionShape;
}
```

The brain is **additive context, not a replacement**. If the user has
explicitly set a format or slot, the brain doesn't override — it only fills
defaults.

The shape consumers receive:

```ts
{
  briefMd: string,
  formula: {
    format: 'REEL'|'CAROUSEL'|'IMAGE',
    bestSlot: { dow: number, hour: number },
    captionShape: { lines: number, paragraphs: number, emojiDensity: 'low'|'medium'|'high' },
  },
  briefVersion: number,
  generatedAt: ISOString,
}
```

`formula` is built by parsing the brief's "Formula" section deterministically
(same parser used in `brief` endpoint validation).

## UI — Brain panel on `/analyze`

A new section above the existing learnings cart:

```
┌─────────────────────────────────────────────────────────────┐
│ 🧠 Brand Brain · v3 · updated 2h ago             [Run now] │
├─────────────────────────────────────────────────────────────┤
│ Sources: ✓ IG  · — Ads (no campaigns)  · ⚠ Competitors    │
│                                                             │
│ ## What's working                                           │
│ • Reels at 7pm Tuesday hit 2.4× your median reach          │
│ • Founder-voice hooks beat feature-list hooks 3:1          │
│ • Carousel saves up 40% week-over-week                     │
│                                                             │
│ ## Formula for the next 7 days                              │
│ Format: REEL · Best slot: Tue 7pm                          │
│ Hook patterns: question opener · stat-shock · POV          │
│ Caption shape: 12 lines, 4 paragraphs, low emoji           │
│ ...                                                         │
│                                                             │
│ [View full brief]  [Run history (last 7 days)]             │
└─────────────────────────────────────────────────────────────┘
```

- "Run now" → `/api/brain/trigger?brandId=X`. Useful when a user just
  connected a new IG account.
- "Run history" modal → last 7 daily runs with timestamp, status, source
  breakdown, and error if any.
- Sources row shows ✓ / — / ⚠ per (ig, ads, competitor_account).

The badge above Smart Posts' Generate button is `Brain v{briefVersion} ·
{relativeTime}`. Click → modal with the full brief markdown rendered.

## Tests

Vitest:

```
src/lib/brain/__tests__/
  signature.test.ts         HMAC verify with fixed inputs
  compute-signals.test.ts   given canned snapshots, signals output is deterministic
  brief-template.test.ts    fixed-header contract: parser extracts every section
  cache-respect.test.ts     second snapshot call hits meta_insights_cache, no API call
  rate-limit.test.ts        X-App-Usage ≥80 → returns 'partial' without retry
  consume-merge.test.ts     brain merges into Smart Posts context without overriding user values
```

Playwright (one happy path):
- Connect IG → trigger Run now → Brain panel populates → generate a Smart
  Post → confirm prompt body contains "BRAND BRAIN" header.

No tests against live Meta APIs — all Graph responses fixtured under
`src/lib/brain/__tests__/fixtures/`.

## Rollout order

1. **Schema migration** — `drizzle-kit push` adds the three tables. Zero
   existing-row impact.
2. **Env vars** — set `BRAIN_CRON_SECRET` in Vercel and GitHub Secrets
   (single shared secret, no rotation in v1).
3. **Endpoints + script** — ship `/api/brain/{snapshot,compute,brief,trigger}`
   and `scripts/brain/run-daily.mjs`. Manual `workflow_dispatch` first to
   verify against one brand.
4. **GitHub Actions schedule** — enable the daily cron only after one manual
   run succeeds.
5. **UI panel on /analyze** — ship behind `BRAIN_UI_ENABLED` feature flag.
   Flip on once cron has 2-3 days of clean runs.
6. **Consumption (Smart Posts + Create)** — ship behind the same flag. Badge
   visually confirms brain context is live.
7. **Remove flag** after one week of clean operation.

## Failure modes

| Failure | Behaviour |
|---|---|
| Brand has no Meta/IG token | `last_run_status='skipped_no_connection'`. Banner on `/analyze`. |
| Token expired (<7 days remaining) | Same as above; banner says "reconnect Meta". |
| Meta API rate limit (≥80% usage) | `last_run_status='partial'`. Resume tomorrow. |
| Meta API 4xx/5xx | Retry 3× with backoff. If all fail, mark source partial. |
| LLM call fails | Keep previous brief, mark partial, log error. |
| LLM returns malformed brief | Retry once. If still bad, deterministic fallback brief, `brief_version=0`. |
| First-ever run, no previous brief | Deterministic fallback brief from raw signals. |
| GitHub Actions workflow fails | Cron retries next day. No paging. |
| Drizzle migration fails | Block deploy. No partial schema. |

## Environment variables

Added in v1:
- `BRAIN_CRON_SECRET` — HMAC shared secret, set in Vercel env + GitHub Secrets.

Reused (already exist):
- `META_APP_ID`, `META_APP_SECRET` (or `FB_APP_ID`/`FB_APP_SECRET`)
- `META_IG_APP_ID`, `META_IG_APP_SECRET`
- `ENCRYPTION_KEY`
- Cerebras credentials (already in `src/lib/cerebras.ts`)

## Future work (separate specs)

- Subsystem #2: fix competitor post-level scrape, extend ingest to
  per-competitor signals, enrich `competitor_summary`.
- Subsystem #3: deeper Smart Posts/Create integration — grading drafts
  against the brain, "this draft scores 6/10 vs your formula."
- Subsystem #4: caption format matcher — analyse competitor caption shape
  and bake into output formatting.
- Subsystem #5: autopilot create+schedule — consumes `formula.bestSlot`,
  `formula.format`, and the brief to generate posts and drop into Buffer
  with no user input.
- v2: MCP server exposing `brand_brain` and `brain_signals` so Claude can
  pull live brain data interactively. Reference: `oliverames/meta-mcp-server`
  for schema vocabulary.
- App Review submission once Brain v1 has been running cleanly for several
  weeks and the GoViraleza app is ready for Standard → Advanced Access.

## References

- LarryBrain skill marketplace: <https://github.com/OllieWazza/LarryBrain-Skill>
- "How to Connect Meta Ads to Claude Code (Without Getting Banned)":
  <https://www.youtube.com/watch?v=YNiu_zzDDAc>
- Existing Meta integration: `docs/META-PUBLISHING-PLAN.md`,
  `docs/META-SETUP.md`.
- Existing analyze pipeline: `src/lib/analyze/run-analysis.ts`,
  `src/lib/insights-engine.ts`.
- Existing Meta clients: `src/lib/meta/client.ts`,
  `src/lib/meta/instagram-client.ts`, `src/lib/meta/ig-analytics.ts`.
