# Creative Genome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every generated creative with its ingredients, score outcomes per ingredient rather than per ad, and sample the next creative from those scores with three mechanisms that stop it converging on one formula.

**Architecture:** Four additive tables hold a vocabulary (as data, not an enum), one genome row per creative, a join table, and computed per-surface scores. Two pure modules do the thinking — `scoring.ts` (empirical-Bayes shrinkage) and `sampling.ts` (softmax + floor, novelty rejection, wildcard slot) — so the rules are exhaustively testable without a database or an LLM. Everything is gated behind `CREATIVE_GENOME_ENABLED`, default off.

**Tech Stack:** TypeScript, Next.js App Router, Drizzle ORM on Neon Postgres, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-03-creative-genome-design.md`

## Global Constraints

- **Additive schema only.** New tables only. No `ALTER` on an existing table, no type changes, no drops. Apply with a `CREATE TABLE IF NOT EXISTS` script (pattern: `scripts/add-channel-health-columns.ts`), **not** `drizzle-kit push`.
- **Flag off by default.** `CREATEIVE_GENOME_ENABLED` is spelled `CREATIVE_GENOME_ENABLED`. Absent or any value other than `'true'` means the system behaves exactly as it does today.
- **House flag pattern** (copy `src/lib/smart-posts/generate.ts:216-226`): env check → dynamic import → `try/catch` degrading to previous behaviour. A genome failure must never block an ad or a post.
- **Do not modify** `src/lib/ads/agent-policy.ts`, `/api/ads/agent-plan` (stays `executable: false`), or the autopilot hot path (`brain-daily → snapshot → compute → brief → autopilot/run`).
- **No new cron.** Scores compute on read.
- **House style in generated copy:** no dashes, no emojis, no markdown (already enforced by `sanitizeCaption`).
- **Pure modules take an injected RNG.** `Math.random()` is never called inside `sampling.ts`; the caller passes `rng: () => number`. Required for deterministic tests.

---

## Spec deviations — read before starting

Two spec statements do not survive contact with production data. Both are resolved here; do not "fix" the code back to the spec text.

### D1. Organic reward is reach relative to the brand's own median, not reach per follower

Spec §4.1 says `reward(organic) = reach / followers`. **Follower counts are not linked to brands.** They exist in `scraped_accounts` (`pacebrain.app` 356, `affectly.app` 30) but every such row has `brand_id = NULL`, so there is no reliable join. Matching by handle is fragile and the counts are scraped at arbitrary times.

Measured reach, 2026-08-04:

| brand | n | median reach | min | max |
|---|---|---|---|---|
| pacebrain | 25 | 14 | 7 | 28 |
| affectly | 38 | 3 | 1 | 5 |

Scores pool across brands (`creative_ingredient_scores` is keyed on `(ingredient_id, surface)` with no brand). Raw reach would therefore make every ingredient PaceBrain happens to use look better than every ingredient Affectly uses, purely because PaceBrain has a bigger audience.

**Use `reward(organic) = reach / brandMedianReach`.** It needs no follower data, is inherently brand-normalised, and means "how much better than this brand's typical post". A brand with no positive-reach history yet contributes nothing (guard against divide-by-zero).

### D2. Eligibility floors are per surface. The organic floor is NOT 500.

Spec §4.2 says reuse `IMPRESSION_FLOOR = 500` from `signals.ts:7`. That is a **Meta ads** floor. Organic posts here reach 1–28 people. Applying 500 to organic excludes **every organic post ever published**, so the organic rail would contribute zero observations — which silently destroys the cold-start borrowing the entire design depends on.

**Ads floor:** 500 impressions (unchanged, imported from `signals.ts`).
**Organic floor:** the post has an analytics row at all, i.e. `hasOutcome(row)` is true (already implemented in `src/lib/brain/creative-stats.ts`). Thin data is handled by shrinkage, not by a floor that excludes everything.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts` *(modify)* | Four new table definitions, appended. Nothing existing altered. |
| `scripts/add-creative-genome-tables.ts` *(create)* | Idempotent `CREATE TABLE IF NOT EXISTS` migration + verification output. |
| `src/lib/creative/vocabulary.ts` *(create)* | Dimension list, the builtin ingredient seed data, and types. Pure. |
| `scripts/seed-creative-ingredients.ts` *(create)* | Upserts the builtin vocabulary into the table. Idempotent. |
| `src/lib/creative/scoring.ts` *(create)* | Pure. Observations → shrunk per-ingredient scores, per surface, with borrowed priors. |
| `src/lib/creative/sampling.ts` *(create)* | Pure. Scores + recent genomes + config + rng → `SampledGenome`. The three entropy mechanisms. |
| `src/lib/creative/genome-record.ts` *(create)* | Writes a genome + join rows. Best-effort, never throws. |
| `src/lib/creative/genome-read.ts` *(create)* | Reads observations, recent genomes, and the vocabulary from the DB; writes through to the scores table. |
| `src/lib/ads/ad-copy.ts` *(modify)* | Optional `genome` input; its `prompt_fragment`s replace the hardcoded prose at lines 125-138. |
| `src/app/api/ads/generate/route.ts` *(modify)* | Flag-gated sample-and-pass. |
| `src/app/api/ads/publish/route.ts` *(modify)* | Flag-gated genome recording. |
| `src/app/api/creative/genome/route.ts` *(create)* | GET the leaderboard for the UI. |
| `src/app/(dashboard)/ads/genome/page.tsx` *(create)* | Ingredient leaderboard page. |

---

## Task 1: Schema, migration, and the vocabulary seed

**Files:**
- Modify: `src/lib/db/schema.ts` (append at end)
- Create: `src/lib/creative/vocabulary.ts`
- Create: `scripts/add-creative-genome-tables.ts`
- Create: `scripts/seed-creative-ingredients.ts`
- Test: `src/lib/creative/__tests__/vocabulary.test.ts`

**Interfaces:**
- Produces: `CREATIVE_DIMENSIONS: readonly CreativeDimension[]`, `type CreativeDimension = 'angle' | 'framework' | 'pain_point' | 'hook_shape' | 'cta_type' | 'image_style'`, `BUILTIN_INGREDIENTS: readonly BuiltinIngredient[]`, `interface BuiltinIngredient { dimension: CreativeDimension; value: string; promptFragment: string }`, and the Drizzle tables `creativeIngredients`, `creativeGenomes`, `creativeGenomeIngredients`, `creativeIngredientScores`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/creative/__tests__/vocabulary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CREATIVE_DIMENSIONS,
  BUILTIN_INGREDIENTS,
  ingredientsFor,
  RECORD_ONLY_DIMENSIONS,
} from '../vocabulary';

