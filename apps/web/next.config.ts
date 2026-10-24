import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Local development keeps one .env at the repository root.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No root .env (e.g. production, where the environment is set by the host).
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // A self-contained server for the production image (#47), traced from the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ['@homeward/db', '@homeward/lexicons', '@homeward/matching'],
  // Error reporting (#48) loads at run time, as Node expects it to.
  serverExternalPackages: ['@sentry/node'],
  poweredByHeader: false,
  experimental: {
    // Full-size phone photos from browsers without JavaScript (#32); the server shrinks them.
    serverActions: { bodySizeLimit: '16mb' },
  },
};

export default withNextIntl(nextConfig);
