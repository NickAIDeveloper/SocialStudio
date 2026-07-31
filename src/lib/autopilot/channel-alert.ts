// src/lib/autopilot/channel-alert.ts
//
// Records — once per outage — that a brand's Buffer channel has lost
// authorization, so the condition is persisted rather than only observable via a
// live API call at page-load time.
//
// Edge-triggered, not level-triggered: autopilotSettings.channelAlertAt is
// stamped on the healthy→disconnected transition and cleared when the channel
// starts accepting posts again. `firstSeenAt` in the daily sweep's response is
// what tells you "this has been broken for 4 days", not just "it's broken".
//
// Nothing here throws: failing to record must never fail an autopilot run.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { autopilotSettings } from '@/lib/db/schema';

export interface ChannelAlertResult {
  // True only on the transition — the run that first noticed.
  firstDetection: boolean;
  // When the outage was first seen, so callers can report its age.
  firstSeenAt: Date | null;
}

// Call when a run (or the daily sweep) finds a disconnected channel. Persists
// the reason to lastError so the dashboard shows it without a live Buffer call.
export async function recordChannelDisconnected(
  brandId: string,
  reason: string,
): Promise<ChannelAlertResult> {
  try {
    const [settings] = await db
      .select({ channelAlertAt: autopilotSettings.channelAlertAt })
      .from(autopilotSettings)
      .where(eq(autopilotSettings.brandId, brandId));

    if (settings?.channelAlertAt) {
      // Already recorded: refresh lastError (harmless, keeps it current) but do
      // not move the first-seen timestamp — its whole value is outage age.
      await db
        .update(autopilotSettings)
        .set({ lastError: reason, updatedAt: new Date() })
        .where(eq(autopilotSettings.brandId, brandId));
      return { firstDetection: false, firstSeenAt: settings.channelAlertAt };
    }

    const now = new Date();
    await db
      .update(autopilotSettings)
      .set({ channelAlertAt: now, lastError: reason, updatedAt: now })
      .where(eq(autopilotSettings.brandId, brandId));
    return { firstDetection: true, firstSeenAt: now };
  } catch (err) {
    console.error('[autopilot] recording channel outage failed:', err instanceof Error ? err.message : err);
    return { firstDetection: false, firstSeenAt: null };
  }
}

// Call after a successful push: re-arms the latch so the NEXT outage is recorded
// as a fresh one. Only writes when the latch is actually set, to keep healthy
// runs read-only.
export async function clearChannelAlert(brandId: string): Promise<void> {
  try {
    const [settings] = await db
      .select({ channelAlertAt: autopilotSettings.channelAlertAt })
      .from(autopilotSettings)
      .where(eq(autopilotSettings.brandId, brandId));
    if (!settings?.channelAlertAt) return;

    await db
      .update(autopilotSettings)
      .set({ channelAlertAt: null, updatedAt: new Date() })
      .where(eq(autopilotSettings.brandId, brandId));
  } catch (err) {
    console.error('[autopilot] clearing channel alert failed:', err instanceof Error ? err.message : err);
  }
}
