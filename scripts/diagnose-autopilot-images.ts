// Standalone diagnostic for the autopilot "no_images" failure.
// Run: npx tsx scripts/diagnose-autopilot-images.ts <email>
// Uses local .env.local (must contain NEON_DB_URL + ENCRYPTION_KEY).
//
// Reports for the user's brands:
//   - which providers (pixabay/unsplash/pexels) are linked
//   - whether the stored token decrypts with current ENCRYPTION_KEY
//   - whether a live Pixabay search returns results (and how many overlap
//     the brand's all-time used-image set used by autopilot's no-reuse filter)

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: false });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq, desc } from 'drizzle-orm';
import { users, brands, linkedAccounts, posts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';
import { searchImages as pixabaySearch, suggestedQueries, brandCategories } from '../src/lib/pixabay';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/diagnose-autopilot-images.ts <email>');
  process.exit(1);
}

const dbUrl = process.env.NEON_DB_URL;
if (!dbUrl) {
  console.error('NEON_DB_URL missing from env.');
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY) {
  console.error('ENCRYPTION_KEY missing from env.');
  process.exit(1);
}

const sql = neon(dbUrl);
const db = drizzle(sql);

const PROVIDERS = ['pixabay', 'unsplash', 'pexels'] as const;

function line(s = '') {
  console.log(s);
}

(async () => {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No user found for email: ${email}`);
    process.exit(2);
  }
  line(`User: ${user.email} (id=${user.id})`);
  line();

  // Provider state — user-scoped (single lookup per provider, reused across brands).
  line('PROVIDER STATE');
  line('==============');
  const providerKeys: Record<string, string | null> = {};
  for (const provider of PROVIDERS) {
    const [account] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, user.id), eq(linkedAccounts.provider, provider)))
      .limit(1);

    if (!account) {
      line(`  ${provider.padEnd(10)} not_connected (no row in linked_accounts)`);
      providerKeys[provider] = null;
      continue;
    }
    if (!account.accessToken) {
      line(`  ${provider.padEnd(10)} row_exists_but_no_token`);
      providerKeys[provider] = null;
      continue;
    }
    try {
      const key = decrypt(account.accessToken);
      providerKeys[provider] = key;
      line(`  ${provider.padEnd(10)} connected, decrypt OK (key length=${key.length})`);
    } catch (err) {
      providerKeys[provider] = null;
      const msg = err instanceof Error ? err.message : String(err);
      line(`  ${provider.padEnd(10)} DECRYPT FAILED -- ${msg}`);
      line(`              -> ENCRYPTION_KEY likely rotated since this token was stored.`);
    }
  }
  line();

  // Brands owned by this user.
  const ownedBrands = await db.select().from(brands).where(eq(brands.userId, user.id));
  if (ownedBrands.length === 0) {
    line('No brands for this user.');
    return;
  }

  line(`BRANDS (${ownedBrands.length})`);
  line('======');

  for (const brand of ownedBrands) {
    line();
    line(`-- ${brand.slug} (id=${brand.id}) --`);

    // No-reuse set — same query as generate.ts:447-459.
    const allImageRows = await db
      .select({ src: posts.sourceImageUrl, processed: posts.processedImageUrl })
      .from(posts)
      .where(eq(posts.brandId, brand.id));

    const usedUrls = new Set<string>();
    for (const r of allImageRows) {
      if (r.src) usedUrls.add(r.src);
      if (r.processed) usedUrls.add(r.processed);
    }
    line(`  no_reuse_pool_size: ${usedUrls.size} (posts: ${allImageRows.length})`);

    if (!providerKeys.pixabay) {
      line(`  pixabay probe: SKIPPED (no usable key)`);
      continue;
    }

    const brandQueries = suggestedQueries[brand.slug as keyof typeof suggestedQueries] ?? [];
    const category = brandCategories[brand.slug] ?? 'lifestyle';
    const probeQuery = brandQueries[0] ?? category;
    line(`  pixabay probe query: "${probeQuery}"`);

    try {
      const data = await pixabaySearch(providerKeys.pixabay, probeQuery, { perPage: 50 });
      const returned = (data.hits || []).map((h) => h.largeImageURL).filter(Boolean);
      const unused = returned.filter((u) => !usedUrls.has(u));
      line(`  pixabay returned: ${returned.length} hits (total_hits=${data.totalHits})`);
      line(`  unused after no-reuse filter: ${unused.length}`);

      // Also probe with the suggested-queries pool (autopilot's brand-anchored
      // recovery path at generate.ts:547-569). Walks all brand queries to see
      // how much fresh material exists once narrow popular-pool is exhausted.
      if (brandQueries.length > 0) {
        const allUnused = new Set<string>();
        for (const q of brandQueries) {
          try {
            const r = await pixabaySearch(providerKeys.pixabay, q, { perPage: 50 });
            for (const h of (r.hits || [])) {
              if (h.largeImageURL && !usedUrls.has(h.largeImageURL)) {
                allUnused.add(h.largeImageURL);
              }
            }
          } catch {
            // best-effort
          }
        }
        line(`  unused across ALL ${brandQueries.length} brand-anchored queries: ${allUnused.size}`);
      }

      // Final safety-net query — the brand-category query used at generate.ts:583
      // when every other path returned 0 candidates. If THIS fails too, the
      // pipeline returns no_images.
      try {
        const cat = await pixabaySearch(providerKeys.pixabay, category, { perPage: 50 });
        const catReturned = (cat.hits || []).map((h) => h.largeImageURL).filter(Boolean);
        const catUnused = catReturned.filter((u) => !usedUrls.has(u));
        line(`  category-fallback "${category}": ${catReturned.length} hits, ${catUnused.length} unused`);
      } catch (e) {
        line(`  category-fallback "${category}": FAILED -- ${e instanceof Error ? e.message : String(e)}`);
      }

      // Most recent 5 posts — useful to see what queries autopilot has been
      // actually running (the source URL tags hint at it).
      const recent = await db
        .select({ src: posts.sourceImageUrl, createdAt: posts.createdAt })
        .from(posts)
        .where(eq(posts.brandId, brand.id))
        .orderBy(desc(posts.createdAt))
        .limit(5);
      line(`  most recent 5 post source URLs:`);
      for (const r of recent) {
        const u = r.src ?? '<null>';
        line(`    ${r.createdAt?.toISOString() ?? '?'}  ${u.slice(0, 100)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      line(`  PIXABAY API FAILED -- ${msg}`);
      line(`     -> key may be revoked, rate-limited, or invalid`);
    }
  }

  line();
  line('DIAGNOSIS HINTS');
  line('===============');
  line('  If "DECRYPT FAILED" anywhere: ENCRYPTION_KEY rotated since token was stored.');
  line('    Fix: disconnect+reconnect that provider in Settings.');
  line('  If "PIXABAY API FAILED": key rejected by Pixabay (revoked/rate-limited/invalid).');
  line('    Fix: get fresh key from Pixabay, disconnect+reconnect in Settings.');
  line('  If unused-across-all-queries == 0: every popular Pixabay photo is already used.');
  line('    Fix options: rolling window, broader queries, OR connect Unsplash+Pexels too.');
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(99);
});
