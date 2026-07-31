import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { brands, autopilotSettings, linkedAccounts } from '@/lib/db/schema';
import { getChannelHealth } from '@/lib/buffer';
import { checkChannelPushable } from '@/lib/autopilot/channel-health';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

const VALID_FREQ = ['daily', 'every_other_day', 'three_per_week', 'weekly'] as const;
const VALID_MODE = ['queue', 'auto'] as const;
type Frequency = typeof VALID_FREQ[number];
type Mode = typeof VALID_MODE[number];

async function ownedBrandOrError(req: Request): Promise<{ error?: Response; brand?: typeof brands.$inferSelect }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'unauth' }, { status: 401 }) };
  }
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) {
    return { error: NextResponse.json({ error: 'missing_brandId' }, { status: 400 }) };
  }
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, session.user.id)));
  if (!brand) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { brand };
}

export async function GET(req: Request): Promise<Response> {
  const guard = await ownedBrandOrError(req);
  if (guard.error) return guard.error;
  if (!guard.brand) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const [row] = await db
    .select()
    .from(autopilotSettings)
    .where(eq(autopilotSettings.brandId, guard.brand.id));
  // Return defaults when no row exists yet.
  if (!row) {
    return NextResponse.json({
      enabled: false,
      frequency: 'every_other_day',
      mode: 'queue',
      lastRunAt: null,
      nextRunAt: null,
      lastError: null,
      totalGenerated: 0,
      channelIssue: null,
    });
  }
  return NextResponse.json({
    enabled: row.enabled,
    frequency: row.frequency,
    mode: row.mode,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    lastError: row.lastError,
    totalGenerated: row.totalGenerated,
    // Live Buffer channel health, so a channel that has lost authorization is
    // visible the moment the page opens instead of days later in Buffer's UI.
    channelIssue: await describeChannelIssue(guard.brand.userId, row),
  });
}

// Asks Buffer whether this brand's channel can still receive posts. Returns null
// when it's fine, unknown, or not applicable — this is a diagnostic nicety and
// must never break the settings page, so every failure path returns null.
async function describeChannelIssue(
  userId: string,
  row: typeof autopilotSettings.$inferSelect,
): Promise<{ code: string; message: string; severity: 'error' | 'warning' } | null> {
  if (!row.bufferChannelId || !row.bufferOrganizationId) return null;
  try {
    const [link] = await db
      .select()
      .from(linkedAccounts)
      .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'buffer')));
    if (!link?.accessToken) return null;

    const health = await getChannelHealth(decrypt(link.accessToken), row.bufferOrganizationId);
    const check = checkChannelPushable(health.get(row.bufferChannelId));
    if (check.blocked) return { code: check.code, message: check.message, severity: 'error' };
    if (check.warning) return { code: 'buffer_queue_paused', message: check.warning, severity: 'warning' };
    return null;
  } catch (err) {
    console.error('[autopilot] channel health check failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const guard = await ownedBrandOrError(req);
  if (guard.error) return guard.error;
  if (!guard.brand) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    frequency?: string;
    mode?: string;
  };

  const update: { enabled?: boolean; frequency?: Frequency; mode?: Mode; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
  if (typeof body.frequency === 'string' && (VALID_FREQ as readonly string[]).includes(body.frequency)) {
    update.frequency = body.frequency as Frequency;
  }
  if (typeof body.mode === 'string' && (VALID_MODE as readonly string[]).includes(body.mode)) {
    update.mode = body.mode as Mode;
  }

  // Upsert.
  await db
    .insert(autopilotSettings)
    .values({
      brandId: guard.brand.id,
      enabled: update.enabled ?? false,
      frequency: update.frequency ?? 'every_other_day',
      mode: update.mode ?? 'queue',
    })
    .onConflictDoUpdate({
      target: autopilotSettings.brandId,
      set: update,
    });

  return NextResponse.json({ ok: true });
}
