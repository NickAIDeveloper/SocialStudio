import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands, autopilotSettings, posts, brainSignals, linkedAccounts } from '@/lib/db/schema';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { readBrandBrain } from '@/lib/brain/consume';
import { computeNextRunAt, isDueNow, type Frequency } from '@/lib/autopilot/schedule';
import { pickNextTopic, type TopicCluster } from '@/lib/autopilot/topic-rotation';
import { cerebrasChatCompletion } from '@/lib/cerebras';
import { createPost } from '@/lib/buffer';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

interface CaptionPayload {
  caption: string;
  hookText: string;
  hashtags: string;
}

async function generateCaptionForTopic(args: {
  brandName: string;
  briefMd: string | null;
  topic: string;
}): Promise<CaptionPayload> {
  const system = `You write Instagram posts for the brand "${args.brandName}".
Use the brand's strategy brief if provided. Output ONLY a JSON object.`;
  const briefBlock = args.briefMd
    ? `Strategy brief:\n${args.briefMd}\n\n`
    : '';
  const user = `${briefBlock}Topic for this post: ${args.topic}

Write one Instagram post:
- "hookText": 3-6 words, scroll-stopping
- "caption": 60-120 words, hook line + body + CTA
- "hashtags": 5 relevant hashtags space-separated, no commas

Return JSON: {"hookText": "...", "caption": "...", "hashtags": "#a #b #c #d #e"}`;

  const raw = await cerebrasChatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.8, maxTokens: 600, responseFormat: 'json' }
  );

  let parsed: Partial<CaptionPayload> = {};
  try {
    parsed = JSON.parse(raw) as Partial<CaptionPayload>;
  } catch {
    // Fall back to extracting from the raw text.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]) as Partial<CaptionPayload>; } catch { /* ignore */ }
    }
  }
  return {
    caption: typeof parsed.caption === 'string' ? parsed.caption.slice(0, 4000) : '',
    hookText: typeof parsed.hookText === 'string' ? parsed.hookText.slice(0, 200) : '',
    hashtags: typeof parsed.hashtags === 'string' ? parsed.hashtags.slice(0, 500) : '',
  };
}

interface BrainSignalsRow {
  topicClusters: unknown;
}

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
  // Pull topic clusters from latest 28d signals row.
  const [s28] = (await db
    .select({ topicClusters: brainSignals.topicClusters })
    .from(brainSignals)
    .where(and(eq(brainSignals.brandId, brandId), eq(brainSignals.windowDays, 28)))
    .orderBy(desc(brainSignals.computedAt))
    .limit(1)) as BrainSignalsRow[];

  const topics = (s28?.topicClusters ?? []) as TopicCluster[];

  // Look at last 14 days of posts to avoid topic repeats.
  const recentSinceDate = new Date(now.getTime() - 14 * 86_400_000);
  const recentPosts = await db
    .select({ caption: posts.caption })
    .from(posts)
    .where(and(eq(posts.brandId, brandId), gte(posts.createdAt, recentSinceDate)))
    .orderBy(desc(posts.createdAt))
    .limit(10);
  const recentTopics: string[] = recentPosts
    .map((p) => p.caption.split('\n')[0].slice(0, 80))
    .filter(Boolean);

  const topic = pickNextTopic({ topics, recentTopics, fallback: brand.name }) ?? brand.name;

  let caption: CaptionPayload;
  try {
    caption = await generateCaptionForTopic({
      brandName: brand.name,
      briefMd: brain?.briefMd ?? null,
      topic,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(autopilotSettings)
      .set({ lastError: msg, updatedAt: new Date() })
      .where(eq(autopilotSettings.brandId, brandId));
    return NextResponse.json({ status: 'failed', reason: msg });
  }

  if (!caption.caption || !caption.hookText) {
    await db
      .update(autopilotSettings)
      .set({ lastError: 'empty_generation', updatedAt: new Date() })
      .where(eq(autopilotSettings.brandId, brandId));
    return NextResponse.json({ status: 'failed', reason: 'empty_generation' });
  }

  // Compute scheduledAt: use bestSlot if mode=auto.
  const scheduledAt = settings.mode === 'auto' && brain?.formula?.bestSlot
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
    // Look up the user's Buffer integration.
    const [link] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, brand.userId), eq(linkedAccounts.provider, 'buffer')));

    if (!link?.accessToken) {
      // Buffer not connected — fall back to draft and surface the issue.
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
            const fullText = `${caption.caption}\n\n${caption.hashtags}`.trim();
            const bufferPost = await createPost(apiKey, {
              channelId: meta.selectedChannelId,
              organizationId: meta.selectedOrganizationId,
              text: fullText,
              mode: 'customScheduled',
              scheduledAt: scheduledAt.toISOString(),
            });
            bufferPostId = bufferPost.id;
            postStatus = 'scheduled';
          } catch (err) {
            // Buffer push failed — fall back to draft. User can manually publish later.
            postStatus = 'draft';
            lastError = `buffer_push_failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      }
    }
  } else {
    // Queue mode (default) — always draft.
    postStatus = 'draft';
  }

  const [inserted] = await db
    .insert(posts)
    .values({
      userId: brand.userId,
      brandId,
      caption: caption.caption,
      hashtags: caption.hashtags,
      hookText: caption.hookText,
      contentType: 'tip',
      status: postStatus,
      scheduledAt,
      bufferPostId,
    })
    .returning({ id: posts.id });

  // Update settings.
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
    topic,
    scheduledAt: scheduledAt?.toISOString() ?? null,
    nextRunAt: next.toISOString(),
    warning: lastError,
  });
}
