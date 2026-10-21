import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // R-008: Cache Components stays off for v1 (every admin page reads the session).
  cacheComponents: false,
  // Next 16 dev blocks cross-origin dev chunks → silent hydration death (nextjs-gotchas)
  allowedDevOrigins: ['localhost', '127.0.0.1', '*.localhost'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
