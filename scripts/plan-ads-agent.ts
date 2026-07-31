// DRY RUN ONLY — shows what the ads agent WOULD do, and executes nothing.
//
// This is the whole point of shipping M4 as infrastructure first: the decision
// layer is pure and inspectable, so the rules can be watched against real
// numbers for as long as you like before anything is allowed to act. There is
// no code path from this script to Meta.
//
// Run: npx tsx scripts/plan-ads-agent.ts --prod
import 'dotenv/config';
import { config } from 'dotenv';

const useProd = process.argv.includes('--prod');
config({ path: useProd ? '.env.vercel-production' : '.env.local', override: true });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { desc, eq } from 'drizzle-orm';
import { brands, metaAds, metaAdInsights } from '../src/lib/db/schema';
import {
  DEFAULT_AGENT_CONFIG,
  planAgentActions,
  costPerResult,
  medianCostPerResult,
  type AdPerformance,
} from '../src/lib/ads/agent-policy';

(async () => {
  const db = drizzle(neon(process.env.NEON_DB_URL!));
  const now = Date.now();

  for (const brand of await db.select().from(brands)) {
    const ads = await db.select().from(metaAds).where(eq(metaAds.brandId, brand.id));
    if (ads.length === 0) continue;

    const perf: AdPerformance[] = [];
    for (const a of ads) {
      // Most recent daily snapshot for this ad.
      const [snap] = await db
        .select()
        .from(metaAdInsights)
        .where(eq(metaAdInsights.metaAdsId, a.id))
        .orderBy(desc(metaAdInsights.snapshotDate))
        .limit(1);

      perf.push({
        adId: a.adId ?? a.id,
        createdBy: (a.createdBy as 'human' | 'agent' | null) ?? null,
        status: a.status,
        ageHours: a.createdAt ? (now - a.createdAt.getTime()) / 3_600_000 : 0,
        impressions: snap?.impressions ?? 0,
        // spend is stored as a decimal string in major units.
        spendMinor: snap ? Math.round(Number(snap.spend) * 100) : 0,
        results: snap?.results ?? 0,
      });
    }

    const plan = planAgentActions(perf, DEFAULT_AGENT_CONFIG);
    const median = medianCostPerResult(perf.filter(p => p.createdBy === 'agent'));

    console.log(`\n${'='.repeat(70)}\n${brand.slug}: ${perf.length} ads` +
      `  |  agent-created: ${perf.filter(p => p.createdBy === 'agent').length}` +
      `  |  cohort median cost/result: ${median != null ? (median / 100).toFixed(2) : 'n/a'}`);

    if (plan.halted) {
      console.log(`  ⛔ HALTED — ${plan.haltReason}`);
      continue;
    }

    for (const p of perf) {
      const decision = [...plan.pause, ...plan.promote, ...plan.other].find(d => d.adId === p.adId)!;
      const cpr = costPerResult(p);
      const icon = decision.action === 'pause' ? '⏸ ' : decision.action === 'promote' ? '⬆ ' : '  ';
      console.log(
        `  ${icon}${p.adId.padEnd(20)} by=${String(p.createdBy).padEnd(6)} ${String(p.status).padEnd(9)}` +
        ` age=${p.ageHours.toFixed(0).padStart(4)}h impr=${String(p.impressions).padStart(6)}` +
        ` cpr=${cpr != null ? (cpr / 100).toFixed(2).padStart(7) : '      -'}` +
        `  → ${decision.action.toUpperCase()} (${decision.reason})`,
      );
    }
    console.log(`\n  would pause: ${plan.pause.length}   would promote: ${plan.promote.length}   untouched: ${plan.other.length}`);
  }

  console.log('\nDry run only — this script cannot execute anything.');
})();
