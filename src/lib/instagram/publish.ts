// Publish straight to Instagram, on the token we own and auto-renew.
//
// Why this exists: Buffer's per-channel Instagram credential expires and Buffer
// exposes no way to renew it (verified: their API has 8 mutations, none
// auth-related — see scripts/diag-buffer-mutations.ts). So a dead channel means
// a human logging into buffer.com. Our own IG token is renewed daily by
// getFreshIgToken and has not needed a human since 2026-06-20.
//
// Meta's flow is three steps, not one (docs: instagram-platform/content-publishing):
//   1. POST /<IG_ID>/media          → create a container, Meta cURLs your image
//   2. GET  /<CONTAINER_ID>         → poll status_code until FINISHED
//   3. POST /<IG_ID>/media_publish  → publish the container
// Step 2 matters: Meta fetches the image asynchronously, so publishing straight
// after step 1 can fail with a container that isn't ready yet.
//
// Scope required: instagram_business_content_publish. Without it every call
// here returns 403 IGApiException code 10.

const IG_GRAPH_BASE = 'https://graph.instagram.com';

// Meta rejects captions past this. Truncating server-side beats a 400 that
// silently drops a post the autopilot already paid an LLM to write.
export const IG_CAPTION_MAX = 2200;

// Instagram publishes at most 100 API posts per rolling 24h per account.
export const IG_DAILY_POST_LIMIT = 100;

export type ContainerStatus = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';

export interface PublishRequest {
  igUserId: string;
  accessToken: string;
  imageUrl: string; // must be a PUBLIC url — Meta fetches it server-side
  caption: string;
}

export interface PublishResult {
  mediaId: string;
  containerId: string;
  // How many polls it took — useful for tuning the wait in production.
  polls: number;
}

export class InstagramPublishError extends Error {
  constructor(
    message: string,
    readonly step: 'container' | 'status' | 'publish',
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'InstagramPublishError';
  }
}

// Injectable seams so the whole flow is unit-testable without network or waiting.
export interface PublishDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxPolls?: number;
  pollIntervalMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function igPost(
  fetchImpl: typeof fetch,
  path: string,
  params: Record<string, string>,
  step: 'container' | 'publish',
): Promise<{ id: string }> {
  const u = new URL(`${IG_GRAPH_BASE}${path}`);
  const res = await fetchImpl(u.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new InstagramPublishError(
      `Instagram ${step} step failed (${res.status}): ${body}`,
      step,
      res.status,
      body,
    );
  }
  return JSON.parse(body) as { id: string };
}

// True when the error means "you never had permission", not "something broke".
// Worth distinguishing: the first needs a reconnect with the publish scope, the
// second is worth retrying.
export function isMissingPublishScope(err: unknown): boolean {
  if (!(err instanceof InstagramPublishError)) return false;
  return err.status === 403 || /permission for this action/i.test(err.body ?? '');
}

export async function publishToInstagram(
  req: PublishRequest,
  deps: PublishDeps = {},
): Promise<PublishResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const maxPolls = deps.maxPolls ?? 12;
  const pollIntervalMs = deps.pollIntervalMs ?? 2_000;

  if (!req.imageUrl.startsWith('https://')) {
    throw new InstagramPublishError(
      `Instagram fetches the image itself, so it must be a public https URL — got: ${req.imageUrl}`,
      'container',
    );
  }

  const caption =
    req.caption.length > IG_CAPTION_MAX ? req.caption.slice(0, IG_CAPTION_MAX) : req.caption;

  // 1. container
  const container = await igPost(
    fetchImpl,
    `/${req.igUserId}/media`,
    { image_url: req.imageUrl, caption, access_token: req.accessToken },
    'container',
  );

  // 2. poll until Meta has actually fetched and processed the image
  let polls = 0;
  for (; polls < maxPolls; polls++) {
    const u = new URL(`${IG_GRAPH_BASE}/${container.id}`);
    u.searchParams.set('fields', 'status_code,status');
    u.searchParams.set('access_token', req.accessToken);
    const res = await fetchImpl(u.toString());
    const body = await res.text();
    if (!res.ok) {
      throw new InstagramPublishError(
        `Instagram status check failed (${res.status}): ${body}`,
        'status',
        res.status,
        body,
      );
    }
    const { status_code: code, status } = JSON.parse(body) as {
      status_code: ContainerStatus;
      status?: string;
    };
    if (code === 'FINISHED') break;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new InstagramPublishError(
        `Instagram rejected the media (${code}): ${status ?? 'no detail'}`,
        'status',
        undefined,
        body,
      );
    }
    await sleep(pollIntervalMs);
  }

  if (polls >= maxPolls) {
    throw new InstagramPublishError(
      `Instagram never finished processing the image after ${maxPolls} checks`,
      'status',
    );
  }

  // 3. publish
  const published = await igPost(
    fetchImpl,
    `/${req.igUserId}/media_publish`,
    { creation_id: container.id, access_token: req.accessToken },
    'publish',
  );

  return { mediaId: published.id, containerId: container.id, polls };
}
