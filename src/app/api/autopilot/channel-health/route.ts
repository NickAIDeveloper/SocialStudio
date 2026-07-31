// POST /api/autopilot/channel-health
//
// Daily sweep that asks Buffer whether each configured brand's channel can still
// receive posts, and records any outage on the brand's autopilot settings.
//
// Why it exists: Buffer holds its own Instagram credential per channel and it
// expires. When it did on 2026-07-26 the daily cron kept succeeding for five days
// while pacebrain.app quietly dropped every post — the scheduler was healthy and
// simply never looked. Detection previously only happened on a run that tried to
// post, or when someone opened the autopilot page.
//
// HMAC-authenticated (server-to-server), called from scripts/brain/run-daily.mjs.
// MUST stay listed in the src/middleware.ts matcher exclusions or this returns a
// silent 405 — see src/__tests__/middleware-cron-routes.test.ts.

import { NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { autopilotSettings, brands, linkedAccounts } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { decrypt } from '@/lib/encryption';
import { getChannelHealth } from '@/lib/buffer';
import { checkChannelPushable } from '@/lib/autopilot/channel-health';
import { recordChannelDisconnected, clearChannelAlert } from '@/lib/autopilot/channel-alert';

export const dynamic = 'force-dynamic';

interface BrandReport {
  brandId: string;
  slug: string | null;
  channel: string | null;
  state: 'healthy' | 'blocked' | 'warning' | 'unknown';
  code?: string;
  message?: string;
  // How long the outage has been going, so a report says "broken for 4 days"
  // rather than just "broken".
  firstSeenAt?: string | null;
  outageDays?: number;
}

const DAY = 86_400_000;

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  // Only brands actually configured to push to a Buffer channel.
  const rows = await db
    .select({
      brandId: autopilotSettings.brandId,
      slug: brands.slug,
      userId: brands.userId,
      channelId: autopilotSettings.bufferChannelId,
      orgId: autopilotSettings.bufferOrganizationId,
      channelName: autopilotSettings.bufferChannelName,
    })
    .from(autopilotSettings)
    .innerJoin(brands, eq(brands.id, autopilotSettings.brandId))
    .where(
      and(
        isNotNull(autopilotSettings.bufferChannelId),
        isNotNull(autopilotSettings.bufferOrganizationId),
      ),
    );

  const reports: BrandReport[] = [];
  let blocked = 0;

  // Cache per Buffer token+org: brands commonly share one organization, so this
  // is usually a single Buffer call for the whole sweep.
  const healthCache = new Map<string, Awaited<ReturnType<typeof getChannelHealth>>>();

  for (const row of rows) {
    const base: BrandReport = {
      brandId: row.brandId,
      slug: row.slug,
      channel: row.channelName,
      state: 'unknown',
    };
    try {
      const [link] = await db
        .select()
        .from(linkedAccounts)
        .where(and(eq(linkedAccounts.userId, row.userId), eq(linkedAccounts.provider, 'buffer')));
      if (!link?.accessToken) {
        reports.push({ ...base, code: 'buffer_not_connected' });
        continue;
      }
      const apiKey = decrypt(link.accessToken);

      const cacheKey = `${row.userId}:${row.orgId}`;
      let health = healthCache.get(cacheKey);
      if (!health) {
        health = await getChannelHealth(apiKey, row.orgId!);
        healthCache.set(cacheKey, health);
      }

      const check = checkChannelPushable(health.get(row.channelId!));
      if (check.blocked) {
        blocked += 1;
        const { firstSeenAt } = await recordChannelDisconnected(
          row.brandId,
          `${check.code}: ${check.message}`,
        );
        reports.push({
          ...base,
          state: 'blocked',
          code: check.code,
          message: check.message,
          firstSeenAt: firstSeenAt?.toISOString() ?? null,
          outageDays: firstSeenAt
            ? Math.floor((Date.now() - firstSeenAt.getTime()) / DAY)
            : 0,
        });
        continue;
      }

      // Healthy (or merely paused): re-arm the latch so a future outage reads as new.
      await clearChannelAlert(row.brandId);
      reports.push(
        check.warning
          ? { ...base, state: 'warning', code: 'buffer_queue_paused', message: check.warning }
          : { ...base, state: 'healthy' },
      );
    } catch (err) {
      // One brand's failure must not abort the sweep for the others.
      console.error(
        `[channel-health] ${row.slug ?? row.brandId} failed:`,
        err instanceof Error ? err.message : err,
      );
      reports.push({ ...base, code: 'check_failed' });
    }
  }

  return NextResponse.json({ status: 'ok', checked: rows.length, blocked, reports });
}
