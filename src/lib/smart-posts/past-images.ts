// Server-side helper that fetches the user's top-performing recent IG media
// (by reach) so they can be offered as image candidates in /smart-posts.
// Mirrors the client-side ranking used by TopPerformersStrip but calls the
// internal insights API with a forwarded cookie for auth.

interface IgInsightRow {
  name: string;
  values?: Array<{ value: number | Record<string, number> }>;
  total_value?: { value: number };
}

interface IgMediaItem {
  id: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  insights?: IgInsightRow[];
}

interface InsightsResponse {
  data?: { media?: IgMediaItem[] };
  error?: string;
}

export interface PastImageMedia {
  id: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  reach: number;
}

function extractReach(media: IgMediaItem): number {
  const row = media.insights?.find((r) => r.name === 'reach');
  if (!row) return 0;
  if (row.total_value && typeof row.total_value.value === 'number') return row.total_value.value;
  const first = row.values?.[0]?.value;
  return typeof first === 'number' ? first : 0;
}

export interface FetchTopPerformingPastImagesInput {
  igUserId: string | undefined;
  limit: number;
  origin: string;
  cookie: string;
}

export async function fetchTopPerformingPastImages(
  input: FetchTopPerformingPastImagesInput,
): Promise<PastImageMedia[]> {
  if (!input.igUserId) return [];
  try {
    const res = await fetch(
      `${input.origin}/api/meta/instagram/insights?igUserId=${encodeURIComponent(input.igUserId)}`,
      { headers: { cookie: input.cookie } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as InsightsResponse;
    const media = json.data?.media ?? [];
    return media
      .map<PastImageMedia>((m) => ({
        id: m.id,
        media_url: m.media_url,
        thumbnail_url: m.thumbnail_url,
        permalink: m.permalink,
        reach: extractReach(m),
      }))
      .filter((m) => Boolean(m.media_url ?? m.thumbnail_url))
      .sort((a, b) => b.reach - a.reach)
      .slice(0, input.limit);
  } catch (err) {
    console.warn('[fetchTopPerformingPastImages] failed, falling back to []', err);
    return [];
  }
}
