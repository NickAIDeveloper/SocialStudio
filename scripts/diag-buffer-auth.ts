// Decisive diagnostic for "Not authorized to access this resource" on channel load.
// Prints the RAW Buffer GraphQL response (HTTP status + data + errors) so we can
// tell an expired/invalid token (data:null, top-level error) apart from a
// partial-data response (orgs present, error scoped to one channel/path).
//
// Run: npx tsx scripts/diag-buffer-auth.ts            (uses .env.local)
//      npx tsx scripts/diag-buffer-auth.ts --prod     (uses .env.vercel-production)
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { linkedAccounts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';

const BUFFER_GRAPHQL_URL = 'https://api.buffer.com';

(async () => {
  console.log(`\nENV: ${useProd ? '.env.vercel-production' : '.env.local'}\n`);
  const sql = neon(process.env.NEON_DB_URL!);
  const db = drizzle(sql);

  const links = await db
    .select()
    .from(linkedAccounts)
    .where(eq(linkedAccounts.provider, 'buffer'));

  console.log(`Found ${links.length} buffer linkedAccount row(s).\n`);

  for (const link of links) {
    console.log(`=== userId=${link.userId} ===`);
    console.log(`  connectedAt=${link.connectedAt?.toISOString?.() ?? link.connectedAt}`);
    console.log(`  updatedAt=${link.updatedAt?.toISOString?.() ?? link.updatedAt}`);
    console.log(`  metadata=${JSON.stringify(link.metadata)}`);
    if (!link.accessToken) { console.log('  ! no accessToken\n'); continue; }

    let apiKey: string;
    try {
      apiKey = decrypt(link.accessToken);
    } catch (e) {
      console.log(`  ! decrypt failed: ${e instanceof Error ? e.message : e}\n`);
      continue;
    }
    console.log(`  token: len=${apiKey.length} prefix=${apiKey.slice(0, 6)}… suffix=…${apiKey.slice(-4)}`);

    const query = `{ account { organizations { id name channels { id name service avatar } } } }`;
    const res = await fetch(BUFFER_GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    console.log(`  HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { console.log(`  raw body: ${text.slice(0, 500)}\n`); continue; }
    console.log(`  has data? ${json.data ? 'YES' : 'no'}  has data.account? ${json.data?.account ? 'YES' : 'no'}`);
    if (json.data?.account?.organizations) {
      console.log(`  organizations returned: ${json.data.account.organizations.length}`);
      for (const o of json.data.account.organizations) {
        console.log(`    org ${o.id} "${o.name}" channels=${o.channels?.length ?? 'null'}`);
      }
    }
    if (json.errors?.length) {
      console.log(`  ERRORS (${json.errors.length}):`);
      for (const e of json.errors) {
        console.log(`    - message="${e.message}" code=${e.extensions?.code ?? '?'} path=${JSON.stringify(e.path ?? null)}`);
      }
    } else {
      console.log('  (no GraphQL errors)');
    }
    console.log('');
  }
  process.exit(0);
})();
