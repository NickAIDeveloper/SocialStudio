// One-shot migration: add posts.image_hash column for perceptual-hash
// no-reuse dedup. Idempotent — safe to run multiple times.
//
// Run from project root:
//   npx tsx scripts/add-image-hash-column.ts
//
// Reads NEON_DB_URL from .env.local.

import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: false });

import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.NEON_DB_URL;
if (!dbUrl) {
  console.error('NEON_DB_URL missing from env.');
  process.exit(1);
}

const sql = neon(dbUrl);

(async () => {
  console.log('Adding posts.image_hash column (idempotent)...');
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_hash text`;
  console.log('Done. Column added or already present.');

  // Report current coverage so we know how much lazy backfill has to do.
  const [{ total, hashed }] = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(image_hash)::int AS hashed
    FROM posts
    WHERE source_image_url IS NOT NULL
  `) as Array<{ total: number; hashed: number }>;

  console.log(`Coverage: ${hashed} of ${total} posts have image_hash`);
  if (total > hashed) {
    console.log(
      `${total - hashed} posts will be lazily backfilled (up to 6 per autopilot run).`,
    );
  }
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
