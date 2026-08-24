const BUFFER_GRAPHQL_URL = 'https://api.buffer.com';

export interface BufferChannel {
  id: string;
  name: string;
  service: string;
  avatar: string;
}

// Re-exported from the autopilot policy module so callers get one shape.
export type { BufferChannelHealth } from './autopilot/channel-health';
import type { BufferChannelHealth } from './autopilot/channel-health';

export interface BufferOrganization {
  id: string;
  name: string;
  channels: BufferChannel[];
}

export interface BufferPost {
  id: string;
  status: string;
  text: string;
  dueAt: string | null;
  createdAt: string;
  channelId: string;
  channelService: string;
  shareMode: string;
}

export interface BufferPostWithAnalytics {
  id: string;
  status: string;
  text: string;
  dueAt: string | null;
  createdAt: string;
  channelId: string;
  channelService: string;
  channelName: string;
  shareMode: string;
  statistics: {
    likes: number;
    comments: number;
    reach: number;
    impressions: number;
    saves: number;
    shares: number;
    clicks: number;
    engagementRate: number;
  };
  brand: 'affectly' | 'pacebrain';
  hashtags: string[];
  captionLength: number;
  mediaType: 'image' | 'video' | 'carousel' | 'text';
}

export interface SchedulePostParams {
  channelId: string;
  organizationId: string;
  text: string;
  imageUrls?: string[];
  // Vertical clip to publish as a Reel (M3). Mutually exclusive with imageUrls —
  // when present it wins, since a post is one or the other. Validate with
  // checkReelAsset before calling.
  video?: { url: string; thumbnailUrl?: string };
  scheduledAt?: string; // ISO date string
  mode: 'addToQueue' | 'shareNow' | 'customScheduled';
}

