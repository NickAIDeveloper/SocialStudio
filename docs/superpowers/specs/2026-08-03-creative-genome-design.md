# Creative Genome — closing the ads learning loop

**Written:** 2026-08-03
**Status:** Design, awaiting approval
**Scope:** Spec 1 of 2. Spec 2 (external DNA injection) is deliberately deferred — see §9.
**Related:** `docs/marketing-agent-roadmap.md` (this is M2 + the internal half of M5)

---

## 1. Executive summary

Ads today are written with no knowledge of how any previous ad performed. `generateAdCopy`
takes brand, objective, brief, pain points and competitor context — and nothing else. Ad #50
is written with exactly the same information as ad #1. The system produces ads; it does not
improve them.

This spec closes that loop. Every generated creative is tagged with its **ingredients**
(angle, copywriting framework, pain point, hook shape, CTA type, image style). Outcomes are
scored **per ingredient** rather than per ad. The next creative samples its ingredients
weighted by those scores, with three separate mechanisms that stop the system converging on
a single formula.

**Why per-ingredient and not per-ad:** at current volume a per-ad winner is noise. Ten ads
give ten samples of size one. Ten ads spread across four frameworks give meaningful counts
per framework. Ingredient-level learning is the only form of learning that works at this
stage, and it keeps working as volume grows.

---

## 2. Grounding — verified state as of 2026-08-03

Checked against the live system, not assumed:

| Fact | Evidence |
|---|---|
| No performance data reaches generation | `src/lib/ads/ad-copy.ts:19-29` — `GenerateAdCopyInput` has no performance field |
| Frameworks are prose, not data | `src/lib/ads/ad-copy.ts:132-136` — PAS/AIDA/BAB/4Ps hardcoded inside the prompt string |
| No creative attributes are stored | `src/lib/db/schema.ts:391-424` — `meta_ads` has opaque `draft` jsonb, no angle/framework columns |
| The agent cannot act | `src/app/api/ads/agent-plan/route.ts:63` — `executable: false`, no write path to Meta |
| Ads have never delivered | Meta lifetime insights: 0 impressions, 0 spend across all four ads. Only spend ever on the account is an unrelated 2023 boosted post ($26.32 AUD) |
| Organic has real history | `postAnalytics`, angle attribution, LRU rotation — running since early 2026 |

The zero-impression finding is what forces the cold-start design in §4.3. An ads-only
learner would sit inert for months.

**Prior art already in this repo** (this spec extends, it does not reinvent):
`creative-angles.ts` LRU rotation, `hook-shape.ts` variety steering, pHash image dedup,
`agent-policy.ts` pure-function testability.

---

## 3. Data model

Four new tables. **Additive only** — no existing table is altered, no column type changes,
no drops. Per `marketing-agent-roadmap.md` §3b, applied with `ADD COLUMN IF NOT EXISTS` /
`CREATE TABLE IF NOT EXISTS` style scripts rather than `drizzle-kit push`, so unrelated
schema drift is left alone. Rollback is "stop reading the tables".

### 3.1 `creative_ingredients` — the vocabulary, as data

```
id              uuid pk
dimension       varchar(32)   -- angle | framework | pain_point | hook_shape | cta_type | image_style
                              -- image_style is record-only until AI image generation lands (§10)
value           varchar(64)   -- 'PAS', 'curiosity_gap', 'loss_aversion'
prompt_fragment text          -- the instruction text injected into the copywriter prompt
source          varchar(32)   -- builtin | ads_library | transcript | viral_feed
active          boolean       default true
created_at      timestamp
```
Unique on `(dimension, value)`.

**This table is the seam for Spec 2.** Because the vocabulary is rows rather than a
TypeScript enum, external DNA injection becomes `INSERT ... source='ads_library'`. The
scorer, sampler and generator never change.

`prompt_fragment` carries the actual instruction, so an ingredient is self-describing — a
framework is not merely the label "PAS", it ships the prose that tells the model how to
structure around it. Seeded from what `ad-copy.ts:125-138` hardcodes today.

### 3.2 `creative_genomes` — what each creative was made of

```
id            uuid pk
subject_type  varchar(16)   -- 'ad' | 'post'
subject_id    uuid          -- meta_ads.id or posts.id
surface       varchar(16)   -- 'ads' | 'organic'
was_wildcard  boolean       -- was this the forced-exploration slot
sampling_meta jsonb         -- noveltyDistance, borrowedPriors[], temperature used
created_at    timestamp
```
Index on `(subject_type, subject_id)` and on `surface`.

