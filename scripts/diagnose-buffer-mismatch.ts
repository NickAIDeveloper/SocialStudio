// Decisive diagnostic for "UI says Scheduled · Buffer ✓ but post is not in Buffer".
//
// For each brand's autopilot posts that claim a bufferPostId, we ask Buffer
// directly whether that post id actually exists right now, and whether the
// channel the autopilot is configured to post to still exists in Buffer.
//
// Run: npx tsx scripts/diagnose-buffer-mismatch.ts
// Loads .env.local by default; pass --prod to load .env.vercel-production.
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { and, eq, desc, isNotNull } from 'drizzle-orm';
import { brands, posts, autopilotSettings, linkedAccounts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';
import { getOrganizationsAndChannels } from '../src/lib/buffer';

const BUFFER_GRAPHQL_URL = 'https://api.buffer.com';

// Fetch ALL posts (any status) for an org so we can look up by id. Paginates
// fully so we don't mistake "fell off the first 100" for "doesn't exist".
async function fetchAllPostIds(apiKey: string, orgId: string): Promise<Map<string, { status: string; channelId: string; dueAt: string | null }>> {
  const out = new Map<string, { status: string; channelId: string; dueAt: string | null }>();
  let after: string | null = null;
  let pages = 0;
  do {
    const afterArg: string = after ? `, after: ${JSON.stringify(after)}` : '';
    const query = `{
      posts(input: { organizationId: ${JSON.stringify(orgId)} }, first: 100${afterArg}) {
        pageInfo { hasNextPage endCursor }
        edges { node { id status channelId dueAt } }
      }
    }`;
    const res = await fetch(BUFFER_GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    if (json.errors?.length) {
      console.log(`    ! Buffer posts query error: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`);
      break;
    }
    for (const e of json.data?.posts?.edges ?? []) {
      out.set(e.node.id, { status: e.node.status, channelId: e.node.channelId, dueAt: e.node.dueAt });
    }
    const pi = json.data?.posts?.pageInfo;
    after = pi?.hasNextPage ? pi.endCursor : null;
    pages++;
  } while (after && pages < 50);
  return out;
}

(async () => {
  console.log(`\nENV: ${useProd ? '.env.vercel-production' : '.env.local'}\n`);
  const sql = neon(process.env.NEON_DB_URL!);
  const db = drizzle(sql);

  const allBrands = await db.select().from(brands);

  for (const b of allBrands) {
    const [settings] = await db.select().from(autopilotSettings).where(eq(autopilotSettings.brandId, b.id));
    const claimRows = await db
      .select({ status: posts.status, bufferPostId: posts.bufferPostId, scheduledAt: posts.scheduledAt, createdAt: posts.createdAt })
      .from(posts)
      .where(and(eq(posts.brandId, b.id), eq(posts.source, 'autopilot'), isNotNull(posts.bufferPostId)))
      .orderBy(desc(posts.createdAt))
      .limit(10);

    if (!settings && claimRows.length === 0) continue;

    console.log(`=== ${b.slug} (brandId=${b.id}) ===`);
    console.log(`  settings: mode=${settings?.mode} channelId=${settings?.bufferChannelId} orgId=${settings?.bufferOrganizationId} channelName=${settings?.bufferChannelName}`);
    console.log(`  lastError=${settings?.lastError ?? '<none>'}`);

    if (claimRows.length === 0) {
      console.log('  (no posts claim a bufferPostId)\n');
      continue;
    }

    // Get the brand owner's Buffer token.
    const [link] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, b.userId), eq(linkedAccounts.provider, 'buffer')));
    if (!link?.accessToken) {
      console.log('  ! No Buffer linkedAccount token for owner — cannot verify against Buffer.\n');
      continue;
    }
    let apiKey: string;
    try {
      apiKey = decrypt(link.accessToken);
    } catch (e) {
      console.log(`  ! Buffer token decrypt failed: ${e instanceof Error ? e.message : e}\n`);
      continue;
    }

    // What orgs/channels does this token actually see? (Non-fatal: the nested
    // organizations.channels resolver can return FORBIDDEN; that must not stop
    // the decisive post-existence check below, which uses a different query.)
    const liveChannelIds = new Set<string>();
    try {
      const orgs = await getOrganizationsAndChannels(apiKey);
      console.log('  Buffer orgs/channels visible to this token:');
      for (const o of orgs) {
        console.log(`    org ${o.id} "${o.name}"`);
        for (const c of o.channels) {
          liveChannelIds.add(c.id);
          console.log(`      channel ${c.id} "${c.name}" (${c.service})`);
        }
      }
      const cfgChannelLive = settings?.bufferChannelId ? liveChannelIds.has(settings.bufferChannelId) : false;
      console.log(`  configured channel ${settings?.bufferChannelId} live in Buffer? ${cfgChannelLive ? 'YES' : 'NO  <-- STALE/MISMATCH'}`);
    } catch (e) {
      console.log(`  ! channel listing unavailable (${e instanceof Error ? e.message : e}) — proceeding to post-existence check anyway`);
    }

    // Pull all post ids Buffer currently knows for the configured org.
    const bufferPosts = settings?.bufferOrganizationId
      ? await fetchAllPostIds(apiKey, settings.bufferOrganizationId)
      : new Map();
    console.log(`  Buffer returned ${bufferPosts.size} posts for configured org.`);

    console.log('  --- claimed posts ---');
    for (const r of claimRows) {
      const found = r.bufferPostId ? bufferPosts.get(r.bufferPostId) : undefined;
      const verdict = found
        ? `EXISTS (buffer status=${found.status}, channel=${found.channelId}, dueAt=${found.dueAt})`
        : 'NOT FOUND IN BUFFER  <-- GHOST';
      console.log(`    ${r.createdAt?.toISOString()}  db=${r.status}  bufferPostId=${r.bufferPostId}  => ${verdict}`);
    }
    console.log('');
  }
  process.exit(0);
})();
