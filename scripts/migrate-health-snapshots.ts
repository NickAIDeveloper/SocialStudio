// One-off migration to add the health_score_snapshots table.
// Run with: npx tsx scripts/migrate-health-snapshots.ts
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.NEON_DB_URL;
  if (!url) {
    throw new Error('NEON_DB_URL is not set. Load env or pass it when invoking the script.');
  }
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS health_score_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
      date_key varchar(10) NOT NULL,
      health_score integer NOT NULL,
      recorded_at timestamp NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS health_snapshot_user_date_idx
    ON health_score_snapshots(user_id, date_key DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS health_snapshot_user_brand_date_idx
    ON health_score_snapshots(user_id, brand_id, date_key DESC)
  `;

  // eslint-disable-next-line no-console
  console.log('health_score_snapshots table is ready.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