Deliberately not a column on `meta_ads`: genomes span both rails, and a shared table is what
makes "shared vocabulary, separate scores" possible without duplicating the concept.

`subject_id` is intentionally **not** a foreign key — it points at two different tables
depending on `subject_type`. Referential integrity is enforced in the recording function, and
orphan rows are harmless (they simply stop contributing to scores).

### 3.3 `creative_genome_ingredients` — join table

```
genome_id      uuid  -- fk creative_genomes.id, on delete cascade
ingredient_id  uuid  -- fk creative_ingredients.id
```
Primary key `(genome_id, ingredient_id)`.

A join table rather than six columns on `creative_genomes`, because the core operation is
"aggregate outcome by ingredient" — one `GROUP BY` here versus six queries or a `UNION`.

### 3.4 `creative_ingredient_scores` — computed, per surface

```
ingredient_id  uuid
surface        varchar(16)   -- 'ads' | 'organic'
n              integer       -- eligible observations
mean_reward    numeric       -- raw mean, kept for display/debugging
shrunk_score   numeric       -- the number the sampler actually uses
borrowed       boolean       -- true when the prior came from the other surface
updated_at     timestamp
```
Primary key `(ingredient_id, surface)`.

Recomputed on read (milliseconds at this volume) and written through, so the UI in §6 can
render without recomputation and score drift is visible over time.

---

## 4. Scoring — `src/lib/creative/scoring.ts`

Pure function. No DB, no network. Exhaustively testable, matching `agent-policy.ts`.

### 4.1 Reward definitions

```
reward(ads)     = clicks / impressions          -- from meta_ad_insights
reward(organic) = reach / followers             -- from postAnalytics
```

CTR steers creative; **cost-per-result is deliberately not used here**. Cost per click folds
in auction pressure, audience size and bid competition — none of which the copy caused.
Attributing a framework as "bad" because it ran in an expensive auction slot teaches the
system a superstition. `agent-policy.ts` keeps cost-per-result for budget decisions and is
**not modified by this spec**. Two jobs, two signals, no contamination.

### 4.2 Eligibility

Only creatives with real delivery contribute. Reuses the existing `IMPRESSION_FLOOR = 500`
from `signals.ts:7` rather than introducing a second, divergent threshold. Below it, a
reward is noise.

### 4.3 Shrinkage and cold start

```
shrunk_score = (n · mean + k · prior) / (n + k)      k = 5
```

With `n = 2`, a raw mean CTR is noise wearing a number's clothing, and an unshrunk system
would chase it confidently. Shrinkage pulls each estimate toward a prior in proportion to how
little data backs it: two observations barely move off the prior, thirty dominate it.

**Cold start needs no special case.** It is only a choice of `prior`:

- ads surface, ingredient has ad data → `prior` = ads global mean
- ads surface, ingredient is thin → `prior` = that ingredient's **organic** `shrunk_score`, and `borrowed = true`
- organic surface → `prior` = organic global mean

As ad observations accumulate, `n` grows and the formula automatically fades the borrowed
influence toward nothing. No threshold to tune, no switchover to get wrong, no mode flag. An
organic reach score is never presented as a click-through rate — it only ever acts as a
starting belief that evidence overwrites.

`k = 5` is a tunable constant declared at the top of the module, in the same style as the
benchmark constants in `signals.ts`.

---

## 5. Sampling — `src/lib/creative/sampling.ts`

Pure function: `(scores, recentGenomes, config, index) → SampledGenome`.

```ts
export interface EntropyConfig {
  temperature: number;         // softmax; higher = flatter = more exploration
  floorProbability: number;    // no ingredient may fall below this
  wildcardEveryN: number;      // forced exploration slot
  noveltyWindow: number;       // compare against the last N genomes
  noveltyMinDistance: number;  // Jaccard threshold
  maxResampleAttempts: number; // then accept best effort
}

export const DEFAULT_ENTROPY_CONFIG: EntropyConfig = {
  temperature: 1.0,
  floorProbability: 0.05,
  wildcardEveryN: 5,
  noveltyWindow: 10,
  noveltyMinDistance: 0.4,
  maxResampleAttempts: 8,
};
```

### 5.1 Weighted sampling with a floor — anti-convergence

Per dimension: `softmax(score / temperature)`, then clamp every probability up to
`floorProbability` and renormalise. A losing ingredient's odds shrink but never reach zero,
so nothing is permanently condemned by an unlucky early run. Without this, one good result
locks the system into a single formula — the exact failure the whole spec exists to prevent.

### 5.2 Combination novelty — anti-staleness

