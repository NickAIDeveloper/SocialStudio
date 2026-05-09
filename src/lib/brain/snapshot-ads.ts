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
    return { status: 'failed', reason: `ads_${res.status}` };
  }
  const json = (await res.json()) as { data?: unknown[] };
  const data = json.data ?? [];
  if (data.length === 0) {
    return { status: 'skipped', reason: 'no_campaigns' };
  }
  await input.persist?.({ hasCampaigns: true, insights: data });
  return { status: 'ok', sampleSize: data.length };
}