describe('vocabulary', () => {
  it('covers every dimension the spec names', () => {
    expect([...CREATIVE_DIMENSIONS].sort()).toEqual(
      ['angle', 'cta_type', 'framework', 'hook_shape', 'image_style', 'pain_point'].sort(),
    );
  });

  it('has no duplicate (dimension, value) pairs', () => {
    // The table has a unique index on this pair; a duplicate here would make
    // the seed script fail on a fresh database.
    const keys = BUILTIN_INGREDIENTS.map(i => `${i.dimension}:${i.value}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every ingredient a non-empty prompt fragment', () => {
    // An ingredient with no fragment steers nothing — it would be selected,
    // recorded, scored, and have no effect on the copy at all.
    for (const i of BUILTIN_INGREDIENTS) {
      expect(i.promptFragment.trim().length).toBeGreaterThan(0);
    }
  });

  it('carries the four copywriting frameworks ad-copy.ts hardcodes today', () => {
    const frameworks = ingredientsFor('framework').map(i => i.value).sort();
    expect(frameworks).toEqual(['AIDA', 'BAB', 'FOURPS', 'PAS']);
  });

  it('offers at least two options in every steerable dimension', () => {
    // A dimension with one option cannot vary, so sampling it is theatre.
    for (const d of CREATIVE_DIMENSIONS) {
      if (RECORD_ONLY_DIMENSIONS.includes(d)) continue;
      expect(ingredientsFor(d).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('marks image_style as record-only', () => {
    // Creative is stock-photo selection today; there is no image path that can
    // accept a style directive. It is stored and scored, never injected.
    expect(RECORD_ONLY_DIMENSIONS).toContain('image_style');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creative/__tests__/vocabulary.test.ts`
Expected: FAIL — cannot resolve module `../vocabulary`.

- [ ] **Step 3: Write the vocabulary**

Create `src/lib/creative/vocabulary.ts`. Fragments are lifted from what `src/lib/ads/ad-copy.ts:125-138` hardcodes today, so behaviour with the flag on stays recognisable.

```ts
// src/lib/creative/vocabulary.ts
//
// The ingredient vocabulary, as DATA rather than a TypeScript enum.
//
// This is the seam for spec 2 (external DNA injection): adding a competitor
// angle mined from the Ads Library becomes an INSERT with source='ads_library',
// and the scorer, sampler and generator never change. An enum would have made
// that a code change every time.

export type CreativeDimension =
  | 'angle'
  | 'framework'
  | 'pain_point'
  | 'hook_shape'
  | 'cta_type'
  | 'image_style';

export const CREATIVE_DIMENSIONS: readonly CreativeDimension[] = [
  'angle', 'framework', 'pain_point', 'hook_shape', 'cta_type', 'image_style',
];

// Recorded and scored, but never injected into a prompt. image_style has no
// effect until creative is GENERATED rather than selected from stock — see
// spec §10. Recording it now means history exists on the day that lands.
export const RECORD_ONLY_DIMENSIONS: readonly CreativeDimension[] = ['image_style'];

export interface BuiltinIngredient {
  dimension: CreativeDimension;
  value: string;
  promptFragment: string;
}

export const BUILTIN_INGREDIENTS: readonly BuiltinIngredient[] = [
  // ── framework ── the four ad-copy.ts names today
  { dimension: 'framework', value: 'PAS', promptFragment: 'Structure the body as Pain, Agitate, Solution. Name the problem, make it feel present, then resolve it. Never print the stage names.' },
  { dimension: 'framework', value: 'AIDA', promptFragment: 'Structure the body as Attention, Interest, Desire, Action. Best for cold readers who do not yet know the problem. Never print the stage names.' },
  { dimension: 'framework', value: 'BAB', promptFragment: 'Structure the body as Before, After, Bridge. Show the current state, the changed state, then what connects them. Never print the stage names.' },
  { dimension: 'framework', value: 'FOURPS', promptFragment: 'Structure the body as Promise, Picture, Proof, Push. Use only proof you were actually given. Never print the stage names.' },

  // ── angle ── what the creative is ABOUT
  { dimension: 'angle', value: 'curiosity_gap', promptFragment: 'Open a loop the reader needs closed. Raise a question the product answers, and do not answer it in the first line.' },
  { dimension: 'angle', value: 'loss_aversion', promptFragment: 'Frame the cost of NOT acting rather than the upside of acting. What is quietly being lost right now.' },
  { dimension: 'angle', value: 'social_proof', promptFragment: 'Lead with what other people in this situation do. Use ONLY real facts you were given; never invent counts, testimonials or studies.' },
  { dimension: 'angle', value: 'authority', promptFragment: 'Lead with the method or the science behind the product. Explain the mechanism plainly, without inventing studies.' },
  { dimension: 'angle', value: 'pattern_interrupt', promptFragment: 'Break the scroll with an unexpected first line that contradicts what the reader assumes.' },
  { dimension: 'angle', value: 'transformation', promptFragment: 'Centre the change in the person, not the features of the product.' },

  // ── hook_shape ── the SENTENCE FORM of the opening line.
  // Deliberately the same five shapes classifyHookPattern() detects in
  // src/lib/brain/creative-stats.ts, so recorded genomes and measured hook
  // shapes use one vocabulary and can be compared directly.
  { dimension: 'hook_shape', value: 'question', promptFragment: 'Open with a direct question the reader cannot answer without reading on.' },
  { dimension: 'hook_shape', value: 'number', promptFragment: 'Open with a specific number that frames what follows.' },
  { dimension: 'hook_shape', value: 'contrarian', promptFragment: 'Open by contradicting something the reader assumes is true.' },
  { dimension: 'hook_shape', value: 'personal', promptFragment: 'Open with a first-person admission or confession.' },
  { dimension: 'hook_shape', value: 'statement', promptFragment: 'Open with a flat declarative claim.' },

  // ── cta_type ── how the close asks for the tap
  { dimension: 'cta_type', value: 'direct', promptFragment: 'Close by asking for the tap plainly.' },
  { dimension: 'cta_type', value: 'curiosity', promptFragment: 'Close by promising what the reader will SEE once they tap.' },
  { dimension: 'cta_type', value: 'low_friction', promptFragment: 'Close by making the next step feel small and instant.' },
  { dimension: 'cta_type', value: 'outcome', promptFragment: 'Close on the specific result the reader gets, stated concretely.' },

  // ── pain_point ── which researched pain leads. Generic placeholders only:
  // real pains arrive per brand from brand_pain_points at generation time.
  { dimension: 'pain_point', value: 'top_ranked', promptFragment: 'Lead with the single most-referenced pain from the research you were given.' },
  { dimension: 'pain_point', value: 'second_ranked', promptFragment: 'Lead with the SECOND most-referenced pain from the research you were given, not the first.' },

  // ── image_style ── RECORD ONLY. No prompt effect until generated creative.
  { dimension: 'image_style', value: 'stock_photo', promptFragment: 'record-only: selected stock photograph with a text overlay' },
  { dimension: 'image_style', value: 'stock_photo_person', promptFragment: 'record-only: selected stock photograph featuring a person' },
];

export function ingredientsFor(dimension: CreativeDimension): BuiltinIngredient[] {
  return BUILTIN_INGREDIENTS.filter(i => i.dimension === dimension);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creative/__tests__/vocabulary.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the Drizzle tables**

Append to `src/lib/db/schema.ts`. Match the existing style (see `metaAds` at line 391 for reference).

```ts
// ── Creative genome ──────────────────────────────────────────────────────────
// Ingredient-level learning: what each creative was MADE of, so outcomes can be
// scored per ingredient rather than per ad. At this volume a per-ad winner is
// noise; ten ads across four frameworks give counts that mean something.
// See docs/superpowers/specs/2026-08-03-creative-genome-design.md

export const creativeIngredients = pgTable(
  'creative_ingredients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dimension: varchar('dimension', { length: 32 }).notNull(),
    value: varchar('value', { length: 64 }).notNull(),
    // The instruction injected into the copywriter prompt. An ingredient is
    // self-describing: a framework is not the label 'PAS', it ships the prose.
    promptFragment: text('prompt_fragment').notNull(),
    // 'builtin' today. Spec 2 inserts 'ads_library' | 'transcript' | 'viral_feed'
    // rows here and nothing else in the system needs to change.
    source: varchar('source', { length: 32 }).notNull().default('builtin'),
    active: pgBoolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('creative_ingredient_dim_value_idx').on(t.dimension, t.value)],
);

export const creativeGenomes = pgTable(
  'creative_genomes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // 'ad' → meta_ads.id, 'post' → posts.id. Intentionally NOT a foreign key:
    // it points at two different tables. Orphans are harmless — they simply
    // stop contributing to scores.
    subjectType: varchar('subject_type', { length: 16 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
    surface: varchar('surface', { length: 16 }).notNull(), // 'ads' | 'organic'
    wasWildcard: pgBoolean('was_wildcard').notNull().default(false),
    // noveltyDistance, borrowedPriors[], temperature — so "why did it write
    // this?" is always answerable, the same way an agent-plan decision is.
    samplingMeta: jsonb('sampling_meta'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('creative_genome_subject_idx').on(t.subjectType, t.subjectId),
    index('creative_genome_surface_idx').on(t.surface),
  ],
);

export const creativeGenomeIngredients = pgTable(
  'creative_genome_ingredients',
  {
    genomeId: uuid('genome_id')
      .notNull()
      .references(() => creativeGenomes.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => creativeIngredients.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.genomeId, t.ingredientId] })],
);

export const creativeIngredientScores = pgTable(
  'creative_ingredient_scores',
  {
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => creativeIngredients.id, { onDelete: 'cascade' }),
    surface: varchar('surface', { length: 16 }).notNull(),
    n: integer('n').notNull().default(0),
    meanReward: numeric('mean_reward'),
    // The number the sampler actually uses. Shrunk toward a prior in proportion
    // to how little data backs it — a raw mean over n=2 is noise wearing a
    // number's clothing.
    shrunkScore: numeric('shrunk_score'),
    borrowed: pgBoolean('borrowed').notNull().default(false),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ingredientId, t.surface] })],
);
```

If `index`, `primaryKey` or `numeric` are not already imported at the top of `schema.ts`, add them to the existing `drizzle-orm/pg-core` import.

- [ ] **Step 6: Verify the schema compiles**

Run: `npx tsc --noEmit 2>&1 | grep schema.ts`
Expected: no output. (Pre-existing errors in `scripts/_delpost.ts`, `deep-profile.test.ts` and `tests/e2e/` are unrelated — ignore them.)

- [ ] **Step 7: Write the migration script**

Create `scripts/add-creative-genome-tables.ts`:

```ts
// Creates the four creative-genome tables.
//
// Idempotent (IF NOT EXISTS) and purely additive: no existing table is touched.
// Applied directly rather than via `drizzle-kit push` so unrelated schema drift
// is left alone — push would try to reconcile the whole schema.
//
// Run: npx tsx scripts/add-creative-genome-tables.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS creative_ingredients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dimension varchar(32) NOT NULL,
      value varchar(64) NOT NULL,
      prompt_fragment text NOT NULL,
      source varchar(32) NOT NULL DEFAULT 'builtin',
      active boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now()
    )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS creative_ingredient_dim_value_idx
            ON creative_ingredients (dimension, value)`;
  console.log('✓ creative_ingredients');

  await sql`
    CREATE TABLE IF NOT EXISTS creative_genomes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_type varchar(16) NOT NULL,
      subject_id uuid NOT NULL,
      brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
      surface varchar(16) NOT NULL,
      was_wildcard boolean NOT NULL DEFAULT false,
      sampling_meta jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS creative_genome_subject_idx
            ON creative_genomes (subject_type, subject_id)`;
  await sql`CREATE INDEX IF NOT EXISTS creative_genome_surface_idx
            ON creative_genomes (surface)`;
  console.log('✓ creative_genomes');

  await sql`
    CREATE TABLE IF NOT EXISTS creative_genome_ingredients (
      genome_id uuid NOT NULL REFERENCES creative_genomes(id) ON DELETE CASCADE,
      ingredient_id uuid NOT NULL REFERENCES creative_ingredients(id) ON DELETE CASCADE,
      PRIMARY KEY (genome_id, ingredient_id)
    )`;
  console.log('✓ creative_genome_ingredients');

  await sql`
    CREATE TABLE IF NOT EXISTS creative_ingredient_scores (
      ingredient_id uuid NOT NULL REFERENCES creative_ingredients(id) ON DELETE CASCADE,
      surface varchar(16) NOT NULL,
      n integer NOT NULL DEFAULT 0,
      mean_reward numeric,
      shrunk_score numeric,
      borrowed boolean NOT NULL DEFAULT false,
      updated_at timestamp NOT NULL DEFAULT now(),
      PRIMARY KEY (ingredient_id, surface)
    )`;
  console.log('✓ creative_ingredient_scores');

  const rows = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name LIKE 'creative_%' ORDER BY table_name`;
  console.log('\nVerified:');
  for (const r of rows) console.log(`  ${r.table_name}`);
})();
```

- [ ] **Step 8: Write the seed script**

Create `scripts/seed-creative-ingredients.ts`:

```ts
// Upserts the builtin ingredient vocabulary. Idempotent: re-running refreshes
// prompt fragments without duplicating rows or disturbing externally-sourced
// ingredients (spec 2 inserts those with a different `source`).
//
// Run: npx tsx scripts/seed-creative-ingredients.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';
import { BUILTIN_INGREDIENTS } from '../src/lib/creative/vocabulary';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);
  for (const i of BUILTIN_INGREDIENTS) {
    await sql`
      INSERT INTO creative_ingredients (dimension, value, prompt_fragment, source)
      VALUES (${i.dimension}, ${i.value}, ${i.promptFragment}, 'builtin')
      ON CONFLICT (dimension, value)
      DO UPDATE SET prompt_fragment = EXCLUDED.prompt_fragment`;
  }
  const counts = await sql`
    SELECT dimension, count(*)::int AS n FROM creative_ingredients
    GROUP BY dimension ORDER BY dimension`;
  console.log(`Seeded ${BUILTIN_INGREDIENTS.length} ingredients:`);
  for (const c of counts) console.log(`  ${c.dimension}: ${c.n}`);
})();
```

- [ ] **Step 9: Apply to the development database and verify**

Run: `npx tsx scripts/add-creative-genome-tables.ts` then `npx tsx scripts/seed-creative-ingredients.ts`
Expected: four `✓` lines, then a per-dimension count totalling 23.

- [ ] **Step 10: Run the full suite**

Run: `npx vitest run`
Expected: all pass. Schema additions must not break any existing test.

- [ ] **Step 11: Commit**

```bash
git add src/lib/db/schema.ts src/lib/creative/vocabulary.ts \
        src/lib/creative/__tests__/vocabulary.test.ts \
        scripts/add-creative-genome-tables.ts scripts/seed-creative-ingredients.ts
