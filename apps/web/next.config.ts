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
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ['@homeward/db', '@homeward/lexicons', '@homeward/matching'],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
