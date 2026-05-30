// src/lib/meta/ads.ts
// Write-side Meta Marketing API client. Mirrors the read-only client.ts:
// stateless, takes a plaintext access token. Every create call sends
// status=PAUSED so nothing can spend until the user activates it manually.
import { fetchImageBytes } from './safe-image-fetch';

const META_API_VERSION = process.env.META_API_VERSION ?? 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function actId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

async function graphPost<T>(
  path: string,
  accessToken: string,
  fields: Record<string, string>,
): Promise<T> {
  const body = new URLSearchParams({ ...fields, access_token: accessToken });
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta write error ${res.status} on ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

// 1. Upload the image to the ad account's library → image_hash.
// Meta will not reference an arbitrary external URL in a creative, so we fetch
// the bytes and upload them as a base64 `bytes` field. The URL is user-editable
// (StepCreative), so fetchImageBytes applies SSRF protections: https-only,
// blocks private/loopback/metadata IPs, manual redirect re-validation, and an
// image/* content-type + size cap.
export async function uploadAdImage(
  accessToken: string,
  adAccountId: string,
  imageUrl: string,
): Promise<string> {
  const bytes = (await fetchImageBytes(imageUrl)).toString('base64');

  const json = await graphPost<{ images: Record<string, { hash: string }> }>(
    `/${actId(adAccountId)}/adimages`,
    accessToken,
    { bytes },
  );
  const first = Object.values(json.images ?? {})[0];
  if (!first?.hash) throw new Error('Meta did not return an image hash');
  return first.hash;
}

// 2. Campaign (objective lives here). PAUSED.
export async function createCampaign(
  accessToken: string,
  adAccountId: string,
  metaObjective: string,
): Promise<string> {
  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/campaigns`,
    accessToken,
    {
      name: `Ad Builder — ${metaObjective} — ${new Date().toISOString().slice(0, 10)}`,
      objective: metaObjective,
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
    },
  );
  return json.id;
}

export interface AdSetInput {
  campaignId: string;
  optimizationGoal: string;
  billingEvent: string;
  dailyBudgetMinor: number;
  startTime: string;
  endTime: string;
  targeting: Record<string, unknown>;
  // Required for OUTCOME_APP_PROMOTION. application_id is the Meta app id
  // (numeric string from Meta Business Manager). object_store_url is the
  // canonical App Store URL. When absent the field is omitted entirely so
  // non-APP objectives are unaffected.
  promotedObject?: { application_id: string; object_store_url: string };
}

// 3. Ad set (who/how-much/when). PAUSED.
// For APP objective, pass input.promotedObject = { application_id, object_store_url }
// so Meta can associate the ad set with the registered app. When absent (all other
// objectives) the promoted_object field is omitted from the request entirely.
export async function createAdSet(
  accessToken: string,
  adAccountId: string,
  input: AdSetInput,
): Promise<string> {
  const fields: Record<string, string> = {
    name: `Ad set — ${new Date().toISOString().slice(0, 16)}`,
    campaign_id: input.campaignId,
    optimization_goal: input.optimizationGoal,
    billing_event: input.billingEvent,
    daily_budget: String(input.dailyBudgetMinor),
    start_time: input.startTime,
    end_time: input.endTime,
    targeting: JSON.stringify(input.targeting),
    status: 'PAUSED',
  };
  if (input.promotedObject) {
    fields.promoted_object = JSON.stringify(input.promotedObject);
  }
  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/adsets`,
    accessToken,
    fields,
  );
  return json.id;
}

export interface CreativeInput {
  pageId: string;
  igAccountId?: string;
  imageHash: string;
  message: string; // primary text
  headline: string;
  link: string;
  cta: string; // e.g. LEARN_MORE
}

// 4. Ad creative (what people see). object_story_spec link ad.
export async function createAdCreative(
  accessToken: string,
  adAccountId: string,
  input: CreativeInput,
): Promise<string> {
  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    link_data: {
      image_hash: input.imageHash,
      message: input.message,
      name: input.headline,
      link: input.link,
      call_to_action: { type: input.cta, value: { link: input.link } },
    },
  };
  if (input.igAccountId) objectStorySpec.instagram_actor_id = input.igAccountId;

  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/adcreatives`,
    accessToken,
    {
      name: `Creative — ${new Date().toISOString().slice(0, 16)}`,
      object_story_spec: JSON.stringify(objectStorySpec),
    },
  );
  return json.id;
}

// 5. Ad (glues creative onto ad set). PAUSED.
export async function createAd(
  accessToken: string,
  adAccountId: string,
  input: { adsetId: string; creativeId: string; name: string },
): Promise<string> {
  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/ads`,
    accessToken,
    {
      name: input.name,
      adset_id: input.adsetId,
      creative: JSON.stringify({ creative_id: input.creativeId }),
      status: 'PAUSED',
    },
  );
  return json.id;
}

// Resolve free-text interest names → Meta interest IDs via the Targeting
// Search API. Names that resolve to nothing are dropped (broad targeting).
export async function searchAdInterests(
  accessToken: string,
  query: string,
): Promise<{ id: string; name: string } | null> {
  const u = new URL(`${GRAPH_BASE}/search`);
  u.searchParams.set('type', 'adinterest');
  u.searchParams.set('q', query);
  u.searchParams.set('limit', '1');
  u.searchParams.set('access_token', accessToken);
  const res = await fetch(u);
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: Array<{ id: string; name: string }> };
  return json.data?.[0] ?? null;
}

// Deep link into Ads Manager filtered to the created campaign.
export function buildAdsManagerUrl(adAccountId: string, campaignId: string): string {
  const num = adAccountId.replace('act_', '');
  return `https://www.facebook.com/adsmanager/manage/campaigns?act=${num}&selected_campaign_ids=${campaignId}`;
}
