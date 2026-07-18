// One-off: run the (now cron-wired) autopilot status reconciliation for every
// brand immediately, to heal rows that went stale while reconciliation only ran
// on queue-page load. Read-mostly: only flips scheduled→published/failed to
// match Buffer's ground truth. Safe to re-run.
//
// Run: npx tsx scripts/reconcile-all-now.ts
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: false });

import { db } from '../src/lib/db';
import { brands } from '../src/lib/db/schema';
import { reconcileAutopilotStatuses } from '../src/lib/autopilot/reconcile';

(async () => {
  const allBrands = await db.select().from(brands);
  for (const b of allBrands) {
    const r = await reconcileAutopilotStatuses(b.id);
    console.log(
      `${b.slug.padEnd(12)} checked=${r.checked} published=${r.published} failed=${r.failed}` +
        (r.skippedReason ? ` skipped=${r.skippedReason}` : ''),
    );
  }
  process.exit(0);
})();