Ingredients can vary while the *recipe* repeats. Compute Jaccard distance between the
candidate ingredient set and each of the last `noveltyWindow` genomes; resample if any
distance falls below `noveltyMinDistance`.

Bounded by `maxResampleAttempts`, after which the best candidate seen is accepted. An
unbounded retry loop that cannot find a novel-enough combination is the same shape of defect
as the empty-hook god-mode crash — it must degrade, never hang.

This mirrors the pHash image dedup already in the organic rail, applied to the recipe rather
than the picture.

### 5.3 Wildcard slot — anti-neglect

When `index % wildcardEveryN === 0`, ignore scores entirely and sample **inversely by `n`**,
favouring the least-tested ingredients. This is what stops "never properly tried" being
misread as "does not work", and it keeps the long tail alive independently of the score
floor.

### 5.4 Legibility

`SampledGenome` returns the chosen ingredient per dimension **plus its reasoning** —
`wasWildcard`, `noveltyDistance`, `borrowedPriors[]`, `temperature`. A genome is as
inspectable as an `agent-plan` decision; "why did it write this ad" is always answerable.

---

## 6. Wiring and UI

### 6.1 Generation

`generateAdCopy` gains one optional field:

```ts
export interface GenerateAdCopyInput {
  /* …unchanged… */
  genome?: SampledGenome;
}
```

When present, the ingredients' `prompt_fragment` text replaces the hardcoded framework and
psychology prose at `ad-copy.ts:125-138`. When absent, output is byte-identical to today.

Gated by **`CREATIVE_GENOME_ENABLED`**, default off, using the house flag pattern from
`smart-posts/generate.ts:216-226`: env check → dynamic import → `try/catch` degrading to
current behaviour. A genome failure must never block an ad, exactly as a brain failure never
blocks a caption.

### 6.2 Recording

`genome-record.ts` writes the genome and its join rows when an ad is published
(`/api/ads/publish`) and when an organic post is created. Recording is best-effort: a failure
is logged and swallowed, never propagated into the publish path.

### 6.3 Surfaces

- **New page `/ads/genome`** — ingredient leaderboard per dimension, showing `n`,
  `mean_reward`, `shrunk_score`, and a `borrowed` badge where a prior came from organic.
  Covers both surfaces via a toggle. This is the "what is actually working" view.
- **"Why this creative" panel** on existing ad rows in `/ads` — the genome that produced it,
  with wildcard and novelty metadata.
- **No new cron.** Scores compute on read.

### 6.4 What this spec does NOT do

- Does not modify `agent-policy.ts` or its cost-per-result logic
- Does not give the agent any write path to Meta — `agent-plan` stays `executable: false`
- Does not activate, pause, or create any ad autonomously
- Does not touch the autopilot hot path (`brain-daily → snapshot → compute → brief → autopilot/run`)
- Does not add a pixel, CAPI, or `CONVERSIONS` objective — M1 remains gated on volume

---

## 7. Testing

Following the repo's existing pattern of pure logic modules with exhaustive unit tests
(`agent-policy.test.ts`, `channel-health.test.ts`).

**Unit — `scoring.ts`**
- shrinkage pulls a low-`n` ingredient toward the prior; a high-`n` one toward its own mean
- borrowed prior is used only when ad data is thin, and `borrowed` is flagged
- borrowed influence provably decays as `n` rises
- creatives below `IMPRESSION_FLOOR` are excluded
- zero impressions never produce a divide-by-zero
- an ingredient with no observations at all returns the prior, not `NaN`

**Unit — `sampling.ts`**
- every ingredient retains probability ≥ `floorProbability` after renormalisation
- probabilities sum to 1 across each dimension
- a dominant ingredient does not reach probability 1
- novelty rejection triggers on a near-duplicate recent genome
- resampling terminates at `maxResampleAttempts` and returns a valid genome
- wildcard fires exactly on `index % wildcardEveryN === 0` and selects by lowest `n`
- deterministic given a seeded RNG (RNG injected, not global — required for testability)

**Integration**
- `generateAdCopy` without `genome` produces byte-identical output to current behaviour
- `CREATIVE_GENOME_ENABLED=false` never touches the new tables
- a thrown error inside genome sampling degrades to today's behaviour, ad still generates
- genome recording failure does not fail the publish

**Convergence check (the acceptance test for the whole spec)**
- simulate 100 generations with one artificially dominant ingredient; assert the sampler
  still selects other ingredients at a rate consistent with `floorProbability`, and that
  distinct-combination count stays above a floor. This is the property the spec exists to
  guarantee, so it is tested directly rather than inferred.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Learning superstitions from tiny samples | Shrinkage + `IMPRESSION_FLOOR` eligibility |
