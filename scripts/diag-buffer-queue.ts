// What is ACTUALLY in Buffer right now — queued vs sent — straight from Buffer,
// not from our posts table. Answers "there's nothing scheduled in Buffer":
// a published post leaves the queue and appears under Sent, so an empty queue
// is normal once the day's posts have gone out.
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.vercel-production', override: true });
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { linkedAccounts } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';
import { getQueuedPosts, getSentPosts } from '../src/lib/buffer';

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));
  const [link] = await db.select().from(linkedAccounts).where(eq(linkedAccounts.provider, 'buffer'));
  if (!link?.accessToken) { console.log('Buffer not connected'); return; }
  const key = decrypt(link.accessToken);

  const queued = await getQueuedPosts(key);
  console.log(`\n=== QUEUED in Buffer: ${queued.length} ===`);
  for (const p of queued) {
    console.log(`  ${p.dueAt ?? '(no due)'}  ${p.channelService.padEnd(10)} ${p.status.padEnd(10)} ${p.text.split('\n')[0].slice(0, 55)}`);
  }

  const sent = await getSentPosts(key);
  console.log(`\n=== SENT (most recent 6 of ${sent.length}) ===`);
  for (const p of sent.slice(0, 6)) {
    console.log(`  ${p.dueAt ?? '(no due)'}  ${p.channelService.padEnd(10)} ${p.status.padEnd(10)} ${p.text.split('\n')[0].slice(0, 55)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
