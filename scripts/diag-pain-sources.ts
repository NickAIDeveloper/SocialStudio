// Read-only: which community is each brand researched against, and what pains
// are currently feeding generation? Pass --prod to inspect production.
import 'dotenv/config';
import { config } from 'dotenv';
const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { brands, brandPainPoints } from '../src/lib/db/schema';

const db = drizzle(neon(process.env.NEON_DB_URL!));
(async () => {
  console.log(`DB: ${useProd ? 'PRODUCTION' : 'dev'}`);
  const bs = await db.select().from(brands);
  const m = new Map(bs.map(b => [b.id, b.slug]));
  console.log(`brands: ${bs.map(b => b.slug).join(', ')}`);
  const rows = await db.select().from(brandPainPoints);
  console.log(`pain rows: ${rows.length}`);
  for (const r of rows) {
    const ranked = (r.ranked as Array<{ theme: string; mentions: number; trusted: boolean }> | null) ?? [];
    const trusted = ranked.filter(p => p.trusted);
    console.log(`\n  BRAND=${m.get(r.brandId) ?? r.brandId}  source=${r.source}  fetched=${r.fetchedAt?.toISOString().slice(0, 10)}`);
    console.log(`  feeding generation (trusted only): ${trusted.length ? trusted.map(p => `${p.theme} (${p.mentions}x)`).join('; ') : '(none)'}`);
  }
})();