| Organic priors misread as click predictions | Separate score rows per surface; prior only, decays with evidence; `borrowed` flag surfaced in UI |
| Entropy degrades ad quality | Wildcard rate is a config constant; leaderboard makes the cost visible; flag defaults off |
| Retry loop hangs | `maxResampleAttempts` hard bound, best-effort fallback |
| Vocabulary grows stale | Spec 2 (external DNA) plugs into `creative_ingredients.source` |
| Zero ad data makes the loop unverifiable | Organic rail exercises the same code path with real volume from day one |

**Honest limitation:** with zero ad impressions to date, the ads half of this system cannot
be validated against real ad performance at build time. It will be exercised end-to-end on
the organic rail, which has genuine history. The ads half is correct-by-construction and
tested by simulation until ads actually run.

---

## 9. Deferred to Spec 2 — external DNA injection

Meta Ads Library ingestion, podcast/YouTube transcript mining, viral-format feeds. Three
separate external integrations, each with its own auth, rate limits and parsing — a distinct
subsystem, and roadmap M5.

It is deferred rather than dropped because the other three entropy mechanisms optimise
*within* ideas already held; only external DNA escapes a local maximum. Spec 1 is built so
Spec 2 is purely additive: new rows in `creative_ingredients` with a non-`builtin` `source`,
and every other component works unchanged.

---

## 10. Resolved decisions

**1. `image_style` is kept, record-only for now.** (Confirmed 2026-08-03.)

Creative is stock-photo selection today; the intent is to move to AI-generated statics once
a suitable tool is chosen. So the dimension ships now in **record-only** mode: it is stored
on every genome and scored like any other ingredient, but its `prompt_fragment` is not
injected anywhere until an image path exists that can accept a style directive.

This is the cheaper order of operations. Recording from day one means that when generation
does land, there is already history showing which image styles correlated with clicks —
rather than starting that clock from zero on the day the tool is swapped in. The cost of
carrying it is one nullable dimension.

Implementation note: `sampling.ts` must treat a dimension with no active `prompt_fragment`
as sampleable-but-inert, not as an error. Covered by a unit test.

**2. Wildcard rate confirmed at 1-in-5.** (Confirmed 2026-08-03.)

`wildcardEveryN: 5` in `DEFAULT_ENTROPY_CONFIG`. A config constant, tunable once the
leaderboard shows real spread.

---

## 11. Implementation deviations

Five places where the shipped code does not do what this spec says, each with the reason and
the evidence. A spec that silently disagrees with the code it produced is worse than no spec,
because the next reader will "fix" the code back to match the document instead of the data.

### D1 — Organic reward is reach relative to the brand median, not reach / followers

§4.1 specifies `reward(organic) = reach / followers`. The code
(`src/lib/creative/scoring.ts:54-57`, `organicReward()`) computes `reach / brandMedianReach`
instead.

Follower counts live on `scraped_accounts` rows, and those rows have `brand_id` set to `NULL`
— there is no reliable join from a genome back to a follower count. Even if there were, scores
pool across brands in one table, and the measured medians differ sharply: pacebrain's median
post reach is 14, affectly's is 3. Dividing by a static follower count would still let one
brand's absolute reach numbers outrank another brand's regardless of which ingredients were
used, because the two brands operate at completely different reach scales. Dividing by the
brand's own median cancels that out: every brand's ingredients are scored against that brand's
own typical outcome, so a curiosity-gap hook that reaches 2x affectly's median (score ~2.0) is
comparable to a curiosity-gap hook that reaches 2x pacebrain's median, even though the raw
reach numbers (6 vs 28) look nothing alike.

### D2 — Eligibility floors are per surface, not one shared `IMPRESSION_FLOOR`

§4.2 says to reuse `IMPRESSION_FLOOR = 500` from `signals.ts` for eligibility. The code
applies that floor only to the ads surface (`src/lib/creative/genome-read.ts:28,115`,
`ADS_IMPRESSION_FLOOR = 500`). Organic eligibility is gated solely by `hasOutcome()`
(`genome-read.ts:122`), with no impression floor at all.

Real organic posts in this system reach 1 to 28 people. A 500-impression floor would have
excluded every organic post ever published, leaving `loadObservations('organic')` permanently
empty. Since the ads surface borrows organic's `shrunk_score` as its cold-start prior (§4.3),
an empty organic surface means the ads surface has nothing to borrow either — the whole
cold-start mechanism the spec depends on would be dead on arrival, and it would look fine at
review time because no error is thrown; it would just never learn anything. Organic instead
uses whatever eligibility `hasOutcome()` already enforces for the existing brain (a post has to
have analytics recorded at all), which is the same bar the organic learning loop already
clears today.

