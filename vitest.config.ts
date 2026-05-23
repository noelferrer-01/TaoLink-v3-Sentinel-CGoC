import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['modules/**/*.{test,spec}.ts', 'core/**/*.{test,spec}.ts'],
    exclude: ['node_modules', '.next', 'dist', 'build', 'ref', 'wiki', 'memory'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Serialize test files: all test files share a single Postgres container,
    // so concurrent file execution causes FK conflicts between beforeEach
    // cleanup in one file wiping rows another file just created.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@/app': path.resolve(__dirname, 'app'),
      '@/core': path.resolve(__dirname, 'core'),
      '@/modules': path.resolve(__dirname, 'modules'),
    },
  },
});