async function bufferGraphQL<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(BUFFER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Buffer GraphQL error [${response.status}]:`, errorBody);
    if (response.status === 429) {
      throw new Error('Buffer rate limit exceeded. Please wait 15 minutes and try again.');
    }
    throw new Error(`Buffer API error (HTTP ${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    const msg = json.errors.map((e: { message: string }) => e.message).join('; ');
    console.error('Buffer GraphQL errors:', json.errors);
    throw new Error(`Buffer GraphQL error: ${msg}`);
  }

  return json.data as T;
}

// Organizations with their channels.
//
// Deliberately TWO queries. Asking for organizations.channels in one go returns
// FORBIDDEN from Buffer's nested channels resolver, and because the field is
// non-null that error propagates over the ENTIRE response — so the whole call
// fails, not just the channels. That took down the channel dropdown once
// already; getChannelHealth was moved to the top-level channels(input:) query
// for the same reason, but these callers were missed and every consumer of this
// function (calendar, linked accounts, default-channel picker, the queue view)
// has been failing with "Not authorized to access this resource".
export async function getOrganizationsAndChannels(apiKey: string): Promise<BufferOrganization[]> {
  const data = await bufferGraphQL<{
    account: { organizations: Array<{ id: string; name: string }> };
  }>(apiKey, `{
    account {
      organizations {
        id
        name
      }
    }
  }`);

  const orgs = data.account?.organizations ?? [];

  return Promise.all(
    orgs.map(async (org) => {
      const res = await bufferGraphQL<{ channels: BufferChannel[] }>(
        apiKey,
        `{
          channels(input: { organizationId: ${JSON.stringify(org.id)} }) {
            id
            name
            service
            avatar
          }
        }`,
      );
      return { id: org.id, name: org.name, channels: res.channels ?? [] };
    }),
  );
}

// Per-channel health for an organization, keyed by channel id.
//
// Buffer keeps its OWN Instagram/Meta credential per channel (nothing to do with
// the IG token lib/meta/ig-token.ts refreshes). When it expires the channel goes
// isDisconnected=true and every post pushed into it dies at publish time with
// "Invalid Credentials" — see lib/autopilot/channel-health.ts for the policy.
//
// Uses the TOP-LEVEL channels(input:) query on purpose: the nested
// organizations.channels resolver returns FORBIDDEN and its non-null wrapper
// propagates the failure over the whole response.
export async function getChannelHealth(
  apiKey: string,
  orgId: string,
): Promise<Map<string, BufferChannelHealth>> {
  const data = await bufferGraphQL<{ channels: BufferChannelHealth[] }>(
    apiKey,
    `{
      channels(input: { organizationId: ${JSON.stringify(orgId)} }) {
        id
        name
        service
        isDisconnected
        isLocked
        isQueuePaused
      }
    }`,
  );
  return new Map((data.channels ?? []).map(c => [c.id, c]));
}

export async function createPost(apiKey: string, params: SchedulePostParams): Promise<BufferPost> {
  const schedulingType = 'automatic';
  const dueAtField = params.mode === 'customScheduled' && params.scheduledAt
    ? `dueAt: ${JSON.stringify(params.scheduledAt)}`
    : '';
  // A post carries either a video or images, never both. Video wins when set.
  const assetsField = params.video
    ? `assets: [{ video: { url: ${JSON.stringify(params.video.url)}` +
      (params.video.thumbnailUrl ? `, thumbnail: { url: ${JSON.stringify(params.video.thumbnailUrl)} }` : '') +
      ` } }]`
    : params.imageUrls?.length
      ? `assets: [${params.imageUrls.map(url => `{ image: { url: ${JSON.stringify(url)} } }`).join(', ')}]`
      : '';

  // Instagram needs to be told a video is a Reel; the default post type would
  // publish it to the feed instead, which is the surface we're trying to leave.
  const instagramMeta = params.video
    ? '{ instagram: { type: reel, shouldShareToFeed: true } }'
    : '{ instagram: { type: post, shouldShareToFeed: true } }';

  const query = `mutation {
    createPost(input: {
      channelId: ${JSON.stringify(params.channelId)}
      text: ${JSON.stringify(params.text)}
      mode: ${params.mode}
      schedulingType: ${schedulingType}
      source: "social-studio"
      metadata: ${instagramMeta}
      ${dueAtField}
      ${assetsField}
    }) {
      ... on PostActionSuccess {
        post {
          id
          status
          text
          dueAt
          createdAt
          channelId
          channelService
          shareMode
        }
      }
      ... on InvalidInputError { message }
      ... on NotFoundError { message }
      ... on UnauthorizedError { message }
      ... on UnexpectedError { message }
      ... on LimitReachedError { message }
      ... on RestProxyError { message }
    }
  }`;

  const data = await bufferGraphQL<{ createPost: Record<string, unknown> }>(apiKey, query);
  const result = data.createPost;

  // Check for error union types
  if ('message' in result && !('post' in result)) {
    throw new Error(`Buffer error: ${result.message}`);
  }

  if (!result.post) {
    throw new Error(`Buffer returned unexpected response: ${JSON.stringify(result)}`);
  }

  return result.post as BufferPost;
}

async function fetchPostsByStatus(apiKey: string, orgId: string, statuses: string[], limit = 50): Promise<BufferPost[]> {
  try {
    const statusFilter = statuses.length > 0
      ? `filter: { status: [${statuses.join(', ')}] }`
      : '';
    const query = `{
      posts(input: { organizationId: ${JSON.stringify(orgId)} ${statusFilter ? `, ${statusFilter}` : ''} }, first: ${limit}) {
        edges {
          node {
            id
            status
            text
            dueAt
            createdAt
            channelId
            channelService
            shareMode
          }
        }
      }
    }`;
    const data = await bufferGraphQL<{
      posts: { edges: Array<{ node: BufferPost }> };
    }>(apiKey, query);
    return data.posts?.edges?.map(e => e.node) || [];
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return [];
  }
}

export async function getSentPosts(apiKey: string): Promise<BufferPost[]> {
  try {
    const orgs = await getOrganizationsAndChannels(apiKey);
    const allPosts: BufferPost[] = [];
    for (const org of orgs) {
      const posts = await fetchPostsByStatus(apiKey, org.id, ['sent'], 50);
      allPosts.push(...posts);
    }
    allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return allPosts;
  } catch (error) {
    console.error('Failed to fetch sent posts:', error);
    return [];
  }
}

export async function getQueuedPosts(apiKey: string): Promise<BufferPost[]> {
  try {
    const orgs = await getOrganizationsAndChannels(apiKey);
    const allPosts: BufferPost[] = [];
    for (const org of orgs) {
      const posts = await fetchPostsByStatus(apiKey, org.id, ['scheduled', 'sending'], 50);
      allPosts.push(...posts);
    }
    allPosts.sort((a, b) => {
      const aDate = a.dueAt || a.createdAt;
      const bDate = b.dueAt || b.createdAt;
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });
    return allPosts;
  } catch (error) {
    console.error('Failed to fetch queued posts:', error);
    return [];
  }
}

// Authoritative single-post lookup by id. Unlike the org `posts` feed (which is
// windowed — it caps well below a channel's full sent history), this resolves
// any post id directly, so it can tell "Buffer sent it" apart from "Buffer
// dropped it" (NOT_FOUND). Used by status reconciliation as the source of truth.
// Buffer's own explanation of why a post failed to publish. Worth keeping: it is
// the difference between a bare "Failed" and "Buffer lost authorization to post
// to pacebrain.app — reconnect it".
export interface BufferPublishingError {
  message: string | null;
  rawError: string | null;
}

export type BufferPostLookup =
  | { found: true; status: string; dueAt: string | null; error?: BufferPublishingError | null }
  | { found: false };

export async function getPostById(apiKey: string, id: string): Promise<BufferPostLookup> {
  const query = `{
    post(input: { id: ${JSON.stringify(id)} }) {
      ... on Post { id status dueAt error { message rawError } }
    }
  }`;
  const response = await fetch(BUFFER_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`Buffer API error (HTTP ${response.status})`);
  }
  const json = await response.json();
  if (json.errors?.length) {
    const notFound = json.errors.some(
      (e: { message?: string; extensions?: { code?: string } }) =>
        e.extensions?.code === 'NOT_FOUND' || /not found/i.test(e.message ?? ''),
    );
    if (notFound) return { found: false };
    throw new Error(`Buffer GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`);
  }
  const p = json.data?.post;
  if (!p) return { found: false };
  return { found: true, status: p.status, dueAt: p.dueAt ?? null, error: p.error ?? null };
}

