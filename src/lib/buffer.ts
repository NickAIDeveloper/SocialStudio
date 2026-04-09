const BUFFER_GRAPHQL_URL = 'https://api.buffer.com';

export interface BufferChannel {
  id: string;
  name: string;
  service: string;
  avatar: string;
}

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

export async function getOrganizationsAndChannels(apiKey: string): Promise<BufferOrganization[]> {
  const data = await bufferGraphQL<{
    account: { organizations: BufferOrganization[] };
  }>(apiKey, `{
    account {
      organizations {
        id
        name
        channels {
          id
          name
          service
          avatar
        }
      }
    }
  }`);
  return data.account.organizations;
}

export async function createPost(apiKey: string, params: SchedulePostParams): Promise<BufferPost> {
  const schedulingType = 'automatic';
  const dueAtField = params.mode === 'customScheduled' && params.scheduledAt
    ? `dueAt: ${JSON.stringify(params.scheduledAt)}`
    : '';
  const assetsField = params.imageUrls?.length
    ? `assets: { images: [${params.imageUrls.map(url => `{ url: ${JSON.stringify(url)} }`).join(', ')}] }`
    : '';

  const query = `mutation {
    createPost(input: {
      channelId: ${JSON.stringify(params.channelId)}
      text: ${JSON.stringify(params.text)}
      mode: ${params.mode}
      schedulingType: ${schedulingType}
      source: "social-studio"
      metadata: { instagram: { type: post, shouldShareToFeed: true } }
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
