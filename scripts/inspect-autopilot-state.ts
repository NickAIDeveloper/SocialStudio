import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: false });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, desc } from 'drizzle-orm';
import { users, brands, autopilotSettings, posts } from '../src/lib/db/schema';

const email = process.argv[2] ?? 'origae@socialstudio.app';

const sql = neon(process.env.NEON_DB_URL!);
const db = drizzle(sql);

(async () => {
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) {
    console.error('user not found');
    process.exit(1);
  }
  const ownedBrands = await db.select().from(brands).where(eq(brands.userId, u.id));

  for (const brand of ownedBrands) {
    console.log(`\n=== ${brand.slug} (id=${brand.id}) ===`);
    const [s] = await db
      .select()
      .from(autopilotSettings)
      .where(eq(autopilotSettings.brandId, brand.id))
      .limit(1);
    if (!s) {
      console.log('  no autopilotSettings row');
      continue;
    }
    console.log('  enabled:        ', s.enabled);
    console.log('  mode:           ', s.mode);
    console.log('  frequency:      ', s.frequency);
    console.log('  lastRunAt:      ', s.lastRunAt?.toISOString() ?? '<null>');
    console.log('  nextRunAt:      ', s.nextRunAt?.toISOString() ?? '<null>');
    console.log('  lastError:      ', s.lastError ?? '<null>');
    console.log('  updatedAt:      ', s.updatedAt?.toISOString() ?? '<null>');
    console.log('  totalGenerated: ', s.totalGenerated);

    // also count posts created in the last 7 days for this brand (to see if
    // anything is making it through despite the error)
    const recent = await db
      .select({ id: posts.id, source: posts.source, status: posts.status, createdAt: posts.createdAt, src: posts.sourceImageUrl })
      .from(posts)
      .where(eq(posts.brandId, brand.id))
      .orderBy(desc(posts.createdAt))
      .limit(10);
    console.log('  recent posts (most recent 10):');
    for (const p of recent) {
      console.log(`    ${p.createdAt?.toISOString() ?? '?'}  source=${p.source ?? '?'}  status=${p.status}  src=${(p.src ?? '<null>').slice(0, 60)}`);
    }
  }
})();
