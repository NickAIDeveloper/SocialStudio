// Creates creative_generations — one row per generation attempt, recording the
// INPUTS behind a creative so the brain can learn which hook shapes, image
// sources and angles correlate with reach (M2).
//
// Purely additive: a NEW table, no change to any existing one, so nothing that
// currently works can be affected. postId is nullable because a discarded
// best-of-N candidate never becomes a post — and what we reject is as
// informative as what we ship.
//
// New tables must be pushed manually; CI will not create them.
// Run: npx tsx scripts/add-creative-generations-table.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);

  await sql`
    CREATE TABLE IF NOT EXISTS creative_generations (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id           uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      post_id            uuid REFERENCES posts(id) ON DELETE CASCADE,
      surface            varchar(32) NOT NULL,
      model              varchar(64),
      angle              varchar(20),
      hook_pattern       varchar(24),
      hook_text          text,
      content_type       varchar(20),
      overlay_style      varchar(20),
      image_provider     varchar(24),
      image_query        text,
      grade_score        integer,
      discarded_reason   varchar(48),
      god_mode_fell_back boolean NOT NULL DEFAULT false,
      created_at         timestamp NOT NULL DEFAULT now()
    )`;
  console.log('✓ creative_generations');

  // Reads are always "this brand, recently" and "join to this post's outcomes".
  await sql`CREATE INDEX IF NOT EXISTS creative_generations_brand_created_idx
            ON creative_generations (brand_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS creative_generations_post_idx
            ON creative_generations (post_id)`;
  console.log('✓ indexes');

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'creative_generations'
    ORDER BY ordinal_position`;
  console.log(`\nVerified ${cols.length} columns:`);
  for (const c of cols) {
    console.log(`  ${String(c.column_name).padEnd(19)} ${String(c.data_type).padEnd(28)} nullable=${c.is_nullable}`);
  }
})();
