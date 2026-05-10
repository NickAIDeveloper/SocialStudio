const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const MEDIA_FIELDS =
  'id,caption,timestamp,like_count,comments_count,media_type,media_product_type,permalink,thumbnail_url,media_url';

export interface BusinessDiscoveryInput {
  igUserId: string;
  handle: string;
  accessToken: string;
  fetcher?: typeof fetch;
}

export interface BusinessDiscoveryResponse {
  business_discovery?: {
    id: string;
    username: string;
    followers_count?: number;
    media_count?: number;
    media?: { data: BdMediaItem[] };
  };
  id?: string;
}

export interface BdMediaItem {
  id: string;
  caption?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
}

export interface ParsedScrapedPost {
  shortcode: string;
  caption: string;
  likes: number;
  comments: number;
  imageUrl: string | null;
  isVideo: boolean;
  hashtags: string;
  postedAt: Date;
  mediaType: 'REEL' | 'CAROUSEL' | 'IMAGE';
  permalink: string | null;
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

function normalizeMediaType(item: BdMediaItem): 'REEL' | 'CAROUSEL' | 'IMAGE' {
  if (item.media_product_type === 'REELS') return 'REEL';
  if (item.media_type === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  return 'IMAGE';
}

export async function fetchBusinessDiscovery(
  input: BusinessDiscoveryInput
): Promise<BusinessDiscoveryResponse | null> {
  const fetcher = input.fetcher ?? fetch;
  const fields = `business_discovery.username(${input.handle}){followers_count,media_count,media.limit(25){${MEDIA_FIELDS}}}`;
  const url = `${GRAPH_BASE}/${input.igUserId}?fields=${encodeURIComponent(fields)}&access_token=${input.accessToken}`;
  const res = await fetcher(url);
  if (!res.ok) return null;
  const json = (await res.json()) as BusinessDiscoveryResponse;
  if (!json.business_discovery) return null;
  return json;
}

export function parseToScrapedPosts(
  raw: BusinessDiscoveryResponse,
  handle: string
): ParsedScrapedPost[] {
  const items = raw.business_discovery?.media?.data ?? [];
  return items.map((item) => {
    const caption = item.caption ?? '';
    const hashtags = (caption.match(HASHTAG_RE) ?? []).join(' ');
    const mediaType = normalizeMediaType(item);
    return {
      shortcode: item.id,
      caption,
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      imageUrl: item.thumbnail_url ?? item.media_url ?? null,
      isVideo: mediaType === 'REEL' || item.media_type === 'VIDEO',
      hashtags,
      postedAt: new Date(item.timestamp),
      mediaType,
      permalink: item.permalink ?? null,
    };
  });
}
