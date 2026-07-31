// Evidence-gathering only (read-only): can we detect "Buffer has lost
// authorization to post on your behalf" from the Buffer API, and what status do
// the affected posts carry?
//
// Run: npx tsx scripts/diag-buffer-channel-health.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { linkedAccounts, brands } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';

const URL = 'https://api.buffer.com';

async function gql(apiKey: string, query: string) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    console.log('   [gql errors]', json.errors.map((e: { message: string }) => e.message).join('; '));
  }
  return json.data;
}

(async () => {
  const sql = neon(process.env.NEON_DB_URL!);
  const db = drizzle(sql);

  const allBrands = await db.select().from(brands);
  const userId = allBrands[0]?.userId;
  if (!userId) throw new Error('no brands');

  const [link] = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'buffer')));
  if (!link?.accessToken) throw new Error('buffer not connected');
  const apiKey = decrypt(link.accessToken);

  // 1) What fields does the Channel type actually expose?
  console.log('=== Channel type fields ===');
  const intro = await gql(apiKey, `{
    __type(name: "Channel") {
      fields { name type { name kind ofType { name kind } } }
    }
  }`);
  const fields: Array<{ name: string; type: { name: string | null; kind: string; ofType: { name: string | null } | null } }> =
    intro?.__type?.fields ?? [];
  for (const f of fields) {
    const t = f.type.name ?? f.type.ofType?.name ?? f.type.kind;
    console.log(`  ${f.name}: ${t}`);
  }

  // 2) Query the scalar/boolean fields that look health-related.
  const healthish = fields
    .filter(f => {
      const t = f.type.name ?? f.type.ofType?.name ?? '';
      const scalar = ['Boolean', 'String', 'Int', 'ID', 'DateTime'].includes(t);
      return scalar && /disconnect|auth|token|expire|refresh|error|lock|valid|active|paused|status|health|connect/i.test(f.name);
    })
    .map(f => f.name);
  console.log('\n=== health-ish scalar fields ===');
  console.log(' ', healthish.join(', ') || '(none)');

  console.log('\n=== PostPublishingError fields ===');
  const perr = await gql(apiKey, `{ __type(name: "PostPublishingError") { fields { name type { name kind ofType { name } } } } }`);
  const errFields: Array<{ name: string; type: { name: string | null; kind: string; ofType: { name: string | null } | null } }> =
    perr?.__type?.fields ?? [];
  for (const f of errFields) console.log(`  ${f.name}: ${f.type.name ?? f.type.ofType?.name ?? f.type.kind}`);
  const errSel = errFields
    .filter(f => ['Boolean', 'String', 'Int', 'ID', 'DateTime'].includes(f.type.name ?? f.type.ofType?.name ?? ''))
    .map(f => f.name)
    .join(' ');

  const orgs = await gql(apiKey, `{ account { organizations { id name } } }`);
  for (const org of orgs?.account?.organizations ?? []) {
    console.log(`\n=== org ${org.name} (${org.id}) ===`);

    const chans = await gql(apiKey, `{
      channels(input: { organizationId: ${JSON.stringify(org.id)} }) {
        id name service ${healthish.join(' ')}
      }
    }`);
    console.log(JSON.stringify(chans?.channels, null, 2));

    // Recent post statuses — what does Buffer call "Not Published"?
    const posts = await gql(apiKey, `{
      posts(input: { organizationId: ${JSON.stringify(org.id)} }, first: 25) {
        edges { node { id status dueAt createdAt channelId ... on Post { error { ${errSel} } } } }
      }
    }`);
    for (const e of posts?.posts?.edges ?? []) {
      const n = e.node;
      console.log(
        `    ${n.dueAt ?? n.createdAt}  status=${String(n.status).padEnd(14)} ch=${n.channelId}` +
        (n.error ? `  err=${JSON.stringify(n.error)}` : ''),
      );
    }
  }
})();
