import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ['@homeward/db', '@homeward/lexicons', '@homeward/matching'],
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
