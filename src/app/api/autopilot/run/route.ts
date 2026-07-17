import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { brands, autopilotSettings, posts, linkedAccounts, instagramAccounts } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { readBrandBrain } from '@/lib/brain/consume';
import { runGrade, shouldHoldForQuality, type GradeReport } from '@/lib/brain/grade';
import { cerebrasChatCompletion } from '@/lib/cerebras';
import { computeNextRunAt, isDueNow, nextPostSlot, type Frequency } from '@/lib/autopilot/schedule';
import { createPost } from '@/lib/buffer';
import { decrypt } from '@/lib/encryption';
import { uploadImageToGitHub } from '@/lib/github-images';
import { ensureInstagramReadyImageUrl } from '@/lib/autopilot/buffer-image';
import { auth } from '@/auth';
import {
  normalizeImageUrlForDedup,
  buildDedupSet,
} from '@/lib/smart-posts/url-dedup';

export const dynamic = 'force-dynamic';

// Shared failure exit for the cron run. Before this existed, every early-return
// failure path left `nextRunAt` frozen and `lastError` null, so a stuck brand
// looked perpetually "due", silently failed every daily cron, and gave no clue
// why (live state showed lastError=null while nothing shipped). This records a
// descriptive `lastError` AND advances `nextRunAt` one cadence from now so the
// schedule reflects reality instead of a frozen past date.
//
// `lastRunAt` is deliberately NOT touched — it still marks the last SUCCESSFUL
// generation, so we never misreport a failed attempt as a successful run.
async function failAutopilot(params: {
  brandId: string;
  frequency: Frequency;
  bestSlot: { dow: number; hour: number } | null;
  now: Date;
  reason: string;
  // Full error detail to persist; defaults to `reason`. Lets us store a verbose
  // message (e.g. god-mode body) while returning a short, stable reason code.
  detail?: string;
}): Promise<Response> {
  const next = computeNextRunAt({
    frequency: params.frequency,
    lastRunAt: params.now,
    bestSlot: params.bestSlot,
    now: params.now,
  });
  await db
    .update(autopilotSettings)
    .set({ lastError: params.detail ?? params.reason, nextRunAt: next, updatedAt: params.now })
    .where(eq(autopilotSettings.brandId, params.brandId));
  return NextResponse.json({
    status: 'failed',
    reason: params.reason,
    nextRunAt: next.toISOString(),
  });
}