// Bulk status map for an organization, paginated up to `maxPages` (×100 posts).
// The org feed is windowed, so this covers RECENT posts efficiently (one or two
// requests for the whole queue) but may miss old ones — callers fall back to
// getPostById for any id not present here. Returns id → {status, dueAt}.
export async function getOrgPostStatusMap(
  apiKey: string,
  orgId: string,
  maxPages = 3,
): Promise<Map<string, { status: string; dueAt: string | null; error: BufferPublishingError | null }>> {
  const out = new Map<string, { status: string; dueAt: string | null; error: BufferPublishingError | null }>();
  let after: string | null = null;
  let pages = 0;
  do {
    const afterArg: string = after ? `, after: ${JSON.stringify(after)}` : '';
    const query = `{
      posts(input: { organizationId: ${JSON.stringify(orgId)} }, first: 100${afterArg}) {
        pageInfo { hasNextPage endCursor }
        edges { node { id status dueAt ... on Post { error { message rawError } } } }
      }
    }`;
    const response = await fetch(BUFFER_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) throw new Error(`Buffer API error (HTTP ${response.status})`);
    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(`Buffer GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`);
    }
    for (const e of json.data?.posts?.edges ?? []) {
      out.set(e.node.id, {
        status: e.node.status,
        dueAt: e.node.dueAt ?? null,
        error: e.node.error ?? null,
      });
    }
    const pi = json.data?.posts?.pageInfo;
    after = pi?.hasNextPage ? pi.endCursor : null;
    pages++;
  } while (after && pages < maxPages);
  return out;
}

export async function createIdea(
  apiKey: string,
  organizationId: string,
  title: string,
  text: string
): Promise<{ id: string; content: { title: string; text: string } }> {
  const query = `mutation {
    createIdea(input: {
      organizationId: ${JSON.stringify(organizationId)}
      content: {
        title: ${JSON.stringify(title)}
        text: ${JSON.stringify(text)}
      }
    }) {
      ... on Idea {
        id
        content {
          title
          text
        }
      }
    }
  }`;

  const data = await bufferGraphQL<{ createIdea: { id: string; content: { title: string; text: string } } }>(apiKey, query);
  return data.createIdea;
}

export async function getSentPostsWithAnalytics(apiKey: string): Promise<BufferPostWithAnalytics[]> {
  try {
    const orgs = await getOrganizationsAndChannels(apiKey);
    const allPosts: BufferPostWithAnalytics[] = [];

    // Build channel name lookup for brand detection
    const channelMap = new Map<string, { name: string; brand: 'affectly' | 'pacebrain' }>();
    for (const org of orgs) {
      for (const channel of org.channels) {
        const brand = channel.name.toLowerCase().includes('affectly') ? 'affectly' as const : 'pacebrain' as const;
        channelMap.set(channel.id, { name: channel.name, brand });
      }
    }

    for (const org of orgs) {
      // Fetch ALL posts (sent + scheduled) using correct top-level posts query
      const posts = await fetchPostsByStatus(apiKey, org.id, [], 100);

      for (const post of posts) {
        const channelInfo = channelMap.get(post.channelId) || { name: 'Unknown', brand: 'pacebrain' as const };
        const hashtags = (post.text.match(/#\w+/g) || []).map(t => t.toLowerCase());

        allPosts.push({
          ...post,
          channelName: channelInfo.name,
          statistics: {
            likes: 0, comments: 0, reach: 0, impressions: 0,
            saves: 0, shares: 0, clicks: 0, engagementRate: 0,
          },
          brand: channelInfo.brand,
          hashtags,
          captionLength: post.text.replace(/#\w+/g, '').trim().length,
          mediaType: 'image',
        });
      }
    }

    allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return allPosts;
  } catch (error) {
    console.error('Failed to fetch posts with analytics:', error);
    return [];
  }
}
