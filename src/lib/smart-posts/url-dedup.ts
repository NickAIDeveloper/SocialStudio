// Image-URL normalisation for the no-reuse dedup check.
//
// Why this exists:
//   The no-reuse filter compares the candidate URL string against every
//   sourceImageUrl already stored for the brand. Some image sources sign
//   their CDN URLs with short-lived query params that change on every fetch:
//
//     - Instagram CDN:   ?oh=<sig>&oe=<expiry>  (changes per IG Graph call)
//     - Unsplash:        ?ixlib=<ver>&q=85&fm=jpg&... (occasionally varies)
//     - Pexels:          ?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260
//
//   When the URL string differs across fetches of the SAME underlying photo,
//   exact-string dedup fails — the user reports the same image being picked
//   over and over. Stripping the query string isolates the unique photo
//   identifier (which lives in the path for every source we use):
//
//     Pixabay:  https://pixabay.com/get/<hash>.jpg               (no query)
//     Unsplash: https://images.unsplash.com/photo-<id>?...        (id in path)
//     Pexels:   https://images.pexels.com/photos/<id>/...?...     (id in path)
//     IG CDN:   https://scontent.cdninstagram.com/.../<id>_xxx.jpg?... (id in path)
//
//   Trailing-slash and fragment normalisation are also applied so two
//   superficially-different URL strings for the same photo dedup correctly.

export function normalizeImageUrlForDedup(url: string): string {
  if (!url) return url;
  let normalized = url.trim();
  const hashIdx = normalized.indexOf('#');
  if (hashIdx !== -1) normalized = normalized.slice(0, hashIdx);
  const qIdx = normalized.indexOf('?');
  if (qIdx !== -1) normalized = normalized.slice(0, qIdx);
  // Collapse a trailing slash so /photo and /photo/ dedup the same.
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/** Build a Set of normalised URLs from a list of raw URLs (skips null/empty). */
export function buildDedupSet(urls: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const u of urls) {
    if (u) out.add(normalizeImageUrlForDedup(u));
  }
  return out;
}
