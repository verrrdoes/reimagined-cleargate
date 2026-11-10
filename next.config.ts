import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `next dev` prints every Server Action call with its arguments, which would put passwords from
  // signIn, changePassword and resetPassword in the terminal. Passwords are never logged.
  logging: { serverFunctions: false },
  // The Neon driver and its WebSocket client stay as plain Node packages (not bundled).
  serverExternalPackages: ['@prisma/adapter-neon', '@neondatabase/serverless', 'ws'],
  experimental: {
    // Avatars (≤ 2 MB, re-encoded client-side) go through a Server Action.
    serverActions: { bodySizeLimit: '3mb' },
  },
  async headers() {
    return [
      {
        // JSON endpoints are never cached. /api/files/* is left out: fileResponse() sets its own
        // private Cache-Control (avatars carry a ?v= version, submissions use max-age=0).
        source: '/api/:path((?!files/).*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