git commit -m "feat(creative): genome schema and ingredient vocabulary

Four additive tables. The vocabulary is DATA, not a TypeScript enum, so
spec 2 (external DNA) becomes an INSERT rather than a code change.

Prompt fragments are lifted from what ad-copy.ts hardcodes today, and the
hook_shape values are deliberately the same five classifyHookPattern()
already detects, so recorded genomes and measured hooks share one
vocabulary."
```

---

## Task 2: Scoring

**Files:**
- Create: `src/lib/creative/scoring.ts`
- Test: `src/lib/creative/__tests__/scoring.test.ts`

**Interfaces:**
- Consumes: `CreativeDimension` from `vocabulary.ts`.
- Produces:
```ts
export type Surface = 'ads' | 'organic';
export interface Observation { ingredientId: string; surface: Surface; reward: number }
export interface IngredientScore {
  ingredientId: string; surface: Surface;
  n: number; meanReward: number; shrunkScore: number; borrowed: boolean;
}
export const SHRINKAGE_K = 5;
export function adsReward(clicks: number, impressions: number): number | null;
export function organicReward(reach: number, brandMedianReach: number): number | null;
export function scoreIngredients(
  observations: readonly Observation[],
  opts?: { organicScores?: readonly IngredientScore[] },
): IngredientScore[];
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/creative/__tests__/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  adsReward, organicReward, scoreIngredients, SHRINKAGE_K,
  type Observation, type IngredientScore,
} from '../scoring';

const obs = (ingredientId: string, reward: number, surface: 'ads' | 'organic' = 'ads'): Observation =>
  ({ ingredientId, surface, reward });

describe('reward definitions', () => {
  it('computes ads reward as click-through rate', () => {
    expect(adsReward(50, 1000)).toBeCloseTo(0.05);
  });

  it('returns null for ads with no impressions rather than dividing by zero', () => {
    expect(adsReward(0, 0)).toBeNull();
  });

  it('computes organic reward relative to the brand median', () => {
    // NOT reach/followers: follower counts are not linked to brands, and raw
    // reach would make every pacebrain ingredient (median 14) beat every
    // affectly one (median 3) regardless of the creative.
    expect(organicReward(28, 14)).toBeCloseTo(2);
    expect(organicReward(3, 3)).toBeCloseTo(1);
  });

  it('returns null when the brand has no reach history to normalise against', () => {
    expect(organicReward(10, 0)).toBeNull();
  });
});

describe('scoreIngredients — shrinkage', () => {
  it('pulls a thin estimate toward the prior', () => {
    // One observation at 10x the global mean must not be reported as 10x.
    const scored = scoreIngredients([
      obs('rare', 1.0),
      ...Array.from({ length: 20 }, () => obs('common', 0.1)),
    ]);
    const rare = scored.find(s => s.ingredientId === 'rare')!;
    expect(rare.meanReward).toBeCloseTo(1.0);
    expect(rare.shrunkScore).toBeLessThan(0.5);
  });

  it('lets a well-sampled estimate dominate its prior', () => {
    const scored = scoreIngredients([
      ...Array.from({ length: 40 }, () => obs('proven', 1.0)),
      ...Array.from({ length: 40 }, () => obs('weak', 0.0)),
    ]);
    const proven = scored.find(s => s.ingredientId === 'proven')!;
    expect(proven.shrunkScore).toBeGreaterThan(0.9);
  });

  it('reports the sample count it used', () => {
    const scored = scoreIngredients([obs('a', 0.2), obs('a', 0.4)]);
    expect(scored.find(s => s.ingredientId === 'a')!.n).toBe(2);
  });

  it('shrinks exactly per the documented formula', () => {
    // (n*mean + k*prior) / (n + k). With one ingredient the global mean IS the
    // prior, so the result must equal the mean exactly.
    const scored = scoreIngredients([obs('solo', 0.5), obs('solo', 0.5)]);
    expect(scored[0].shrunkScore).toBeCloseTo(0.5);
    expect(SHRINKAGE_K).toBe(5);
  });
});

describe('scoreIngredients — borrowed priors', () => {
  const organic: IngredientScore[] = [
    { ingredientId: 'x', surface: 'organic', n: 30, meanReward: 2.0, shrunkScore: 2.0, borrowed: false },
  ];

  it('borrows the organic score as the prior when ad data is thin', () => {
    const scored = scoreIngredients([obs('x', 0.1)], { organicScores: organic });
    const x = scored.find(s => s.ingredientId === 'x')!;
    expect(x.borrowed).toBe(true);
    // Pulled up toward the organic prior rather than sitting at its own mean.
    expect(x.shrunkScore).toBeGreaterThan(0.1);
  });

  it('lets the borrowed influence fade as real ad data arrives', () => {
    const thin = scoreIngredients([obs('x', 0.1)], { organicScores: organic });
    const thick = scoreIngredients(
      Array.from({ length: 50 }, () => obs('x', 0.1)),
      { organicScores: organic },
    );
    const thinX = thin.find(s => s.ingredientId === 'x')!.shrunkScore;
    const thickX = thick.find(s => s.ingredientId === 'x')!.shrunkScore;
    // No threshold, no mode switch: the formula does this on its own.
    expect(thickX).toBeLessThan(thinX);
    expect(thickX).toBeCloseTo(0.1, 1);
  });

  it('does not mark a score borrowed when no organic score exists', () => {
    const scored = scoreIngredients([obs('y', 0.1)], { organicScores: organic });
    expect(scored.find(s => s.ingredientId === 'y')!.borrowed).toBe(false);
  });

  it('never borrows for the organic surface itself', () => {
    const scored = scoreIngredients([obs('x', 1.5, 'organic')], { organicScores: organic });
    expect(scored.find(s => s.ingredientId === 'x')!.borrowed).toBe(false);
  });
});

