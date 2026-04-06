const ALLOWED_IMAGE_HOSTS = new Set([
  'cdn.pixabay.com',
  'pixabay.com',
  'raw.githubusercontent.com',
  // Vercel Blob URLs for user-uploaded logos
]);

export function assertAllowedImageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid image URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS image URLs are permitted');
  }
  // Allow Vercel Blob URLs (*.public.blob.vercel-storage.com)
  if (parsed.hostname.endsWith('.public.blob.vercel-storage.com')) {
    return;
  }
  if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    throw new Error(`Image host not permitted: ${parsed.hostname}`);
  }
}
