// Read-only: why did recent posts fail to publish?
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: false });
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { desc, eq } from 'drizzle-orm';
import { posts, brands } from '../src/lib/db/schema';

const db = drizzle(neon(process.env.NEON_DB_URL!));
(async () => {
  const bs = await db.select().from(brands);
  const m = new Map(bs.map(b => [b.id, b.slug]));
  const rows = await db.select().from(posts).where(eq(posts.status, 'failed'))
    .orderBy(desc(posts.createdAt)).limit(10);
  console.log(`${rows.length} failed posts:\n`);
  for (const r of rows) {
    console.log(`${r.createdAt?.toISOString().slice(0, 16)}  ${m.get(r.brandId)}`);
    console.log(`   hook:   ${(r.hookText ?? '').slice(0, 60)}`);
    console.log(`   reason: ${(r.failureReason ?? '(none recorded)').slice(0, 200)}\n`);
  }
})();