### D3 — Borrowed prior is a multiplier on the ads mean, not an absolute value

§4.3 describes the borrowed prior as "that ingredient's organic `shrunk_score`" — read
literally, `prior = organic.shrunkScore`. The code
(`src/lib/creative/scoring.ts:99-111`) instead computes
`prior = adsGlobalMean * organic.shrunkScore`, treating the organic score as a relative
multiplier rather than an absolute value.

The two surfaces are not on the same scale. Ads reward is a click-through rate, roughly
0.01-0.1. Organic reward (post-D1) is reach relative to the brand median, roughly 0.5-3. Using
an organic score directly as an absolute ads prior means an ingredient that reached 2x its
brand's median organically would enter the ads formula as `prior = 2.0` — a claimed 200% CTR,
about 40 times any real click-through rate — and at `k = 5` it would take roughly n = 5000 real
ad observations before the shrinkage formula `(n·mean + k·prior)/(n+k)` faded that absolute
value back down to something in CTR range. Using it as a multiplier on the ads global mean
keeps the prior on the ads scale from the start (`0.03 mean × 2.0 = 0.06`, still a plausible
CTR), so it fades at the intended `n ≈ 45` (nine times `k`), and an ingredient that has never
run an ad does not enter the leaderboard looking like the best-performing ad ever bought.
Verified arithmetically during review, not just asserted.

### D4 — Softmax standardises scores within the dimension before exponentiating

§5.1 specifies `softmax(score / temperature)` applied to raw scores. The code
(`src/lib/creative/sampling.ts:78-103`, `softmaxWithFloor()`) z-scores the scores within the
dimension first, then divides by temperature, then exponentiates.

At ad scale, raw scores are close together in absolute terms — 0.02 vs 0.03 CTR. Exponentiating
`0.02` and `0.03` directly and normalising gives probabilities of about 0.497 and 0.503:
effectively uniform. The sampler would never meaningfully favor a better-scoring ingredient, and
every score this feature computes would be discarded. Organic scores (0.5-3 range) do not have
this problem at `temperature = 1.0`, so one shared temperature cannot serve both surfaces under
the literal spec — either it is too flat for ads or too sharp for organic. Standardising within
the dimension first (subtract the mean, divide by the standard deviation) puts both surfaces on
a comparable footing before temperature is applied: the same 0.02-vs-0.03 gap, once standardised,
yields probabilities around 0.238 and 0.762 — the sampler actually exploits the score difference
instead of ignoring it.

### D5 — Organic genome recording is not implemented

§6.2 says `genome-record.ts` writes a genome "when an ad is published... and when an organic
post is created." Only the ads path is wired: `recordGenome()` is called from
`src/app/api/ads/publish/route.ts:327-328`. There is no call site anywhere in the organic
posting path (`god-mode`, autopilot, or the manual composer).

Wiring organic recording means sampling a genome inside god-mode, which is the autopilot hot
path — explicitly forbidden by this plan's own constraints (§6.4: "Does not touch the autopilot
hot path"). The organic rail also already has its own steering as of the 2026-08-03 hook-shape
variety work, so this was not a silent gap so much as a deliberate one, but it has a real
consequence that has to be stated plainly rather than left to be discovered later:
**`borrowedPriors` will be empty and no cold-start warm start exists for the ads surface until a
follow-up wires organic recording.** The ads surface still works — `scoreIngredients()` falls
back to the ads global mean as its prior when no organic score exists for an ingredient — it
just starts cold instead of inheriting a head start from organic history. §8's own risk table
already names "zero ad data makes the loop unverifiable" as a known risk; this is the same risk
extended to the borrowing mechanism specifically.

### Note — a defect in the plan's own test design, fixed during implementation

The convergence acceptance test in §7 seeds a deterministic linear congruential generator (LCG)
for its RNG. The plan's original seed was a fraction. An LCG of the form
`state = (state * a + c) % m` needs an integer seed: with a fractional starting value, the
recurrence `state * 9301` never reaches the modulus `233280`, so the sequence contracts to the
fixed point `0.2200965...` on the first call and every subsequent "random" draw returns that
same constant. A sampler fed a constant stream cannot produce variety, which would have made the
convergence test — the acceptance test for the entire spec — fail for a reason that has nothing
to do with the sampler's correctness. This was a defect in the plan's test design, not in the
implementation; it was caught and fixed before landing by seeding the LCG with an integer
(`rngState = 123456789`) in `src/lib/creative/__tests__/sampling.test.ts`.
