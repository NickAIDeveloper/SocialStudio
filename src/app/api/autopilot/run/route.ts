import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { brands, autopilotSettings, posts, linkedAccounts, instagramAccounts } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { readBrandBrain } from '@/lib/brain/consume';
import { computeNextRunAt, isDueNow, type Frequency } from '@/lib/autopilot/schedule';
import { createPost } from '@/lib/buffer';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  const rawBody = await req.text();
  if (!(await verifyBrainSignature(req, rawBody))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });

  const [settings] = await db
    .select()
    .from(autopilotSettings)
    .where(eq(autopilotSettings.brandId, brandId));

  if (!settings || !settings.enabled) {
    return NextResponse.json({ status: 'skipped', reason: 'autopilot_disabled' });
  }

  const now = new Date();
  if (!isDueNow(settings.nextRunAt, now)) {
    return NextResponse.json({
      status: 'skipped',
      reason: 'not_due',
      nextRunAt: settings.nextRunAt?.toISOString() ?? null,
    });
  }

  const brain = await readBrandBrain(brandId);

  // Resolve the brand owner's connected IG account — god-mode requires igUserId.
  // instagramAccounts are keyed by userId (not brandId); pick the first one.
  const [igAccount] = await db
    .select({ igUserId: instagramAccounts.igUserId })
    .from(instagramAccounts)
    .where(eq(instagramAccounts.userId, brand.userId))
    .limit(1);

  if (!igAccount?.igUserId) {
    await db
      .update(autopilotSettings)
      .set({ lastError: 'no_ig_account', updatedAt: now })
      .where(eq(autopilotSettings.brandId, brandId));
    return NextResponse.json({ status: 'failed', reason: 'no_ig_account' });
  }

  // Call the god-mode endpoint with HMAC auth so we get the full composited
  // image (hook overlay + brand logo) and LLM-designed seed — same as the
  // smart-posts UI flow.
  const baseUrl = new URL(req.url).origin;
  const godBody = JSON.stringify({
    userId: brand.userId,
    brandId,
    igUserId: igAccount.igUserId,
    metaOverrides: brain?.formula
      ? {
          format: brain.formula.format,
          day: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
            brain.formula.bestSlot.dow
          ],
          hour: brain.formula.bestSlot.hour,
        }
      : null,
  });

  const sig = createHmac('sha256', process.env.BRAIN_CRON_SECRET!).update(godBody).digest('hex');

  let godPayload: {
    caption?: string;
    hashtags?: string;
    hookText?: string;
    sourceImageUrl?: string;
    imageDataUrl?: string;
    scheduledAt?: string | null;
    godModeRationale?: string;
    godModeFellBack?: boolean;
  };

  try {
    const godRes = await fetch(`${baseUrl}/api/smart-posts/god-mode`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-brain-signature': sig,
      },
      body: godBody,
    });

    if (!godRes.ok) {
      const errText = await godRes.text().catch(() => '');
      const errorCode = `god_mode_${godRes.status}`;
      await db
        .update(autopilotSettings)
        .set({ lastError: `${errorCode}: ${errText.slice(0, 200)}`, updatedAt: now })
        .where(eq(autopilotSettings.brandId, brandId));
      return NextResponse.json({ status: 'failed', reason: errorCode });
    }

    godPayload = (await godRes.json()) as typeof godPayload;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(autopilotSettings)
      .set({ lastError: `god_mode_fetch_failed: ${msg}`, updatedAt: now })
      .where(eq(autopilotSettings.brandId, brandId));
    return NextResponse.json({ status: 'failed', reason: 'god_mode_fetch_failed' });
  }

  const caption = godPayload.caption ?? '';
  const hashtags = godPayload.hashtags ?? '';
  const hookText = godPayload.hookText ?? '';
  // god-mode returns a base64 imageDataUrl for the composited image and the
  // raw sourceImageUrl. Buffer requires a hosted URL, so we use sourceImageUrl
  // for the Buffer push. The composited imageDataUrl is stored for the queue UI.
  const sourceImageUrl = godPayload.sourceImageUrl ?? null;

  if (!caption || !hookText) {
    await db
      .update(autopilotSettings)
      .set({ lastError: 'empty_generation', updatedAt: now })
      .where(eq(autopilotSettings.brandId, brandId));
    return NextResponse.json({ status: 'failed', reason: 'empty_generation' });
  }

  // Compute scheduledAt from brain bestSlot when mode=auto.
  const scheduledAt =
    settings.mode === 'auto' && brain?.formula?.bestSlot
      ? (() => {
          const out = new Date(now.getTime());
          const desiredDow = brain.formula!.bestSlot.dow;
          const hour = brain.formula!.bestSlot.hour;
          out.setUTCHours(hour, 0, 0, 0);
          let delta = (desiredDow - out.getUTCDay() + 7) % 7;
          if (delta === 0 && out.getTime() <= now.getTime()) delta = 7;
          out.setUTCDate(out.getUTCDate() + delta);
          return out;
        })()
      : null;

  let bufferPostId: string | null = null;
  let postStatus: 'draft' | 'scheduled' = 'draft';
  let lastError: string | null = null;

  if (settings.mode === 'auto' && scheduledAt) {
    const [link] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, brand.userId), eq(linkedAccounts.provider, 'buffer')));

    if (!link?.accessToken) {
      postStatus = 'draft';
      lastError = 'buffer_not_connected';
    } else {
      let apiKey: string;
      try {
        apiKey = decrypt(link.accessToken);
      } catch {
        postStatus = 'draft';
        lastError = 'buffer_token_decrypt_failed';
        apiKey = '';
      }

      if (apiKey) {
        const meta = (link.metadata ?? {}) as {
          selectedChannelId?: string;
          selectedOrganizationId?: string;
        };
        if (!meta.selectedChannelId || !meta.selectedOrganizationId) {
          postStatus = 'draft';
          lastError = 'buffer_channel_not_selected';
        } else {
          try {
            const fullText = `${caption}\n\n${hashtags}`.trim();
            const bufferPost = await createPost(apiKey, {
              channelId: meta.selectedChannelId,
              organizationId: meta.selectedOrganizationId,
              text: fullText,
              mode: 'customScheduled',
              scheduledAt: scheduledAt.toISOString(),
              imageUrls: sourceImageUrl ? [sourceImageUrl] : undefined,
            });
            bufferPostId = bufferPost.id;
            postStatus = 'scheduled';
          } catch (err) {
            postStatus = 'draft';
            lastError = `buffer_push_failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      }
    }
  }

  const [inserted] = await db
    .insert(posts)
    .values({
      userId: brand.userId,
      brandId,
      caption,
      hashtags,
      hookText,
      contentType: 'tip',
      status: postStatus,
      scheduledAt,
      bufferPostId,
      sourceImageUrl,
      source: 'autopilot',
    })
    .returning({ id: posts.id });

  // Update autopilot settings.
  const next = computeNextRunAt({
    frequency: settings.frequency as Frequency,
    lastRunAt: now,
    bestSlot: brain?.formula?.bestSlot ?? null,
    now,
  });
  await db
    .update(autopilotSettings)
    .set({
      lastRunAt: now,
      nextRunAt: next,
      lastError,
      totalGenerated: (settings.totalGenerated ?? 0) + 1,
      updatedAt: now,
    })
    .where(eq(autopilotSettings.brandId, brandId));

  return NextResponse.json({
    status: 'ok',
    postId: inserted.id,
    postStatus,
    bufferPostId,
    scheduledAt: scheduledAt?.toISOString() ?? null,
    nextRunAt: next.toISOString(),
    warning: lastError,
    godModeFellBack: godPayload.godModeFellBack ?? false,
  });
}
