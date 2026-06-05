// src/lib/autopilot/reconcile.ts
//
// Syncs autopilot post statuses with Buffer's reality. The run route writes
// status='scheduled' the moment Buffer accepts a post and never advances it, so
// sent posts read "Scheduled" forever and dropped posts read "Buffer ✓". This
// pulls Buffer's ground truth back onto our rows:
//   scheduled + Buffer sent      → published (+ publishedAt)
//   scheduled + Buffer gone      → failed
//   scheduled + still upcoming   → unchanged
//
// Safe by construction: any Buffer/network error aborts the whole pass without
// touching the DB, so an outage can never corrupt local state.

import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { autopilotSettings, brands, linkedAccounts, posts } from '@/lib/db/schema';
import { decrypt } from '@/lib/encryption';
import { getOrgPostStatusMap, getPostById, type BufferPostLookup } from '@/lib/buffer';
import { reconcileStatus } from './reconcile-status';

export interface ReconcileResult {
  checked: number;
  published: number;
  failed: number;
  skippedReason?: string;
}

// Reconcile every still-"scheduled" autopilot post for one brand against Buffer.
// Returns a small summary; never throws (transient Buffer issues are swallowed).
export async function reconcileAutopilotStatuses(brandId: string): Promise<ReconcileResult> {
  try {
    const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
    if (!brand) return { checked: 0, published: 0, failed: 0, skippedReason: 'no_brand' };

    const [settings] = await db
      .select()
      .from(autopilotSettings)
      .where(eq(autopilotSettings.brandId, brandId));
    if (!settings?.bufferOrganizationId) {
      return { checked: 0, published: 0, failed: 0, skippedReason: 'no_org' };
    }

    // Only posts we still believe are scheduled and that actually reached Buffer.
    const scheduled = await db
      .select({ id: posts.id, status: posts.status, bufferPostId: posts.bufferPostId })
      .from(posts)
      .where(
        and(
          eq(posts.brandId, brandId),
          eq(posts.source, 'autopilot'),
          eq(posts.status, 'scheduled'),
          isNotNull(posts.bufferPostId),
        ),
      );
    if (scheduled.length === 0) {
      return { checked: 0, published: 0, failed: 0, skippedReason: 'nothing_scheduled' };
    }

    const [link] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, brand.userId), eq(linkedAccounts.provider, 'buffer')));
    if (!link?.accessToken) {
      return { checked: 0, published: 0, failed: 0, skippedReason: 'buffer_not_connected' };
    }
    const apiKey = decrypt(link.accessToken);

    // One bulk pull covers the recent posts (the common case); per-id lookups
    // resolve only the older ones that fell outside the windowed org feed.
    const orgMap = await getOrgPostStatusMap(apiKey, settings.bufferOrganizationId);

    let published = 0;
    let failed = 0;

    for (const row of scheduled) {
      const id = row.bufferPostId!;
      const fromFeed = orgMap.get(id);
      const lookup: BufferPostLookup = fromFeed
        ? { found: true, status: fromFeed.status, dueAt: fromFeed.dueAt }
        : await getPostById(apiKey, id); // authoritative for window-misses

      const patch = reconcileStatus(row.status, lookup);
      if (!patch) continue;

      await db
        .update(posts)
        .set({ status: patch.status, publishedAt: patch.publishedAt, updatedAt: new Date() })
        .where(eq(posts.id, row.id));

      if (patch.status === 'published') published++;
      else failed++;
    }

    return { checked: scheduled.length, published, failed };
  } catch (err) {
    // Never let reconciliation break the page it runs behind.
    console.error('[autopilot] status reconcile failed:', err instanceof Error ? err.message : err);
    return { checked: 0, published: 0, failed: 0, skippedReason: 'error' };
  }
}
