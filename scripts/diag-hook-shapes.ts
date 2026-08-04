// Read-only: recent hooks per brand with their structural shape, so the effect
// of hook-shape steering on autopilot is measurable rather than assumed.
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: false });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { desc, eq } from 'drizzle-orm';
import { posts, brands } from '../src/lib/db/schema';
import { classifyHookPattern } from '../src/lib/brain/creative-stats';

const sql = neon(process.env.NEON_DB_URL!);
const db = drizzle(sql);

(async () => {
  const allBrands = await db.select().from(brands);
  for (const b of allBrands) {
    const rows = await db
      .select({ at: posts.createdAt, hook: posts.hookText, status: posts.status, source: posts.source })
      .from(posts)
      .where(eq(posts.brandId, b.id))
      .orderBy(desc(posts.createdAt))
      .limit(12);
    if (rows.length === 0) continue;

    const counts = new Map<string, number>();
    for (const r of rows) {
      const shape = classifyHookPattern(r.hook);
      counts.set(shape, (counts.get(shape) ?? 0) + 1);
    }
    const share = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s} ${Math.round((n / rows.length) * 100)}%`)
      .join('  ');

    console.log(`\n=== ${b.slug} — last ${rows.length} posts ===`);
    console.log(`shape mix: ${share}`);
    for (const r of rows) {
      console.log(
        `  ${r.at?.toISOString().slice(0, 16)}  ${(classifyHookPattern(r.hook) as string).padEnd(10)} ${r.status.padEnd(9)} ${(r.hook ?? '').slice(0, 60)}`,
      );
    }
  }
})();
