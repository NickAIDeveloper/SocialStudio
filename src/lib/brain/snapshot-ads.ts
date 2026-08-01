import type { SnapshotResponse } from './types';

export interface SnapshotAdsInput {
  brandId: string;
  adAccountId: string | null;
  accessToken: string;
  day: string;
  fetcher?: typeof fetch;
  persist?: (payload: { hasCampaigns: boolean; insights: unknown }) => Promise<void>;
}

// v1 stub: if there are no campaigns running, skip with a clear reason.
// When the user starts running ads, this will light up automatically.
export async function snapshotAds(input: SnapshotAdsInput): Promise<SnapshotResponse> {
  if (!input.adAccountId) {
    return { status: 'skipped', reason: 'no_campaigns' };
  }

  const fetcher = input.fetcher ?? fetch;
  const url = `https://graph.facebook.com/v21.0/${input.adAccountId}/insights?date_preset=last_28d&level=campaign&fields=campaign_name,impressions,reach,clicks,ctr,cpc,actions&access_token=${input.accessToken}`;
  const res = await fetcher(url);
  if (!res.ok) {
    // Surface WHAT failed, not just that it did. This returned a bare
    // "ads_400" every night from 2026-07-28 while the actual cause — an expired
    // Meta token needing a human reconnect — was never visible in the log.
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { code?: number; message?: string } };
      if (body.error?.code === 190) detail = '_token_expired';
      else if (body.error?.message) detail = `_${body.error.message.slice(0, 60)}`;
    } catch {
      // Non-JSON error body — the status code alone will have to do.
    }
    return { status: 'failed', reason: `ads_${res.status}${detail}` };
  }
  const json = (await res.json()) as { data?: unknown[] };
  const data = json.data ?? [];
  if (data.length === 0) {
    return { status: 'skipped', reason: 'no_campaigns' };
  }
  await input.persist?.({ hasCampaigns: true, insights: data });
  return { status: 'ok', sampleSize: data.length };
}
