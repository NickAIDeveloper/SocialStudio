// GET /api/cron/brain-watchdog  — daily dead-man's switch for the brain cron.
//
// Why this exists:
//   The daily brain pipeline (.github/workflows/brain-daily.yml → run-daily.mjs,
//   03:00 UTC) is the ONLY thing that calls /api/autopilot/run. When that GitHub
//   Actions job silently stops — e.g. the account is billing-locked, as happened
//   2026-05-28..06-04 — every scheduled run dies in seconds, /api/autopilot/run
//   is never reached, and autopilot stops shipping with NO in-app error to see
//   (lastError stays null because the route never runs). It went unnoticed for a
//   week. See memory project_autopilot_github_billing_lock.
//
//   An in-workflow "on failure" notification can't catch this: when the job is
//   blocked it never starts, so no workflow step runs. The only thing that
//   detects "the cron didn't run" is an INDEPENDENT watchdog. This route runs on
//   Vercel cron (independent of GitHub billing) and checks a heartbeat the brain
//   pipeline writes every day: the newest row in brain_snapshots. A healthy run
//   inserts snapshots for every brand each day; if the newest is stale, the cron
//   isn't running and we email an alert.

import { NextResponse, type NextRequest } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainSnapshots } from '@/lib/db/schema';
import { sendAlertEmail } from '@/lib/alerts/email';

export const dynamic = 'force-dynamic';

// How stale the newest brain snapshot may be before we alert. The cron fires at
// 03:00 UTC and this watchdog at 15:00 UTC (12h later), so a healthy snapshot is
// ~12h old; 30h tolerates a cron delayed well past its slot yet still catches a
// fully missed day. Override with CRON_MAX_AGE_HOURS if cadence changes.
const DEFAULT_MAX_AGE_HOURS = 30;

export async function GET(request: NextRequest): Promise<Response> {
  // Vercel cron auth: when CRON_SECRET is set, Vercel sends it as a Bearer token.
  // Require it when configured; if unset (e.g. first deploy), allow but flag it.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const maxAgeHours = Number(process.env.CRON_MAX_AGE_HOURS) || DEFAULT_MAX_AGE_HOURS;
  const now = Date.now();

  const [latest] = await db
    .select({ createdAt: brainSnapshots.createdAt })
    .from(brainSnapshots)
    .orderBy(desc(brainSnapshots.createdAt))
    .limit(1);

  const lastRunAt = latest?.createdAt ?? null;
  const ageHours = lastRunAt ? (now - lastRunAt.getTime()) / 3_600_000 : Infinity;
  const stale = ageHours > maxAgeHours;

  if (!stale) {
    return NextResponse.json({
      status: 'ok',
      lastBrainRunAt: lastRunAt?.toISOString() ?? null,
      ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
    });
  }

  // Stale → the daily brain cron has not produced a snapshot recently. Alert.
  const lastSeen = lastRunAt ? lastRunAt.toISOString() : 'never';
  const alert = await sendAlertEmail({
    subject: '⚠️ GoViraleza autopilot cron has stopped running',
    html: [
      '<p>The daily brain pipeline has not produced a snapshot recently, so',
      ' autopilot is not generating or scheduling posts.</p>',
      `<p><strong>Last successful brain run:</strong> ${lastSeen}<br/>`,
      `<strong>Now:</strong> ${new Date(now).toISOString()}<br/>`,
      `<strong>Staleness threshold:</strong> ${maxAgeHours}h</p>`,
      '<p>Most likely cause: the GitHub Actions <code>brain-daily.yml</code> job',
      ' is failing to start (commonly a billing lock). Check',
      ' <code>gh run list --workflow=brain-daily.yml</code> and the account',
      ' billing status.</p>',
    ].join(''),
  });

  return NextResponse.json(
    {
      status: 'stale',
      lastBrainRunAt: lastRunAt?.toISOString() ?? null,
      ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
      maxAgeHours,
      alert,
    },
    { status: 503 },
  );
}
