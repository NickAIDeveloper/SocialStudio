// Why did Buffer's channel credential die, and when will the next one?
//
// Compares two INDEPENDENT Meta credential chains side by side:
//   1. Buffer's own per-channel credential (Channel.createdAt/updatedAt +
//      isDisconnected) — the thing that broke on 2026-07-26.
//   2. This app's IG long-lived token (instagram_accounts.token_expires_at),
//      which getFreshIgToken renews on a 7-day pre-expiry window.
//
// If both died around the same date, a Meta-side event (password change, forced
// re-auth, permission revocation) took out everything. If only Buffer's died, it
// is Buffer's refresh cadence alone and detection is the only defence.
//
// Run: npx tsx scripts/diag-token-lifecycles.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { brands, linkedAccounts, instagramAccounts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';

const URL = 'https://api.buffer.com';
const DAY = 86_400_000;

function daysFromNow(d: Date | null): string {
  if (!d) return 'unknown';
  const diff = Math.round((d.getTime() - Date.now()) / DAY);
  return diff >= 0 ? `in ${diff}d` : `${-diff}d ago`;
}

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));
  const allBrands = await db.select().from(brands);
  const userId = allBrands[0]!.userId;

  // ── 1. Buffer channels ────────────────────────────────────────────────────
  const [link] = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'buffer')));
  if (!link?.accessToken) throw new Error('buffer not connected');
  const apiKey = decrypt(link.accessToken);

  const orgRes = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ account { organizations { id name } } }' }),
  });
  const orgs = (await orgRes.json()).data?.account?.organizations ?? [];

  console.log('=== Buffer channel credentials ===');
  for (const org of orgs) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          channels(input: { organizationId: ${JSON.stringify(org.id)} }) {
            id name service isDisconnected isLocked isQueuePaused createdAt updatedAt
          }
        }`,
      }),
    });
    const json = await res.json();
    if (json.errors?.length) {
      console.log('  [gql]', json.errors.map((e: { message: string }) => e.message).join('; '));
      continue;
    }
    for (const c of json.data?.channels ?? []) {
      const created = c.createdAt ? new Date(c.createdAt) : null;
      const updated = c.updatedAt ? new Date(c.updatedAt) : null;
      console.log(`  ${c.name} (${c.service})`);
      console.log(`    disconnected=${c.isDisconnected}  locked=${c.isLocked}  queuePaused=${c.isQueuePaused}`);
      console.log(`    connected : ${created?.toISOString() ?? '?'}  (${daysFromNow(created)})`);
      console.log(`    updated   : ${updated?.toISOString() ?? '?'}  (${daysFromNow(updated)})`);
    }
  }

  // ── 2. This app's IG tokens ───────────────────────────────────────────────
  console.log('\n=== This app\'s IG long-lived tokens ===');
  const igRows = await db
    .select({
      igUsername: instagramAccounts.igUsername,
      tokenExpiresAt: instagramAccounts.tokenExpiresAt,
      connectedAt: instagramAccounts.connectedAt,
      updatedAt: instagramAccounts.updatedAt,
    })
    .from(instagramAccounts)
    .where(eq(instagramAccounts.userId, userId));

  for (const r of igRows) {
    console.log(`  @${r.igUsername ?? '?'}`);
    console.log(`    expires   : ${r.tokenExpiresAt?.toISOString() ?? 'unknown'}  (${daysFromNow(r.tokenExpiresAt)})`);
    console.log(`    connected : ${r.connectedAt?.toISOString() ?? '?'}  (${daysFromNow(r.connectedAt)})`);
    console.log(`    refreshed : ${r.updatedAt?.toISOString() ?? '?'}  (${daysFromNow(r.updatedAt)})`);
  }
  if (igRows.length === 0) console.log('  (none)');
})();
