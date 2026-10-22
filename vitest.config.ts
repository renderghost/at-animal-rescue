import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Makes DATABASE_URL etc. from .env available to integration tests, when present.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env (e.g. CI): use the environment as is.
}

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in apps/web/tsconfig.json.
    alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
  },
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
    passWithNoTests: false,
  },
});
