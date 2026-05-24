/**
 * Vitest config for component tests (jsdom environment, RTL).
 *
 * Run with: pnpm vitest run --config vitest.components.config.ts
 * Or add to package.json: "test:components": "vitest run --config vitest.components.config.ts"
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'components',
    environment: 'jsdom',
    include: ['components/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    setupFiles: ['components/test-setup.ts'],
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      '@/app': path.resolve(__dirname, 'app'),
      '@/core': path.resolve(__dirname, 'core'),
      '@/modules': path.resolve(__dirname, 'modules'),
      '@/components': path.resolve(__dirname, 'components'),
    },
  },
});
