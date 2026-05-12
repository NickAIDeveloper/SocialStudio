import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { linkedAccounts, brands, autopilotSettings } from '@/lib/db/schema';
import { getOrganizationsAndChannels } from '@/lib/buffer';

export const dynamic = 'force-dynamic';

async function loadLink(userId: string) {
  const [link] = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'buffer')))
    .limit(1);
  return link ?? null;
}

async function validateBrand(userId: string, brandId: string) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
    .limit(1);
  return brand ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const userId = await getUserId();
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) {
    return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });
  }

  const brand = await validateBrand(userId, brandId);
  if (!brand) {
    return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });
  }

  const link = await loadLink(userId);
  if (!link?.accessToken) {
    return NextResponse.json({ connected: false, channels: [], selected: null });
  }

  let apiKey: string;
  try {
    apiKey = decrypt(link.accessToken);
  } catch {
    return NextResponse.json({ connected: false, channels: [], selected: null, error: 'token_decrypt_failed' });
  }

  let channels: { id: string; name: string; service: string; organizationId: string; organizationName: string }[] = [];
  let listError: string | null = null;
  try {
    const orgs = await getOrganizationsAndChannels(apiKey);
    for (const org of orgs) {
      for (const ch of org.channels ?? []) {
        channels.push({
          id: ch.id,
          name: ch.name,
          service: ch.service,
          organizationId: org.id,
          organizationName: org.name,
        });
      }
    }
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err);
  }

  // Read selected channel from per-brand autopilotSettings row.
  const [apSettings] = await db
    .select({
      bufferChannelId: autopilotSettings.bufferChannelId,
      bufferOrganizationId: autopilotSettings.bufferOrganizationId,
      bufferChannelName: autopilotSettings.bufferChannelName,
    })
    .from(autopilotSettings)
    .where(eq(autopilotSettings.brandId, brandId))
    .limit(1);

  const selected =
    apSettings?.bufferChannelId && apSettings?.bufferOrganizationId
      ? {
          channelId: apSettings.bufferChannelId,
          organizationId: apSettings.bufferOrganizationId,
          channelName: apSettings.bufferChannelName ?? null,
        }
      : null;

  return NextResponse.json({
    connected: true,
    channels,
    selected,
    error: listError,
  });
}

export async function PATCH(req: Request): Promise<Response> {
  const userId = await getUserId();
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  if (!brandId) {
    return NextResponse.json({ error: 'missing_brandId' }, { status: 400 });
  }

  const brand = await validateBrand(userId, brandId);
  if (!brand) {
    return NextResponse.json({ error: 'brand_not_found' }, { status: 404 });
  }

  const link = await loadLink(userId);
  if (!link) {
    return NextResponse.json({ error: 'buffer_not_connected' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    channelId?: string;
    organizationId?: string;
    channelName?: string;
  };
  if (!body.channelId || !body.organizationId) {
    return NextResponse.json({ error: 'missing_channelId_or_organizationId' }, { status: 400 });
  }

  // Upsert per-brand channel selection into autopilotSettings.
  await db
    .insert(autopilotSettings)
    .values({
      brandId,
      bufferChannelId: body.channelId,
      bufferOrganizationId: body.organizationId,
      bufferChannelName: body.channelName ?? null,
    })
    .onConflictDoUpdate({
      target: autopilotSettings.brandId,
      set: {
        bufferChannelId: body.channelId,
        bufferOrganizationId: body.organizationId,
        bufferChannelName: body.channelName ?? null,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({
    ok: true,
    selected: {
      channelId: body.channelId,
      organizationId: body.organizationId,
      channelName: body.channelName ?? null,
    },
  });
}
