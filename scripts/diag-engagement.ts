// Read-only: does organic engagement have enough resolution to learn from?
import 'dotenv/config';
import { config } from 'dotenv';
const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { brands, posts, postAnalytics } from '../src/lib/db/schema';

const db = drizzle(neon(process.env.NEON_DB_URL!));
const stat = (v: number[]) => {
  if (!v.length) return 'n=0';
  const s = [...v].sort((a, b) => a - b);
  const nz = v.filter(x => x > 0).length;
  return `n=${v.length} min=${s[0]} med=${s[Math.floor(s.length/2)]} max=${s[s.length-1]} nonzero=${nz}/${v.length}`;
};
(async () => {
  console.log(`DB: ${useProd ? 'PRODUCTION' : 'dev'}`);
  for (const b of await db.select().from(brands)) {
    const rows = await db
      .select({ reach: postAnalytics.reach, views: postAnalytics.views, likes: postAnalytics.likes,
                comments: postAnalytics.comments, shares: postAnalytics.shares, saves: postAnalytics.saves })
      .from(postAnalytics).innerJoin(posts, eq(posts.id, postAnalytics.postId))
      .where(eq(posts.brandId, b.id));
    if (!rows.length) continue;
    console.log(`\n${b.slug}`);
    console.log(`  reach    ${stat(rows.map(r => r.reach ?? 0))}`);
    console.log(`  views    ${stat(rows.map(r => r.views ?? 0))}`);
    console.log(`  likes    ${stat(rows.map(r => r.likes ?? 0))}`);
    console.log(`  comments ${stat(rows.map(r => r.comments ?? 0))}`);
    console.log(`  shares   ${stat(rows.map(r => r.shares ?? 0))}`);
    console.log(`  saves    ${stat(rows.map(r => r.saves ?? 0))}`);
  }
})();
