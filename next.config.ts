import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.pixabay.com',
      },
      {
        protocol: 'https',
        hostname: 'pixabay.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  // Old client-side redirect shims were deleted (2026-08-05 platform sweep).
  // These server-side redirects keep stale bookmarks/external links working.
  async redirects() {
    return [
      { source: '/analytics', destination: '/analyze', permanent: true },
      { source: '/batch', destination: '/create?mode=batch', permanent: true },
      { source: '/generate', destination: '/create?mode=single', permanent: true },
      { source: '/competitors', destination: '/analyze?tab=competitors', permanent: true },
      { source: '/home', destination: '/analyze', permanent: true },
      { source: '/meta', destination: '/analyze?source=meta', permanent: true },
    ];
  },
};

export default nextConfig;
