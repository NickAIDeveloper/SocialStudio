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

## 10. Open questions

1. `image_style` as a dimension presumes the image generation path can accept a style
   directive. Today god-mode *selects* stock photos rather than *creating* to a brief
   (roadmap M3). Until then this dimension is recorded but has no `prompt_fragment` effect —
   confirm that recording-without-acting is acceptable, or drop the dimension until M3.
2. Wildcard rate of 1-in-5 is a guess. It is a config constant, so it can be tuned once the
   leaderboard shows real spread.
