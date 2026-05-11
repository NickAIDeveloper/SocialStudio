import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import { linkedAccounts } from '@/lib/db/schema';
import { getOrganizationsAndChannels } from '@/lib/buffer';

export const dynamic = 'force-dynamic';

interface MetadataShape {
  selectedChannelId?: string;
  selectedOrganizationId?: string;
  selectedChannelName?: string;
  [key: string]: unknown;
}

async function loadLink(userId: string) {
  const [link] = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.provider, 'buffer')))
    .limit(1);
  return link ?? null;
}

export async function GET(): Promise<Response> {
  const userId = await getUserId();
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

  const meta = (link.metadata ?? {}) as MetadataShape;
  return NextResponse.json({
    connected: true,
    channels,
    selected: meta.selectedChannelId
      ? {
          channelId: meta.selectedChannelId,
          organizationId: meta.selectedOrganizationId ?? null,
          channelName: meta.selectedChannelName ?? null,
        }
      : null,
    error: listError,
  });
}

export async function PATCH(req: Request): Promise<Response> {
  const userId = await getUserId();
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

  const prevMeta = (link.metadata ?? {}) as MetadataShape;
  const nextMeta: MetadataShape = {
    ...prevMeta,
    selectedChannelId: body.channelId,
    selectedOrganizationId: body.organizationId,
    selectedChannelName: body.channelName ?? prevMeta.selectedChannelName,
  };
  await db
    .update(linkedAccounts)
    .set({ metadata: nextMeta, updatedAt: new Date() })
    .where(eq(linkedAccounts.id, link.id));

  return NextResponse.json({
    ok: true,
    selected: {
      channelId: body.channelId,
      organizationId: body.organizationId,
      channelName: body.channelName ?? null,
    },
  });
}