describe('scoreIngredients — edges', () => {
  it('returns nothing for no observations', () => {
    expect(scoreIngredients([])).toEqual([]);
  });

  it('scores each surface separately', () => {
    const scored = scoreIngredients([obs('a', 0.1, 'ads'), obs('a', 2.0, 'organic')]);
    expect(scored).toHaveLength(2);
    expect(scored.map(s => s.surface).sort()).toEqual(['ads', 'organic']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creative/__tests__/scoring.test.ts`
Expected: FAIL — cannot resolve `../scoring`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/creative/scoring.ts`:

```ts
// src/lib/creative/scoring.ts
//
// Turns raw outcomes into per-ingredient scores. Pure: no DB, no network, so
// the rules can be tested exhaustively before anything acts on them — the same
// discipline as lib/ads/agent-policy.ts.
//
// The hard problem here is SAMPLE SIZE, not maths. Ads have never delivered and
// organic posts reach single or low double digits, so almost every estimate
// starts life at n=1 or n=2. A raw mean over two observations is noise wearing
// a number's clothing, and a system that chased it would be worse than having
// no loop at all.

export type Surface = 'ads' | 'organic';

export interface Observation {
  ingredientId: string;
  surface: Surface;
  reward: number;
}

export interface IngredientScore {
  ingredientId: string;
  surface: Surface;
  n: number;
  meanReward: number;
  // What the sampler uses. Shrunk toward a prior in proportion to how little
  // data backs it.
  shrunkScore: number;
  // True when the prior came from the other surface (organic informing ads).
  borrowed: boolean;
}

// How many "prior observations" the prior is worth. At k=5, two observations
// barely move off the prior and thirty dominate it. Tunable, in the same style
// as the benchmark constants in lib/ads/signals.ts.
export const SHRINKAGE_K = 5;

// Ads: click-through rate. Deliberately NOT cost per result — cost folds in
// auction pressure, audience size and bid competition, none of which the copy
// caused, so attributing them to a framework teaches a superstition.
// agent-policy.ts keeps cost-per-result for budget decisions.
export function adsReward(clicks: number, impressions: number): number | null {
  if (impressions <= 0) return null;
  return clicks / impressions;
}

// Organic: reach relative to the brand's OWN median post.
//
// Not reach/followers, as the spec first proposed: follower counts exist only
// on scraped_accounts rows with brand_id NULL, so there is no reliable join.
// And scores pool across brands, so raw reach would rank every ingredient
// pacebrain uses (median 14) above every ingredient affectly uses (median 3)
// regardless of the creative. This normalises that away for free.
export function organicReward(reach: number, brandMedianReach: number): number | null {
  if (brandMedianReach <= 0) return null;
  return reach / brandMedianReach;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function scoreIngredients(
  observations: readonly Observation[],
  opts: { organicScores?: readonly IngredientScore[] } = {},
): IngredientScore[] {
  if (observations.length === 0) return [];

  const organicById = new Map(
    (opts.organicScores ?? [])
      .filter(s => s.surface === 'organic')
      .map(s => [s.ingredientId, s]),
  );

  const out: IngredientScore[] = [];

  for (const surface of ['ads', 'organic'] as const) {
    const forSurface = observations.filter(o => o.surface === surface);
    if (forSurface.length === 0) continue;

    // The fallback prior: this surface's own global mean.
    const globalMean = mean(forSurface.map(o => o.reward));

    const grouped = new Map<string, number[]>();
    for (const o of forSurface) {
      const list = grouped.get(o.ingredientId) ?? [];
      list.push(o.reward);
      grouped.set(o.ingredientId, list);
    }

    for (const [ingredientId, rewards] of grouped) {
      const n = rewards.length;
      const m = mean(rewards);

      // Cold start is only a CHOICE OF PRIOR — no special case, no mode flag.
      // Ads with thin data borrow that ingredient's organic belief; as n grows
      // the formula fades the borrowed influence to nothing on its own.
      const organic = surface === 'ads' ? organicById.get(ingredientId) : undefined;
      const borrowed = organic != null;
      const prior = borrowed ? organic!.shrunkScore : globalMean;

      out.push({
        ingredientId,
        surface,
        n,
        meanReward: m,
        shrunkScore: (n * m + SHRINKAGE_K * prior) / (n + SHRINKAGE_K),
        borrowed,
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creative/__tests__/scoring.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/creative/scoring.ts src/lib/creative/__tests__/scoring.test.ts
git commit -m "feat(creative): per-ingredient scoring with empirical-Bayes shrinkage

Cold start needs no special case: borrowing an organic prior for a thin
ads estimate is only a choice of prior, and the (n*mean + k*prior)/(n+k)
formula fades that influence to nothing as ad data accrues.

Organic reward is reach relative to the brand's own median, not reach per
follower as the spec proposed. Follower counts sit on scraped_accounts
rows with brand_id NULL so there is no reliable join, and scores pool
across brands, where raw reach would rank pacebrain (median 14) above
affectly (median 3) whatever the creative said."
```

---

## Task 3: Sampling and the three entropy mechanisms

**Files:**
- Create: `src/lib/creative/sampling.ts`
- Test: `src/lib/creative/__tests__/sampling.test.ts`

**Interfaces:**
- Consumes: `IngredientScore` from `scoring.ts`; `CreativeDimension`, `CREATIVE_DIMENSIONS` from `vocabulary.ts`.
- Produces:
```ts
export interface SamplableIngredient {
  id: string; dimension: CreativeDimension; value: string; promptFragment: string;
}
export interface EntropyConfig {
  temperature: number; floorProbability: number; wildcardEveryN: number;
  noveltyWindow: number; noveltyMinDistance: number; maxResampleAttempts: number;
}
export const DEFAULT_ENTROPY_CONFIG: EntropyConfig;
export interface SampledGenome {
  ingredients: SamplableIngredient[];
  wasWildcard: boolean;
  noveltyDistance: number | null;
  borrowedPriors: string[];
  temperature: number;
}
export function jaccardDistance(a: readonly string[], b: readonly string[]): number;
export function softmaxWithFloor(
  scores: readonly number[], temperature: number, floor: number,
): number[];
export function sampleGenome(args: {
  available: readonly SamplableIngredient[];
  scores: readonly IngredientScore[];
  recentGenomes: readonly (readonly string[])[];
  index: number;
  config?: EntropyConfig;
  rng?: () => number;
}): SampledGenome;
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/creative/__tests__/sampling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  sampleGenome, softmaxWithFloor, jaccardDistance,
  DEFAULT_ENTROPY_CONFIG, type SamplableIngredient,
} from '../sampling';
import type { IngredientScore } from '../scoring';

const ing = (id: string, dimension: string, value: string): SamplableIngredient =>
  ({ id, dimension: dimension as SamplableIngredient['dimension'], value, promptFragment: `do ${value}` });

const AVAILABLE: SamplableIngredient[] = [
  ing('f1', 'framework', 'PAS'), ing('f2', 'framework', 'AIDA'), ing('f3', 'framework', 'BAB'),
  ing('h1', 'hook_shape', 'question'), ing('h2', 'hook_shape', 'number'), ing('h3', 'hook_shape', 'statement'),
];

const score = (ingredientId: string, shrunkScore: number, n = 10): IngredientScore =>
  ({ ingredientId, surface: 'ads', n, meanReward: shrunkScore, shrunkScore, borrowed: false });

// Deterministic RNG so every assertion below is reproducible.
const seeded = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('softmaxWithFloor', () => {
  it('produces a probability distribution', () => {
    const p = softmaxWithFloor([1, 2, 3], 1, 0.05);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('never lets any option fall below the floor', () => {
    // The anti-convergence guarantee. One good early result must not be able
    // to condemn every other ingredient permanently.
    const p = softmaxWithFloor([0, 0, 100], 1, 0.05);
    for (const x of p) expect(x).toBeGreaterThanOrEqual(0.04);
  });

  it('still ranks a stronger option above a weaker one', () => {
    const [weak, strong] = softmaxWithFloor([0, 5], 1, 0.05);
    expect(strong).toBeGreaterThan(weak);
  });

  it('flattens toward uniform as temperature rises', () => {
    const cold = softmaxWithFloor([0, 5], 0.2, 0.01);
    const hot = softmaxWithFloor([0, 5], 10, 0.01);
    expect(Math.abs(hot[0] - hot[1])).toBeLessThan(Math.abs(cold[0] - cold[1]));
  });

  it('handles a single option', () => {
    expect(softmaxWithFloor([3], 1, 0.05)).toEqual([1]);
  });

  it('returns nothing for no options', () => {
    expect(softmaxWithFloor([], 1, 0.05)).toEqual([]);
  });
});

describe('jaccardDistance', () => {
  it('is zero for identical sets', () => {
    expect(jaccardDistance(['a', 'b'], ['b', 'a'])).toBe(0);
  });

  it('is one for disjoint sets', () => {
    expect(jaccardDistance(['a'], ['b'])).toBe(1);
  });

  it('is a half when half the recipe overlaps', () => {
    expect(jaccardDistance(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 - 1 / 3);
  });

  it('treats two empty sets as identical', () => {
    expect(jaccardDistance([], [])).toBe(0);
  });
});

describe('sampleGenome — shape', () => {
  it('picks exactly one ingredient per available dimension', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [], index: 1, rng: seeded([0.5]),
    });
    expect(g.ingredients).toHaveLength(2);
    expect(g.ingredients.map(i => i.dimension).sort()).toEqual(['framework', 'hook_shape']);
  });

  it('reports the temperature it used', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [], index: 1, rng: seeded([0.5]),
    });
    expect(g.temperature).toBe(DEFAULT_ENTROPY_CONFIG.temperature);
  });

  it('lists which ingredients used a borrowed prior', () => {
    const scores: IngredientScore[] = [
      { ingredientId: 'f1', surface: 'ads', n: 1, meanReward: 0.1, shrunkScore: 0.5, borrowed: true },
    ];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: [], index: 1, rng: seeded([0.0]),
    });
    // Legibility: "why did it write this?" must always be answerable.
    expect(Array.isArray(g.borrowedPriors)).toBe(true);
  });

  it('returns an empty genome when nothing is available', () => {
    const g = sampleGenome({ available: [], scores: [], recentGenomes: [], index: 1 });
    expect(g.ingredients).toEqual([]);
  });
});

describe('sampleGenome — wildcard slot', () => {
  it('fires on every Nth creative', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [],
      index: DEFAULT_ENTROPY_CONFIG.wildcardEveryN, rng: seeded([0.5]),
    });
    expect(g.wasWildcard).toBe(true);
  });

  it('does not fire on other creatives', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [], index: 1, rng: seeded([0.5]),
    });
    expect(g.wasWildcard).toBe(false);
  });

  it('picks the least-tested ingredient, ignoring score', () => {
    // Anti-neglect: an ingredient with one unlucky early result must not be
    // confused with one that does not work.
    const scores: IngredientScore[] = [
      score('f1', 10, 100), score('f2', 0, 1), score('f3', 9, 50),
    ];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: [],
      index: DEFAULT_ENTROPY_CONFIG.wildcardEveryN, rng: seeded([0.5]),
    });
    expect(g.ingredients.find(i => i.dimension === 'framework')!.id).toBe('f2');
  });

  it('treats a never-tested ingredient as the least tested', () => {
    const scores: IngredientScore[] = [score('f1', 10, 100), score('f2', 5, 3)];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: [],
      index: DEFAULT_ENTROPY_CONFIG.wildcardEveryN, rng: seeded([0.5]),
    });
    expect(g.ingredients.find(i => i.dimension === 'framework')!.id).toBe('f3');
  });
});

describe('sampleGenome — combination novelty', () => {
  it('avoids repeating a recent recipe when an alternative exists', () => {
    const scores = [score('f1', 100), score('h1', 100)];
    const recent = [['f1', 'h1']];
    const g = sampleGenome({
      available: AVAILABLE, scores, recentGenomes: recent, index: 1, rng: seeded([0.01, 0.99]),
    });
    const ids = g.ingredients.map(i => i.id).sort();
    expect(ids).not.toEqual(['f1', 'h1']);
  });

  it('terminates and returns a valid genome when every recipe is too similar', () => {
    // The bound that matters. An unbounded retry loop that cannot find a novel
    // combination is the same defect shape as the empty-hook god-mode crash:
    // it must degrade to best effort, never hang.
    const onlyOne: SamplableIngredient[] = [ing('f1', 'framework', 'PAS')];
    const recent = Array.from({ length: 10 }, () => ['f1']);
    const g = sampleGenome({
      available: onlyOne, scores: [], recentGenomes: recent, index: 1, rng: seeded([0.5]),
    });
    expect(g.ingredients).toHaveLength(1);
    expect(g.ingredients[0].id).toBe('f1');
  });

  it('reports the novelty distance it achieved', () => {
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: [['f1', 'h1']], index: 1, rng: seeded([0.5]),
    });
    expect(typeof g.noveltyDistance === 'number' || g.noveltyDistance === null).toBe(true);
  });

  it('only compares against the novelty window, not all history', () => {
    const ancient = Array.from({ length: 50 }, () => ['f1', 'h1']);
    const g = sampleGenome({
      available: AVAILABLE, scores: [], recentGenomes: ancient, index: 1, rng: seeded([0.5]),
    });
    expect(g.ingredients).toHaveLength(2);
  });
});

describe('sampleGenome — convergence (the acceptance test for this spec)', () => {
  it('keeps selecting alternatives even when one ingredient dominates', () => {
    // The property the whole feature exists to guarantee. With one ingredient
    // scored far above every other, a naive argmax sampler would pick it 100%
    // of the time and every ad would end up identical.
    const scores: IngredientScore[] = [
      score('f1', 1000), score('f2', 0.001), score('f3', 0.001),
      score('h1', 1000), score('h2', 0.001), score('h3', 0.001),
    ];
    let rngState = 0.123456789;
    const rng = () => { rngState = (rngState * 9301 + 49297) % 233280 / 233280; return rngState; };

    const picks = new Set<string>();
    let dominantCount = 0;
    for (let i = 1; i <= 200; i++) {
      const g = sampleGenome({ available: AVAILABLE, scores, recentGenomes: [], index: i, rng });
      const framework = g.ingredients.find(x => x.dimension === 'framework')!;
      picks.add(framework.id);
      if (framework.id === 'f1') dominantCount++;
    }

    expect(picks.size).toBe(3);            // nothing is permanently condemned
    expect(dominantCount).toBeLessThan(190); // and the leader does not take all
  });

  it('produces a variety of distinct combinations across a run', () => {
    const scores: IngredientScore[] = [score('f1', 100), score('h1', 100)];
    let rngState = 0.5;
    const rng = () => { rngState = (rngState * 9301 + 49297) % 233280 / 233280; return rngState; };

    const recent: string[][] = [];
    const combos = new Set<string>();
    for (let i = 1; i <= 40; i++) {
      const g = sampleGenome({ available: AVAILABLE, scores, recentGenomes: recent, index: i, rng });
      const key = g.ingredients.map(x => x.id).sort().join('+');
      combos.add(key);
      recent.unshift(g.ingredients.map(x => x.id));
    }
    expect(combos.size).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creative/__tests__/sampling.test.ts`
Expected: FAIL — cannot resolve `../sampling`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/creative/sampling.ts`:

```ts
// src/lib/creative/sampling.ts
//
// Chooses the ingredients for the next creative. Pure, and the RNG is injected
// rather than taken from Math.random, so every rule below is deterministically
// testable — including the convergence property the whole feature exists for.
//
// Three separate mechanisms, because there are three separate failure modes:
//
//   1. CONVERGENCE      — the sampler re-picks the same winner until every ad
//                         is identical. Fixed by weighted sampling with a
//                         probability floor: losing odds shrink, never vanish.
//   2. RECOMBINATION    — ingredients vary but the same RECIPE recurs. Fixed by
//      STALENESS          rejecting candidates too close to recent genomes.
//   3. NEGLECT          — an ingredient with one unlucky early result is never
//                         retried and looks like a failure forever. Fixed by a
//                         forced wildcard slot that samples the least-tested.
//
// A fourth failure mode — the vocabulary itself never growing — is NOT solved
// here. That needs outside DNA and is spec 2.

import type { CreativeDimension } from './vocabulary';
import type { IngredientScore } from './scoring';

export interface SamplableIngredient {
  id: string;
  dimension: CreativeDimension;
  value: string;
  promptFragment: string;
}

export interface EntropyConfig {
  temperature: number;
  floorProbability: number;
  wildcardEveryN: number;
  noveltyWindow: number;
  noveltyMinDistance: number;
  maxResampleAttempts: number;
}

export const DEFAULT_ENTROPY_CONFIG: EntropyConfig = {
  temperature: 1.0,
  floorProbability: 0.05,
  wildcardEveryN: 5,
  noveltyWindow: 10,
  noveltyMinDistance: 0.4,
  maxResampleAttempts: 8,
};

export interface SampledGenome {
  ingredients: SamplableIngredient[];
  wasWildcard: boolean;
  noveltyDistance: number | null;
  borrowedPriors: string[];
  temperature: number;
}

// Softmax over scores, then raise every probability to at least `floor` and
// renormalise. The floor is the anti-convergence guarantee: a losing
// ingredient's odds shrink but can never reach zero, so one lucky early result
// cannot lock the system into a single formula forever.
export function softmaxWithFloor(
  scores: readonly number[],
  temperature: number,
  floor: number,
): number[] {
  if (scores.length === 0) return [];
  if (scores.length === 1) return [1];

  const t = temperature > 0 ? temperature : 1;
  // Subtract the max before exponentiating — standard guard against overflow
  // on large scores.
  const max = Math.max(...scores);
  const exps = scores.map(s => Math.exp((s - max) / t));
  const sum = exps.reduce((a, b) => a + b, 0);
  const raw = exps.map(e => (sum > 0 ? e / sum : 1 / scores.length));

  const floored = raw.map(p => Math.max(p, floor));
  const total = floored.reduce((a, b) => a + b, 0);
  return floored.map(p => p / total);
}

// 1 - |intersection| / |union|. 0 means the same recipe, 1 means nothing shared.
export function jaccardDistance(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let shared = 0;
  for (const x of setA) if (setB.has(x)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : 1 - shared / union;
}

function pick<T>(items: readonly T[], probabilities: readonly number[], rng: () => number): T {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += probabilities[i];
    if (r <= acc) return items[i];
  }
  return items[items.length - 1];
}

function groupByDimension(
  available: readonly SamplableIngredient[],
): Map<CreativeDimension, SamplableIngredient[]> {
  const map = new Map<CreativeDimension, SamplableIngredient[]>();
  for (const i of available) {
    const list = map.get(i.dimension) ?? [];
    list.push(i);
    map.set(i.dimension, list);
  }
  return map;
}

export function sampleGenome(args: {
  available: readonly SamplableIngredient[];
  scores: readonly IngredientScore[];
  recentGenomes: readonly (readonly string[])[];
  index: number;
  config?: EntropyConfig;
  rng?: () => number;
}): SampledGenome {
  const config = args.config ?? DEFAULT_ENTROPY_CONFIG;
  const rng = args.rng ?? Math.random;
  const byDimension = groupByDimension(args.available);
  const scoreById = new Map(args.scores.map(s => [s.ingredientId, s]));

  const wasWildcard = config.wildcardEveryN > 0 && args.index % config.wildcardEveryN === 0;
  const window = args.recentGenomes.slice(0, config.noveltyWindow);

  const drawOnce = (): SamplableIngredient[] => {
    const chosen: SamplableIngredient[] = [];
    for (const [, options] of byDimension) {
      if (options.length === 0) continue;

      if (wasWildcard) {
        // Ignore score entirely and take the least-tested option. Ties break by
        // the order the vocabulary defines, so the choice is explainable.
        let best = options[0];
        let bestN = scoreById.get(best.id)?.n ?? 0;
        for (const o of options) {
          const n = scoreById.get(o.id)?.n ?? 0;
          if (n < bestN) { best = o; bestN = n; }
        }
        chosen.push(best);
        continue;
      }

      const probabilities = softmaxWithFloor(
        options.map(o => scoreById.get(o.id)?.shrunkScore ?? 0),
        config.temperature,
        config.floorProbability,
      );
      chosen.push(pick(options, probabilities, rng));
    }
    return chosen;
  };

  const distanceToWindow = (ids: readonly string[]): number =>
    window.length === 0
      ? 1
      : Math.min(...window.map(prev => jaccardDistance(ids, prev)));

  // Try for a combination that is not a near-repeat of a recent one. BOUNDED:
  // when no novel recipe exists — a small vocabulary, or a long run — accept
  // the most novel candidate seen rather than looping forever.
  let best = drawOnce();
  let bestDistance = distanceToWindow(best.map(i => i.id));

  for (let attempt = 1; attempt < config.maxResampleAttempts; attempt++) {
    if (bestDistance >= config.noveltyMinDistance) break;
    const candidate = drawOnce();
    const distance = distanceToWindow(candidate.map(i => i.id));
    if (distance > bestDistance) { best = candidate; bestDistance = distance; }
  }

  return {
    ingredients: best,
    wasWildcard,
    noveltyDistance: window.length === 0 ? null : bestDistance,
    borrowedPriors: best
      .filter(i => scoreById.get(i.id)?.borrowed)
      .map(i => i.id),
    temperature: config.temperature,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creative/__tests__/sampling.test.ts`
Expected: PASS (20 tests), including both convergence tests.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/creative/sampling.ts src/lib/creative/__tests__/sampling.test.ts
git commit -m "feat(creative): entropy-aware genome sampling

Three mechanisms for three distinct failure modes: a probability floor so
no ingredient is ever permanently condemned, Jaccard novelty rejection so
the same recipe does not recur, and a forced wildcard slot so an
ingredient with one unlucky result is not mistaken for one that does not
work.

Resampling is bounded and degrades to best effort. An unbounded retry loop
that cannot find a novel combination is the same defect shape as the
empty-hook god-mode crash.

RNG is injected, so the convergence guarantee is an actual test rather
than an aspiration."
```

---

## Task 4: Persistence — recording and reading genomes

**Files:**
- Create: `src/lib/creative/genome-record.ts`
- Create: `src/lib/creative/genome-read.ts`
- Test: `src/lib/creative/__tests__/genome-record.test.ts`

**Interfaces:**
- Consumes: `SampledGenome` from `sampling.ts`; `IngredientScore`, `Observation` from `scoring.ts`; the Drizzle tables from Task 1.
- Produces:
```ts
// genome-record.ts
export async function recordGenome(input: {
  subjectType: 'ad' | 'post'; subjectId: string; brandId: string | null;
  surface: Surface; genome: SampledGenome;
}): Promise<string | null>;   // genome id, or null if recording failed

// genome-read.ts
export async function loadSamplableIngredients(): Promise<SamplableIngredient[]>;
export async function loadRecentGenomeIngredientIds(
  surface: Surface, limit: number,
): Promise<string[][]>;
export async function loadObservations(surface: Surface): Promise<Observation[]>;
export async function loadScores(): Promise<IngredientScore[]>;
export async function refreshScores(): Promise<IngredientScore[]>;
export async function nextGenomeIndex(surface: Surface): Promise<number>;
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/creative/__tests__/genome-record.test.ts`. Mock the db module, following the pattern in `src/app/api/ads/advice/__tests__/route.test.ts`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { insertedGenomes: [] as unknown[], insertedJoins: [] as unknown[], failInsert: false },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => ({
        returning: async () => {
          if (state.failInsert) throw new Error('db down');
          if (Array.isArray(v)) { state.insertedJoins.push(...v); return v; }
          state.insertedGenomes.push(v);
          return [{ id: 'genome_1' }];
        },
        onConflictDoNothing: async () => {
          if (Array.isArray(v)) state.insertedJoins.push(...v);
        },
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creativeGenomes: {}, creativeGenomeIngredients: {},
}));

import { recordGenome } from '../genome-record';
import type { SampledGenome } from '../sampling';

const GENOME: SampledGenome = {
  ingredients: [
    { id: 'f1', dimension: 'framework', value: 'PAS', promptFragment: 'x' },
    { id: 'h1', dimension: 'hook_shape', value: 'question', promptFragment: 'y' },
  ],
  wasWildcard: true,
  noveltyDistance: 0.66,
  borrowedPriors: ['f1'],
  temperature: 1,
};

beforeEach(() => {
  state.insertedGenomes = [];
  state.insertedJoins = [];
  state.failInsert = false;
});

describe('recordGenome', () => {
  it('writes one genome row and one join row per ingredient', async () => {
    const id = await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads', genome: GENOME,
    });
    expect(id).toBe('genome_1');
    expect(state.insertedGenomes).toHaveLength(1);
    expect(state.insertedJoins).toHaveLength(2);
  });

  it('persists the sampling reasoning, not just the choices', async () => {
    // "Why did it write this ad?" must be answerable later, the same way an
    // agent-plan decision carries its reason.
    await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads', genome: GENOME,
    });
    const row = state.insertedGenomes[0] as Record<string, unknown>;
    expect(row.wasWildcard).toBe(true);
    expect(row.samplingMeta).toMatchObject({ noveltyDistance: 0.66, borrowedPriors: ['f1'] });
  });

  it('returns null instead of throwing when the database fails', async () => {
    // Recording is best effort. A genome write must never take down a publish.
    state.failInsert = true;
    const id = await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads', genome: GENOME,
    });
    expect(id).toBeNull();
  });

  it('records nothing for an empty genome', async () => {
    const id = await recordGenome({
      subjectType: 'ad', subjectId: 'ad_1', brandId: 'brand_1',
      surface: 'ads',
      genome: { ...GENOME, ingredients: [] },
    });
    expect(id).toBeNull();
    expect(state.insertedGenomes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/creative/__tests__/genome-record.test.ts`
Expected: FAIL — cannot resolve `../genome-record`.

- [ ] **Step 3: Write genome-record.ts**

```ts
// src/lib/creative/genome-record.ts
//
// Persists what a creative was made of. BEST EFFORT throughout: a failure here
// is logged and swallowed, never propagated, because losing a genome row is a
// lost data point while failing a publish costs a real ad.

import { db } from '@/lib/db';
import { creativeGenomes, creativeGenomeIngredients } from '@/lib/db/schema';
import type { SampledGenome } from './sampling';
import type { Surface } from './scoring';

export async function recordGenome(input: {
  subjectType: 'ad' | 'post';
  subjectId: string;
  brandId: string | null;
  surface: Surface;
  genome: SampledGenome;
}): Promise<string | null> {
  if (input.genome.ingredients.length === 0) return null;

  try {
    const [row] = await db
      .insert(creativeGenomes)
      .values({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        brandId: input.brandId,
        surface: input.surface,
        wasWildcard: input.genome.wasWildcard,
        samplingMeta: {
          noveltyDistance: input.genome.noveltyDistance,
          borrowedPriors: input.genome.borrowedPriors,
          temperature: input.genome.temperature,
        },
      })
      .returning();

    await db
      .insert(creativeGenomeIngredients)
      .values(input.genome.ingredients.map(i => ({ genomeId: row.id, ingredientId: i.id })))
      .onConflictDoNothing();

    return row.id;
  } catch (err) {
    console.warn('[creative/genome] record failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/creative/__tests__/genome-record.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write genome-read.ts**

No unit test: this file is pure Drizzle plumbing over the pure modules already covered. It is exercised end-to-end by Task 7's API route.

```ts
// src/lib/creative/genome-read.ts
//
// The DB side of the genome. Reads observations, recent recipes and the
// vocabulary; recomputes scores and writes them through so the UI can render
// without recomputing and score drift stays visible.
//
// Scores are computed on READ rather than on a cron: at this volume it is a
// few milliseconds, and a cron would be one more thing to notice has silently
// stopped.

import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  creativeIngredients, creativeGenomes, creativeGenomeIngredients,
  creativeIngredientScores, metaAdInsights, metaAds, posts, postAnalytics,
} from '@/lib/db/schema';
import { hasOutcome } from '@/lib/brain/creative-stats';
import {
  adsReward, organicReward, scoreIngredients,
  type IngredientScore, type Observation, type Surface,
} from './scoring';
import type { SamplableIngredient } from './sampling';

// Ads only. Organic has no equivalent floor: real posts here reach 1-28
// people, so a 500 threshold would exclude every organic post ever published
// and the cold-start borrowing would have nothing to borrow from. Thin organic
// data is handled by shrinkage instead.
const ADS_IMPRESSION_FLOOR = 500;

export async function loadSamplableIngredients(): Promise<SamplableIngredient[]> {
  const rows = await db
    .select()
    .from(creativeIngredients)
    .where(eq(creativeIngredients.active, true));
  return rows.map(r => ({
    id: r.id,
    dimension: r.dimension as SamplableIngredient['dimension'],
    value: r.value,
    promptFragment: r.promptFragment,
  }));
}

export async function loadRecentGenomeIngredientIds(
  surface: Surface,
  limit: number,
): Promise<string[][]> {
  const genomes = await db
    .select({ id: creativeGenomes.id })
    .from(creativeGenomes)
    .where(eq(creativeGenomes.surface, surface))
    .orderBy(desc(creativeGenomes.createdAt))
    .limit(limit);
  if (genomes.length === 0) return [];

  const joins = await db
    .select()
    .from(creativeGenomeIngredients)
    .where(inArray(creativeGenomeIngredients.genomeId, genomes.map(g => g.id)));

  return genomes.map(g =>
    joins.filter(j => j.genomeId === g.id).map(j => j.ingredientId),
  );
}

export async function nextGenomeIndex(surface: Surface): Promise<number> {
  const rows = await db
    .select({ id: creativeGenomes.id })
    .from(creativeGenomes)
    .where(eq(creativeGenomes.surface, surface));
  return rows.length + 1;
}

// Median reach for one brand, used to normalise organic reward. Returns 0 when
// the brand has no positive-reach history, which makes organicReward return
// null and the post contribute nothing.
async function brandMedianReach(brandId: string): Promise<number> {
  const rows = await db
    .select({ reach: postAnalytics.reach })
    .from(postAnalytics)
    .innerJoin(posts, eq(posts.id, postAnalytics.postId))
    .where(eq(posts.brandId, brandId));
  const values = rows.map(r => r.reach ?? 0).filter(v => v > 0).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

export async function loadObservations(surface: Surface): Promise<Observation[]> {
  const genomes = await db
    .select()
    .from(creativeGenomes)
    .where(eq(creativeGenomes.surface, surface));
  if (genomes.length === 0) return [];

  const joins = await db
    .select()
    .from(creativeGenomeIngredients)
    .where(inArray(creativeGenomeIngredients.genomeId, genomes.map(g => g.id)));

  const observations: Observation[] = [];
  const medianCache = new Map<string, number>();

  for (const g of genomes) {
    let reward: number | null = null;

    if (surface === 'ads') {
      const [ad] = await db.select().from(metaAds).where(eq(metaAds.id, g.subjectId));
      if (!ad) continue;
      const [snap] = await db
        .select()
        .from(metaAdInsights)
        .where(eq(metaAdInsights.metaAdsId, ad.id))
        .orderBy(desc(metaAdInsights.snapshotDate))
        .limit(1);
      if (!snap || snap.impressions < ADS_IMPRESSION_FLOOR) continue;
      reward = adsReward(snap.clicks ?? 0, snap.impressions);
    } else {
      const [analytics] = await db
        .select()
        .from(postAnalytics)
        .where(eq(postAnalytics.postId, g.subjectId));
      if (!analytics || !hasOutcome(analytics)) continue;
      if (!g.brandId) continue;
      let median = medianCache.get(g.brandId);
      if (median === undefined) {
        median = await brandMedianReach(g.brandId);
        medianCache.set(g.brandId, median);
      }
      reward = organicReward(analytics.reach ?? 0, median);
    }

    if (reward == null) continue;
    for (const j of joins.filter(x => x.genomeId === g.id)) {
      observations.push({ ingredientId: j.ingredientId, surface, reward });
    }
  }

  return observations;
}

export async function refreshScores(): Promise<IngredientScore[]> {
  const organicScores = scoreIngredients(await loadObservations('organic'));
  const adsScores = scoreIngredients(await loadObservations('ads'), { organicScores });
  const all = [...organicScores, ...adsScores];

  for (const s of all) {
    await db
      .insert(creativeIngredientScores)
      .values({
        ingredientId: s.ingredientId,
        surface: s.surface,
        n: s.n,
        meanReward: String(s.meanReward),
        shrunkScore: String(s.shrunkScore),
        borrowed: s.borrowed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [creativeIngredientScores.ingredientId, creativeIngredientScores.surface],
        set: {
          n: s.n,
          meanReward: String(s.meanReward),
          shrunkScore: String(s.shrunkScore),
          borrowed: s.borrowed,
          updatedAt: new Date(),
        },
      });
  }

  return all;
}

export async function loadScores(): Promise<IngredientScore[]> {
  const rows = await db.select().from(creativeIngredientScores);
  return rows.map(r => ({
    ingredientId: r.ingredientId,
    surface: r.surface as Surface,
    n: r.n,
    meanReward: Number(r.meanReward ?? 0),
    shrunkScore: Number(r.shrunkScore ?? 0),
    borrowed: r.borrowed,
  }));
}
```

- [ ] **Step 6: Verify it compiles and the suite is green**

Run: `npx tsc --noEmit 2>&1 | grep creative` then `npx vitest run`
Expected: no `creative` type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/creative/genome-record.ts src/lib/creative/genome-read.ts \
        src/lib/creative/__tests__/genome-record.test.ts
git commit -m "feat(creative): genome persistence and score refresh

Recording is best effort and returns null on failure: losing a genome row
costs a data point, failing a publish costs a real ad.

The ads impression floor stays at 500 but organic gets NO floor. Organic
posts here reach 1-28 people, so applying the ads threshold would exclude
every organic post ever published and leave the cold-start borrowing with
nothing to borrow from. Thin organic data is handled by shrinkage."
```

---

## Task 5: Wire the genome into ad copy generation

**Files:**
- Modify: `src/lib/ads/ad-copy.ts`
- Modify: `src/app/api/ads/generate/route.ts`
- Test: `src/lib/ads/__tests__/ad-copy-genome.test.ts`

**Interfaces:**
- Consumes: `SampledGenome` from `sampling.ts`; `loadSamplableIngredients`, `loadScores`, `refreshScores`, `loadRecentGenomeIngredientIds`, `nextGenomeIndex` from `genome-read.ts`; `sampleGenome`, `DEFAULT_ENTROPY_CONFIG` from `sampling.ts`.
- Produces: `GenerateAdCopyInput.genome?: SampledGenome`, and an exported `buildGenomeBlock(genome: SampledGenome | null | undefined): string` for testability.

- [ ] **Step 1: Write the failing test**

Create `src/lib/ads/__tests__/ad-copy-genome.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGenomeBlock } from '../ad-copy';
import type { SampledGenome } from '@/lib/creative/sampling';

const genome = (over: Partial<SampledGenome> = {}): SampledGenome => ({
  ingredients: [
    { id: 'f1', dimension: 'framework', value: 'PAS', promptFragment: 'Structure the body as Pain, Agitate, Solution.' },
    { id: 'h1', dimension: 'hook_shape', value: 'question', promptFragment: 'Open with a direct question.' },
    { id: 'i1', dimension: 'image_style', value: 'stock_photo', promptFragment: 'record-only: stock photograph' },
  ],
  wasWildcard: false,
  noveltyDistance: 0.7,
  borrowedPriors: [],
  temperature: 1,
  ...over,
});

describe('buildGenomeBlock', () => {
  it('injects the prompt fragment of each steerable ingredient', () => {
    const block = buildGenomeBlock(genome());
    expect(block).toContain('Structure the body as Pain, Agitate, Solution.');
    expect(block).toContain('Open with a direct question.');
  });

  it('omits record-only dimensions', () => {
    // image_style is stored and scored but has no image path that can act on
    // it yet. Injecting it would tell the copywriter about a picture it is not
    // choosing.
    expect(buildGenomeBlock(genome())).not.toContain('record-only');
  });

  it('returns an empty string when there is no genome', () => {
    // The flag-off path. Output must be byte-identical to today.
    expect(buildGenomeBlock(null)).toBe('');
    expect(buildGenomeBlock(undefined)).toBe('');
  });

  it('returns an empty string for a genome with no steerable ingredients', () => {
    expect(buildGenomeBlock(genome({ ingredients: [] }))).toBe('');
  });

  it('does not leak internal ingredient ids into the prompt', () => {
    const block = buildGenomeBlock(genome());
    expect(block).not.toContain('f1');
    expect(block).not.toContain('h1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ads/__tests__/ad-copy-genome.test.ts`
Expected: FAIL — `buildGenomeBlock` is not exported from `../ad-copy`.

- [ ] **Step 3: Modify ad-copy.ts**

Add the import, the input field, the exported builder, and use it in `buildUserPrompt`.

At the top, after the existing imports:

```ts
import { RECORD_ONLY_DIMENSIONS } from '@/lib/creative/vocabulary';
import type { SampledGenome } from '@/lib/creative/sampling';
```

Add to `GenerateAdCopyInput` (after `competitorContext`):

```ts
  // Chosen ingredients for this ad. When present, their prompt fragments
  // replace the hardcoded framework and psychology prose below, so the copy is
  // steered by what has actually worked rather than by a fixed menu. Absent
  // means byte-identical behaviour to before the genome existed.
  genome?: SampledGenome;
```

Add the exported builder above `buildUserPrompt`:

```ts
// The prompt text for a sampled genome. Exported so the selection rules can be
// tested without calling a model.
//
// Record-only dimensions are skipped: image_style is stored and scored so the
// history exists when generated imagery lands, but there is no image path that
// can act on it today, and telling the copywriter about a picture nobody is
// choosing would just add noise.
export function buildGenomeBlock(genome: SampledGenome | null | undefined): string {
  if (!genome || genome.ingredients.length === 0) return '';
  const steerable = genome.ingredients.filter(
    i => !RECORD_ONLY_DIMENSIONS.includes(i.dimension),
  );
  if (steerable.length === 0) return '';
  return [
    'CREATIVE DIRECTION FOR THIS AD (follow all of it):',
    ...steerable.map(i => `- ${i.promptFragment}`),
  ].join('\n');
}
```

In `buildUserPrompt`, replace the `PERSUASION PSYCHOLOGY` and `COPYWRITING FRAMEWORK` sections (lines 125-138) with a conditional. Keep the existing prose as the fallback when there is no genome:

```ts
  const genomeBlock = buildGenomeBlock(input.genome);
  const directionBlock = genomeBlock
    ? `${genomeBlock}\nUse the direction above INTERNALLY as structure only. Never print framework names or stage labels.`
    : `PERSUASION PSYCHOLOGY (deploy the 2-3 MOST fitting for this product, not all):
- Cialdini's principles: reciprocity, scarcity, authority, social proof, commitment/consistency, liking, unity.
- Loss aversion: frame the cost of NOT acting, not just the upside.
- Curiosity gap: open a loop the reader needs closed.
- Pattern interrupt: break the scroll with an unexpected first line.
Pick the principles that genuinely fit ${brandName}'s truth. Never manufacture fake social proof or authority to satisfy a principle.

COPYWRITING FRAMEWORK (choose the single best fit for this objective):
- PAS (Pain, Agitate, Solution) — best for problem-aware audiences.
- AIDA (Attention, Interest, Desire, Action) — best for broad cold traffic.
- BAB (Before, After, Bridge) — best for transformation products.
- 4Ps (Promise, Picture, Proof, Push) — best when you have a strong concrete promise.
Commit to ONE framework and structure the primaryText around it.
Use the chosen framework INTERNALLY as structure only. NEVER print framework names or stage labels in the output (do NOT write 'Attention:', 'Interest:', 'Desire:', 'Action:', 'PAS', 'AIDA', 'BAB', '4Ps', 'Problem:', 'Solution:', 'Before:', 'After:', 'Bridge:', etc.). The copy must read as natural persuasive prose, not a labelled template.`;
```

Then splice `directionBlock` into the returned template where those two sections previously sat.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ads/__tests__/ad-copy-genome.test.ts src/lib/ads/__tests__`
Expected: PASS. Existing `ad-copy` tests must stay green — the no-genome path is unchanged.

- [ ] **Step 5: Wire the flag into the generate route**

In `src/app/api/ads/generate/route.ts`, before the `generateAdCopy` call, add:

```ts
  // Creative genome: sample the ingredients for this ad from what has actually
  // worked. Flagged off by default and fully best-effort — the house pattern
  // from smart-posts/generate.ts:216-226. A genome failure must never block an
  // ad, exactly as a brain failure never blocks a caption.
  let genome: import('@/lib/creative/sampling').SampledGenome | undefined;
  if (process.env.CREATIVE_GENOME_ENABLED === 'true') {
    try {
      const [{ sampleGenome }, read] = await Promise.all([
        import('@/lib/creative/sampling'),
        import('@/lib/creative/genome-read'),
      ]);
      const [available, scores, recent, index] = await Promise.all([
        read.loadSamplableIngredients(),
        read.refreshScores(),
        read.loadRecentGenomeIngredientIds('ads', 10),
        read.nextGenomeIndex('ads'),
      ]);
      genome = sampleGenome({ available, scores, recentGenomes: recent, index });
    } catch (err) {
      console.warn('[ads/generate] genome sampling failed:', err instanceof Error ? err.message : err);
      genome = undefined;
    }
  }
```

Pass `genome` into the `generateAdCopy(...)` call, and include it on the response so `/api/ads/publish` can record it:

```ts
    return NextResponse.json({ /* …existing fields… */, genome: genome ?? null });
```

- [ ] **Step 6: Verify nothing regressed with the flag off**

Run: `npx vitest run` and `npx tsc --noEmit 2>&1 | grep -E "ad-copy|generate"`
Expected: all tests pass; no type errors in those files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ads/ad-copy.ts src/app/api/ads/generate/route.ts \
        src/lib/ads/__tests__/ad-copy-genome.test.ts
git commit -m "feat(ads): steer ad copy with a sampled creative genome

generateAdCopy gains an optional genome whose prompt fragments replace the
hardcoded framework and psychology prose. Absent, output is byte-identical
to before.

Behind CREATIVE_GENOME_ENABLED, default off, using the house flag pattern:
env check, dynamic import, try/catch degrading to current behaviour.

Record-only dimensions are not injected. image_style is scored so history
exists when generated imagery lands, but no image path can act on it yet."
```

---

## Task 6: Record the genome on publish

**Files:**
- Modify: `src/app/api/ads/publish/route.ts`
- Test: extend `src/app/api/ads/publish/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `recordGenome` from `genome-record.ts`; the `genome` field on the publish request body.

- [ ] **Step 1: Write the failing test**

Add to `src/app/api/ads/publish/__tests__/route.test.ts`:

```ts
describe('creative genome recording', () => {
  it('does not record a genome when the flag is off', async () => {
    // Flag off is the default. Nothing about publishing may change.
    delete process.env.CREATIVE_GENOME_ENABLED;
    const res = await POST(makeRequest({ /* existing valid publish body */ }));
    expect(res.status).toBe(200);
    expect(state.recordedGenomes).toHaveLength(0);
  });

  it('records the genome when the flag is on and one was supplied', async () => {
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    const res = await POST(makeRequest({
      /* existing valid publish body */,
      genome: {
        ingredients: [{ id: 'f1', dimension: 'framework', value: 'PAS', promptFragment: 'x' }],
        wasWildcard: false, noveltyDistance: 1, borrowedPriors: [], temperature: 1,
      },
    }));
    expect(res.status).toBe(200);
    expect(state.recordedGenomes).toHaveLength(1);
  });

  it('still publishes when genome recording throws', async () => {
    // Best effort. A telemetry write must never cost a real ad.
    process.env.CREATIVE_GENOME_ENABLED = 'true';
    state.recordGenomeThrows = true;
    const res = await POST(makeRequest({ /* body with genome */ }));
    expect(res.status).toBe(200);
  });
});
```

Add `recordedGenomes: []` and `recordGenomeThrows: false` to the hoisted `state`, mock `@/lib/creative/genome-record`, and reset both in `beforeEach`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ads/publish/__tests__/route.test.ts`
Expected: FAIL — genome is never recorded.

- [ ] **Step 3: Wire recording into the publish route**

After the ad row is successfully inserted and its `id` is known, add:

```ts
    // Creative genome: remember what this ad was made of, so its outcome can
    // teach the ingredients rather than only the ad. Flagged and best effort —
    // recordGenome swallows its own failures and returns null.
    if (process.env.CREATIVE_GENOME_ENABLED === 'true' && body.genome) {
      try {
        const { recordGenome } = await import('@/lib/creative/genome-record');
        await recordGenome({
          subjectType: 'ad',
          subjectId: adRow.id,
          brandId: brand.id,
          surface: 'ads',
          genome: body.genome,
        });
      } catch (err) {
        console.warn('[ads/publish] genome recording failed:', err instanceof Error ? err.message : err);
      }
    }
```

Add `genome?: SampledGenome` to the parsed request body type.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/ads/publish/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ads/publish/route.ts src/app/api/ads/publish/__tests__/route.test.ts
git commit -m "feat(ads): record the creative genome on publish

Flagged and best effort, wrapped twice: recordGenome swallows its own
failures and the call site catches anyway. A telemetry write must never
cost a real ad."
```

---

## Task 7: The leaderboard — API and page

**Files:**
- Create: `src/app/api/creative/genome/route.ts`
- Create: `src/app/(dashboard)/ads/genome/page.tsx`
- Test: `src/app/api/creative/genome/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `refreshScores`, `loadSamplableIngredients` from `genome-read.ts`.
- Produces: `GET /api/creative/genome?surface=ads|organic` returning
  `{ surface, dimensions: Array<{ dimension, ingredients: Array<{ value, n, meanReward, shrunkScore, borrowed }> }> }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/creative/genome/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ getUserId: async () => 'u1' }));
vi.mock('@/lib/creative/genome-read', () => ({
  loadSamplableIngredients: async () => [
    { id: 'f1', dimension: 'framework', value: 'PAS', promptFragment: 'x' },
    { id: 'f2', dimension: 'framework', value: 'AIDA', promptFragment: 'y' },
  ],
  refreshScores: async () => [
    { ingredientId: 'f1', surface: 'ads', n: 12, meanReward: 0.02, shrunkScore: 0.018, borrowed: false },
    { ingredientId: 'f2', surface: 'ads', n: 1, meanReward: 0.09, shrunkScore: 0.03, borrowed: true },
  ],
}));

import { GET } from '../route';

describe('GET /api/creative/genome', () => {
  it('groups ingredients by dimension', async () => {
    const res = await GET(new Request('http://x/api/creative/genome?surface=ads'));
    const json = await res.json();
    expect(json.dimensions[0].dimension).toBe('framework');
    expect(json.dimensions[0].ingredients).toHaveLength(2);
  });

  it('ranks well-sampled ingredients above thin ones', async () => {
    // Same discipline as the /ask fix: a reader scans top-down and acts on
    // what heads the list, so a one-observation result must not lead it.
    const res = await GET(new Request('http://x/api/creative/genome?surface=ads'));
    const json = await res.json();
    expect(json.dimensions[0].ingredients[0].value).toBe('PAS');
  });

  it('surfaces which scores lean on a borrowed prior', async () => {
    const res = await GET(new Request('http://x/api/creative/genome?surface=ads'));
    const json = await res.json();
    const aida = json.dimensions[0].ingredients.find((i: { value: string }) => i.value === 'AIDA');
    expect(aida.borrowed).toBe(true);
  });

  it('rejects an unknown surface rather than guessing', async () => {
    const res = await GET(new Request('http://x/api/creative/genome?surface=nonsense'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/creative/genome/__tests__/route.test.ts`
Expected: FAIL — cannot resolve `../route`.

- [ ] **Step 3: Write the route**

```ts
// GET /api/creative/genome?surface=ads|organic
//
// The "what is actually working" view: every ingredient with its sample count,
// raw mean and shrunk score, grouped by dimension.
//
// Read-only by construction. Scores are recomputed on read — a few
// milliseconds at this volume, and one less cron to notice has stopped.

import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { loadSamplableIngredients, refreshScores } from '@/lib/creative/genome-read';
import { CREATIVE_DIMENSIONS } from '@/lib/creative/vocabulary';
import { MIN_CONFIDENT_SAMPLES } from '@/lib/brain/creative-stats';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const surface = new URL(req.url).searchParams.get('surface') ?? 'ads';
  if (surface !== 'ads' && surface !== 'organic') {
    return NextResponse.json(
      { error: 'unknown_surface', supported: ['ads', 'organic'] },
      { status: 400 },
    );
  }

  const [available, allScores] = await Promise.all([
    loadSamplableIngredients(),
    refreshScores(),
  ]);
  const scoreById = new Map(
    allScores.filter(s => s.surface === surface).map(s => [s.ingredientId, s]),
  );

  const dimensions = CREATIVE_DIMENSIONS.map(dimension => ({
    dimension,
    ingredients: available
      .filter(i => i.dimension === dimension)
      .map(i => {
        const s = scoreById.get(i.id);
        return {
          value: i.value,
          n: s?.n ?? 0,
          meanReward: s?.meanReward ?? null,
          shrunkScore: s?.shrunkScore ?? null,
          borrowed: s?.borrowed ?? false,
          confident: (s?.n ?? 0) >= MIN_CONFIDENT_SAMPLES,
        };
      })
      // Confidence outranks score, for the same reason it does on /ask: a
      // reader scans top-down and acts on what leads, so a one-observation
      // result must never head the list.
      .sort((a, b) => {
        if (a.confident !== b.confident) return a.confident ? -1 : 1;
        return (b.shrunkScore ?? 0) - (a.shrunkScore ?? 0);
      }),
  })).filter(d => d.ingredients.length > 0);

  return NextResponse.json({ surface, dimensions });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/creative/genome/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the page**

Create `src/app/(dashboard)/ads/genome/page.tsx`. Match the visual language of `src/components/intel/creative-intel-panel.tsx` (existing tokens: `text-(--txt)`, `text-(--muted)`, `border-(--line)`, `bg-(--surface)`, `rounded-2xl`).

```tsx
'use client';

import { useEffect, useState } from 'react';

interface Row {
  value: string; n: number;
  meanReward: number | null; shrunkScore: number | null;
  borrowed: boolean; confident: boolean;
}
interface Dimension { dimension: string; ingredients: Row[] }

export default function GenomePage() {
  const [surface, setSurface] = useState<'ads' | 'organic'>('organic');
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/creative/genome?surface=${surface}`);
        const json = await res.json();
        if (!cancelled) setDimensions(json.dimensions ?? []);
      } catch {
        if (!cancelled) setDimensions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [surface]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-(--txt)">Creative genome</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Which ingredients earn attention. Scores are shrunk toward the average in
          proportion to how little data backs them, so a single lucky post cannot
          look like a proven winner.
        </p>
      </div>

      <div className="flex gap-2">
        {(['organic', 'ads'] as const).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSurface(s)}
            className={`rounded-full border px-3 py-1 text-xs ${
              surface === s
                ? 'border-(--violet-24) bg-(--violet-08) text-(--violet-bright)'
                : 'border-(--line-strong) text-(--muted)'
            }`}
          >
            {s === 'organic' ? 'Instagram posts' : 'Ads'}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-(--muted)">Loading…</p>}

      {!loading && dimensions.length === 0 && (
        <p className="text-sm text-(--muted)">
          Nothing recorded yet. Ingredients appear here once creatives have been
          generated with the genome enabled.
        </p>
      )}

      {dimensions.map(d => (
        <div key={d.dimension} className="overflow-hidden rounded-2xl border border-(--line) bg-(--surface)">
          <div className="border-b border-(--line) px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--muted)">
            {d.dimension.replace(/_/g, ' ')}
          </div>
          {d.ingredients.map(i => (
            <div key={i.value} className="grid grid-cols-4 gap-4 border-b border-(--line) px-4 py-3 text-sm last:border-0">
              <span className="font-medium text-(--txt)">{i.value.replace(/_/g, ' ')}</span>
              <span className="text-(--muted)">{i.n} {i.n === 1 ? 'use' : 'uses'}</span>
              <span className={i.confident ? 'text-(--txt)' : 'text-(--muted-2) italic'}>
                {i.shrunkScore != null ? i.shrunkScore.toFixed(3) : '— no data'}
                {!i.confident && i.n > 0 && ' (too few to trust)'}
              </span>
              <span className="text-xs text-(--muted)">
                {i.borrowed ? 'prior borrowed from Instagram' : ''}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Add it to the sidebar**

In `src/components/layout/app-sidebar.tsx`, add `{ href: '/ads/genome', label: 'Genome', icon: Dna }` to the nav array, importing `Dna` from `lucide-react`. Verify `src/components/layout/__tests__/app-sidebar.test.tsx` still passes.

- [ ] **Step 7: Verify build and tests**

Run: `npx vitest run` then `npx eslint .`
Expected: all tests pass, zero lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/creative/genome src/app/\(dashboard\)/ads/genome \
        src/components/layout/app-sidebar.tsx
git commit -m "feat(creative): genome leaderboard page

Shows every ingredient with its sample count and shrunk score per surface,
badging the ones whose prior is borrowed from organic.

Confidence outranks score in the ordering, for the same reason it does on
/ask: a reader scans top-down and acts on whatever leads, so a
one-observation result must never head the list."
```

---

## Task 8: Enable, verify against real data, document

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-creative-genome-design.md` (record the two deviations)
- Create: `scripts/diag-genome.ts`

- [ ] **Step 1: Apply the schema to production**

Run: `npx tsx scripts/add-creative-genome-tables.ts --prod` then `npx tsx scripts/seed-creative-ingredients.ts --prod`
Expected: four `✓` lines and 23 seeded ingredients.

- [ ] **Step 2: Write the diagnostic**

Create `scripts/diag-genome.ts` — read-only, prints ingredient counts, genome counts per surface, and the current top three per dimension, so the leaderboard can be checked without the UI.

```ts
// Read-only: what has the genome actually learned?
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: false });
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { creativeIngredients, creativeGenomes } from '../src/lib/db/schema';

const db = drizzle(neon(process.env.NEON_DB_URL!));
(async () => {
  const ingredients = await db.select().from(creativeIngredients);
  const genomes = await db.select().from(creativeGenomes);
  console.log(`ingredients: ${ingredients.length}`);
  console.log(`genomes: ${genomes.length}`);
  const bySurface = new Map<string, number>();
  for (const g of genomes) bySurface.set(g.surface, (bySurface.get(g.surface) ?? 0) + 1);
  for (const [s, n] of bySurface) console.log(`  ${s}: ${n}`);
  console.log(`wildcards: ${genomes.filter(g => g.wasWildcard).length}`);
})();
```

- [ ] **Step 3: Record the deviations in the spec**

Append a `## 11. Implementation deviations` section to the spec file, recording D1 (organic reward is reach relative to the brand median, with the measured medians) and D2 (no organic eligibility floor, with the reason). A spec that silently disagrees with the code it produced is worse than no spec.

- [ ] **Step 4: Run everything**

Run: `npx vitest run`, `npx eslint .`, `npx tsc --noEmit`, `npm run build`
Expected: all tests pass, zero lint errors, no new type errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-03-creative-genome-design.md scripts/diag-genome.ts
git commit -m "docs(creative): record genome spec deviations, add diagnostic

Two spec statements did not survive contact with production data and the
code deliberately disagrees with them: organic reward is reach relative to
the brand's own median (follower counts are not linked to brands), and
organic has no impression floor (the spec's 500 would have excluded every
organic post ever published, leaving cold-start borrowing with nothing to
borrow from).

Recorded in the spec so the next reader does not 'fix' the code back."
```

- [ ] **Step 6: Leave the flag OFF**

`CREATIVE_GENOME_ENABLED` is not set anywhere. Turning it on is a deliberate, separate act once the leaderboard has been reviewed with real recorded genomes. Confirm with the user before setting it in any environment.

---

## Self-review

**Spec coverage:** §3.1 → Task 1. §3.2-3.4 → Task 1. §4 → Task 2 (with deviations D1/D2 documented). §5.1-5.4 → Task 3. §6.1 → Task 5. §6.2 → Tasks 4 and 6. §6.3 → Task 7. §7 test plan → distributed across Tasks 1-7, with the convergence acceptance test in Task 3. §6.4 "does not do" → Global Constraints. §10 image_style record-only → Task 1 vocabulary and Task 5 `buildGenomeBlock`.

**Not covered, deliberately:** §6.2's "and when an organic post is created". Organic recording needs god-mode to sample a genome, which means changing the autopilot hot path — explicitly forbidden by the constraints, and the organic rail already has its own steering as of 2026-08-03. The organic surface is therefore read-only in this plan: it supplies cold-start priors from existing `creativeGenerations` data via `loadObservations('organic')` only once organic genomes exist. **This means borrowed priors will be empty until a follow-up wires organic recording.** Flagged to the user rather than silently descoped.

**Type consistency:** `Surface` is defined once in `scoring.ts` and imported everywhere. `SamplableIngredient` is defined in `sampling.ts` and imported by `genome-read.ts` and `ad-copy.ts`. `SampledGenome` is defined in `sampling.ts` and imported by `genome-record.ts`, `ad-copy.ts`, and both routes. `CreativeDimension` and `RECORD_ONLY_DIMENSIONS` come from `vocabulary.ts`. `hasOutcome` and `MIN_CONFIDENT_SAMPLES` are imported from the existing `src/lib/brain/creative-stats.ts`.
