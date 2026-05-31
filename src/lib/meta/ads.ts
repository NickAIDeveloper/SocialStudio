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
      // Meta Marketing API v21+ rejects campaign creation without this flag
      // (error subcode 4834011). We keep budget at the ad-set level (no campaign
      // budget optimization), so ad-set budget sharing is disabled.
      is_adset_budget_sharing_enabled: 'false',
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
    // Auto-bid ("Highest volume"). Without an explicit strategy Meta falls back
    // to one that demands a bid cap and rejects the ad set with subcode 2490487
    // ("Bid Amount Or Bid Constraints Required For Bid Strategy"). LOWEST_COST_
    // WITHOUT_CAP needs no bid_amount and belongs on the ad set for non-CBO
    // campaigns (budget is at the ad-set level here).
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
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

// 4b. Upload a video to the ad account's video library via the advideos edge.
// Meta recommends supplying a publicly accessible file_url rather than
// uploading raw bytes for large video files. Returns the video id.
// Reference: https://developers.facebook.com/docs/marketing-api/reference/adaccount/advideos/
export async function uploadAdVideo(
  accessToken: string,
  adAccountId: string,
  videoUrl: string,
): Promise<string> {
  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/advideos`,
    accessToken,
    { file_url: videoUrl },
  );
  return json.id;
}

// 4c. Poll the video's status until it is ready for use in a creative.
// Meta encodes uploaded videos asynchronously; the creative will be rejected
// if the video is still 'processing'. Default: up to 20 tries with 3 s gaps.
// Pass { tries, delayMs } in opts to override (useful in tests: delayMs: 0).
export async function waitForVideoReady(
  accessToken: string,
  videoId: string,
  opts?: { tries?: number; delayMs?: number },
): Promise<void> {
  const tries = opts?.tries ?? 20;
  const delayMs = opts?.delayMs ?? 3000;

  for (let i = 0; i < tries; i++) {
    const url = `${GRAPH_BASE}/${videoId}?fields=status&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meta video status error ${res.status} for ${videoId}: ${text}`);
    }
    const json = (await res.json()) as { status?: { video_status?: string } };
    const videoStatus = json.status?.video_status;
    if (videoStatus === 'ready') return;
    if (videoStatus === 'error') throw new Error(`Meta video processing failed for ${videoId}`);
    if (i < tries - 1) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Meta video ${videoId} did not become ready within ${tries} polls`);
}

export interface VideoCreativeInput {
  pageId: string;
  igAccountId?: string;
  videoId: string;
  thumbnailUrl: string; // poster/thumbnail image URL — required by Meta
  message: string; // primary text
  headline: string;
  link: string;
  cta: string; // e.g. LEARN_MORE
}

// 4d. Ad creative using video_data (NOT link_data). Meta requires a thumbnail
// (image_url) alongside the video_id in the video_data spec.
// Reference: https://developers.facebook.com/docs/marketing-api/reference/video-creative/
export async function createVideoCreative(
  accessToken: string,
  adAccountId: string,
  input: VideoCreativeInput,
): Promise<string> {
  const videoData: Record<string, unknown> = {
    video_id: input.videoId,
    image_url: input.thumbnailUrl,
    message: input.message,
    title: input.headline,
    call_to_action: { type: input.cta, value: { link: input.link } },
    link_description: '',
  };

  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    video_data: videoData,
  };
  if (input.igAccountId) objectStorySpec.instagram_actor_id = input.igAccountId;

  const json = await graphPost<{ id: string }>(
    `/${actId(adAccountId)}/adcreatives`,
    accessToken,
    {
      name: `Video Creative — ${new Date().toISOString().slice(0, 16)}`,
      object_story_spec: JSON.stringify(objectStorySpec),
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

// Fetch each ad's effective_status from Meta. Best-effort: any failure maps to
// null so the list still renders from stored data.
export async function getAdStatuses(
  accessToken: string,
  adIds: string[],
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    adIds.map(async (id) => {
      try {
        const u = new URL(`${GRAPH_BASE}/${id}`);
        u.searchParams.set('fields', 'effective_status');
        u.searchParams.set('access_token', accessToken);
        const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [id, null] as const;
        const j = (await res.json()) as { effective_status?: string };
        return [id, j.effective_status ?? null] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// Deep link into Ads Manager filtered to the created campaign.
export function buildAdsManagerUrl(adAccountId: string, campaignId: string): string {
  const num = adAccountId.replace('act_', '');
  return `https://www.facebook.com/adsmanager/manage/campaigns?act=${num}&selected_campaign_ids=${campaignId}`;
}
