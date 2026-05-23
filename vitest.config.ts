import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['modules/**/*.{test,spec}.ts', 'core/**/*.{test,spec}.ts'],
    exclude: ['node_modules', '.next', 'dist', 'build', 'ref', 'wiki', 'memory'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@/app': path.resolve(__dirname, 'app'),
      '@/core': path.resolve(__dirname, 'core'),
      '@/modules': path.resolve(__dirname, 'modules'),
    },
  },
});
