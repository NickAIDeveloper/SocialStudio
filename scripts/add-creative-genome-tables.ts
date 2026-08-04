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