export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });

  // Dual auth: HMAC for cron (preserves the existing /api/cron flow), cookie
  // for the "Run now" button in /settings autopilot card. Cookie auth still
  // requires the session user to own the brand — verified after the brand row
  // is loaded below.
  const rawBody = await req.text();
  const sigHeader = req.headers.get('x-brain-signature');
  let sessionUserId: string | null = null;
  if (sigHeader) {
    if (!(await verifyBrainSignature(req, rawBody))) {
      return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
    }
  } else {
    const session = await auth();
    sessionUserId = session?.user?.id ?? null;
    if (!sessionUserId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });
  if (sessionUserId && brand.userId !== sessionUserId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [settings] = await db
    .select()
    .from(autopilotSettings)
    .where(eq(autopilotSettings.brandId, brandId));

  if (!settings) {
    return NextResponse.json({ status: 'skipped', reason: 'autopilot_not_configured' });
  }

  const now = new Date();
  const force = searchParams.get('force') === '1';
  // force=1 (set by the UI Run now button) bypasses both the paused state and
  // the next-run schedule. Cron requests must respect both.
  if (!force && !settings.enabled) {
    return NextResponse.json({ status: 'skipped', reason: 'autopilot_disabled' });
  }
  if (!force && !isDueNow(settings.nextRunAt, now)) {
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
    return failAutopilot({
      brandId,
      frequency: settings.frequency as Frequency,
      bestSlot: brain?.formula?.bestSlot ?? null,
      now,
      reason: 'no_ig_account',
    });
  }

  // Call the god-mode endpoint with HMAC auth so we get the full composited
  // image (hook overlay + brand logo) and LLM-designed seed — same shape as the
  // smart-posts UI flow. We intentionally DO NOT forward metaOverrides: god-mode
  // already picks the optimal format/day/hour from the deep profile via its LLM
  // designer, and forwarding the brain's bestSlot was producing lower-quality
  // output than the UI path (which never sends metaOverrides). The brain's
  // bestSlot is still consulted below for scheduledAt — that's a scheduling
  // decision, separate from the LLM design.
  const baseUrl = new URL(req.url).origin;
  const godBody = JSON.stringify({
    userId: brand.userId,
    brandId,
    igUserId: igAccount.igUserId,
  });

  const sig = createHmac('sha256', process.env.BRAIN_CRON_SECRET!).update(godBody).digest('hex');

  type GodPayload = {
    caption?: string;
    hashtags?: string;
    hookText?: string;
    angle?: string | null;
    sourceImageUrl?: string;
    imageDataUrl?: string;
    imageHash?: string | null;
    scheduledAt?: string | null;
    godModeRationale?: string;
    godModeFellBack?: boolean;
  };

  const fail = (reason: string, detail?: string) =>
    failAutopilot({
      brandId,
      frequency: settings.frequency as Frequency,
      bestSlot: brain?.formula?.bestSlot ?? null,
      now,
      reason,
      ...(detail ? { detail } : {}),
    });

  // One full god-mode generation (fresh copy + image). Returns the payload, or a
  // ready-to-return failAutopilot Response when the call itself fails.
  const generateOnce = async (): Promise<
    { ok: true; payload: GodPayload } | { ok: false; res: Promise<Response> }
  > => {
    try {
      const godRes = await fetch(`${baseUrl}/api/smart-posts/god-mode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-brain-signature': sig },
        body: godBody,
      });
      if (!godRes.ok) {
        const errText = await godRes.text().catch(() => '');
        const errorCode = `god_mode_${godRes.status}`;
        return { ok: false, res: fail(errorCode, `${errorCode}: ${errText.slice(0, 200)}`) };
      }
      return { ok: true, payload: (await godRes.json()) as GodPayload };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, res: fail('god_mode_fetch_failed', `god_mode_fetch_failed: ${msg}`) };
    }
  };

  const gradeDraft = async (cap: string, hook: string): Promise<GradeReport | null> => {
    try {
      return await runGrade(
        { brain, draft: { caption: cap, hookText: hook } },
        {
          llmCall: (system, user) =>
            cerebrasChatCompletion(
              [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              { temperature: 0.2, maxTokens: 400 },
            ),
        },
      );
    } catch (err) {
      console.warn('[autopilot] quality gate errored (fail-open):', err instanceof Error ? err.message : err);
      return null; // fail open — a grader outage must never block posting
    }
  };

  // Generate up to N times, keeping the highest-graded draft. Regenerating a
  // low-quality post (rather than only holding it) means autopilot still ships a
  // GOOD post on an off day instead of skipping. Each attempt is a full god-mode
  // run, so cap at 2 to bound cost/latency; we stop early the moment a draft
  // clears the quality bar (or the grader is unavailable → fail open).
  const MAX_ATTEMPTS = 2;
  let best: { payload: GodPayload; grade: GradeReport | null } | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const gen = await generateOnce();
    if (!gen.ok) {
      if (attempt === 0) return gen.res; // hard failure on the first try — surface it
      break; // a later regeneration failed — keep the best we already have
    }
    const cap = gen.payload.caption ?? '';
    const hook = gen.payload.hookText ?? '';
    if (!cap || !hook) continue; // empty generation — unusable, try again

    const grade = await gradeDraft(cap, hook);
    const score = grade?.score ?? -1;
    const bestScore = best?.grade?.score ?? -1;
    if (!best || score > bestScore) best = { payload: gen.payload, grade };

    if (!grade || !shouldHoldForQuality(grade)) break; // good enough / fail-open
    console.warn(`[autopilot] ${brandId} attempt ${attempt + 1} scored ${grade.score}/10 — regenerating`);
  }

  if (!best) return fail('empty_generation');

  const godPayload = best.payload;
  const caption = godPayload.caption ?? '';
  const hashtags = godPayload.hashtags ?? '';
  const hookText = godPayload.hookText ?? '';
  // Creative angle the caption engine rotated to — persisted so the next run's
  // LRU rotation is exact rather than re-inferred from hook text.
  const angle = godPayload.angle ?? null;
  // sourceImageUrl: the raw stock photo god-mode picked from Pixabay.
  const sourceImageUrl = godPayload.sourceImageUrl ?? null;
  // imageHash: perceptual hash of the source photo. Persisted so future
  // generations dedup the same visual even when it returns from a different
  // Pixabay URL.
  const imageHash = godPayload.imageHash ?? null;
  // imageDataUrl: the composited image (hook overlay + brand logo) as a
  // base64 data-URL. Buffer requires a publicly hosted URL, so upload it to
  // GitHub first. Falls back to sourceImageUrl if upload fails.
  const imageDataUrl = godPayload.imageDataUrl ?? null;

  if (!caption || !hookText) return fail('empty_generation');

  // After N attempts, if the BEST draft is STILL slop, hold it as a draft rather
  // than auto-publishing. Fail-open when the grade is unavailable.
  let qualityHeld = false;
  let qualityReason: string | null = null;
  if (best.grade && shouldHoldForQuality(best.grade)) {
    qualityHeld = true;
    qualityReason = `held_low_quality: best of ${MAX_ATTEMPTS} scored ${best.grade.score}/10${best.grade.weaknesses[0] ? ` — ${best.grade.weaknesses[0]}` : ''}`;
    console.warn(`[autopilot] holding ${brandId} post as draft — ${qualityReason}`);
  }

  // Upload the composited image to GitHub to get a public URL for Buffer.
  let processedImageUrl: string | null = null;
  if (imageDataUrl) {
    try {
      // imageDataUrl is "data:image/jpeg;base64,<data>" — strip the prefix.
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const fileName = `autopilot-${Date.now()}.jpg`;
      const upload = await uploadImageToGitHub(imageBuffer, fileName);
      processedImageUrl = upload.url;
    } catch (uploadErr) {
      // Upload failures must never block autopilot — fall back to stock URL.
      console.warn(
        '[autopilot] composited image upload failed, falling back to stock URL:',
        uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
      );
    }
  }

  // The URL we pass to Buffer. The composited image (god-mode) is already a
  // 1080x1080 square Instagram accepts. The raw stock fallback is NOT — its
  // arbitrary aspect ratio gets rejected at publish time ("unknown error"), so
  // run it through the IG-ready guard (square-crop + host) first. null means we
  // couldn't produce a valid image → send no image rather than a doomed one.
  const bufferImageUrl = processedImageUrl
    ?? (sourceImageUrl ? await ensureInstagramReadyImageUrl(sourceImageUrl) : null);

  // Compute scheduledAt from brain bestSlot when mode=auto. Uses the SAME
  // frequency-aware slot logic as nextRunAt: for every_other_day (and daily /
  // three_per_week) we schedule to the next best HOUR (today/tomorrow), NOT the
  // brain's best weekday — pinning to a weekday made an "every other day" post
  // land up to a week out and clustered every post on one day.
  const scheduledAt =
    settings.mode === 'auto' && brain?.formula?.bestSlot
      ? nextPostSlot(settings.frequency as Frequency, brain.formula.bestSlot, now)
      : null;

  let bufferPostId: string | null = null;
  let postStatus: 'draft' | 'scheduled' = 'draft';
  let lastError: string | null = null;

  if (settings.mode === 'auto' && scheduledAt && !qualityHeld) {
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
        if (!settings.bufferChannelId || !settings.bufferOrganizationId) {
          postStatus = 'draft';
          lastError = 'buffer_channel_not_selected';
        } else {
          try {
            const fullText = `${caption}\n\n${hashtags}`.trim();
            const bufferPost = await createPost(apiKey, {
              channelId: settings.bufferChannelId,
              organizationId: settings.bufferOrganizationId,
              text: fullText,
              mode: 'customScheduled',
              scheduledAt: scheduledAt.toISOString(),
              // Use the composited image (with hook overlay + brand logo) that
              // was uploaded to GitHub. Falls back to raw stock URL if upload failed.
              imageUrls: bufferImageUrl ? [bufferImageUrl] : undefined,
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

  // Slop held back: surface why so the dashboard shows "held for review" instead
  // of a silent draft. The post is still saved (below) as a reviewable draft.
  if (qualityHeld && !lastError) {
    lastError = qualityReason;
  }

  // Final no-reuse backstop. generateFromSeed already filters and JIT-rechecks
  // candidates against the brand's used-image set, but a truly-simultaneous run
  // (both requests composite in parallel, neither sees the other's insert) can
  // still slip through. Re-check here right before insert and discard this
  // generation if the URL is already on file. Better to skip than ship a dupe.
  //
  // URLs are compared by their normalised (query-string-stripped) form so
  // CDN-signed URLs (Instagram oh=/oe=, Unsplash ixlib=, Pexels h=/w=) match
  // across fetches of the same underlying photo.
  if (sourceImageUrl) {
    const brandImageRows = await db
      .select({ src: posts.sourceImageUrl, processed: posts.processedImageUrl })
      .from(posts)
      .where(eq(posts.brandId, brandId));
    const brandUsedUrls = buildDedupSet(
      brandImageRows.flatMap((r) => [r.src, r.processed]),
    );
    if (brandUsedUrls.has(normalizeImageUrlForDedup(sourceImageUrl))) {
      await db
        .update(autopilotSettings)
        .set({ lastError: 'race_duplicate_image_avoided', updatedAt: now })
        .where(eq(autopilotSettings.brandId, brandId));
      return NextResponse.json({
        status: 'skipped',
        reason: 'race_duplicate_image_avoided',
        message:
          'Another autopilot run just used this photo — skipping to avoid a duplicate. Click Run now again.',
      });
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
      angle,
      status: postStatus,
      scheduledAt,
      bufferPostId,
      // sourceImageUrl: the raw stock photo god-mode picked from Pixabay.
      sourceImageUrl,
      // imageHash: perceptual hash of the source — feeds future no-reuse checks.
      imageHash,
      // processedImageUrl: the composited version (hook overlay + brand logo)
      // hosted on GitHub — this is what was actually sent to Buffer.
      processedImageUrl,
      source: 'autopilot',
    })
    .returning({ id: posts.id });

  // Visibility: a post that drafted with no usable image (god-mode returned
  // neither a stock nor a composited URL) otherwise saves silently as a
  // src=null draft and never reaches Buffer. Surface it in lastError so the
  // dashboard explains the gap instead of looking like a stalled brand.
  if (!sourceImageUrl && !processedImageUrl && !lastError) {
    lastError = 'no_image';
  }

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
    sourceImageUrl,
    processedImageUrl,
    godModeFellBack: godPayload.godModeFellBack ?? false,
  });
}
