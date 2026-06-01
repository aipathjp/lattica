import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['packages/react/**', 'happy-dom'],
      ['packages/io/**', 'happy-dom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/index.ts',
        '**/*.d.ts',
        '**/test-helpers.ts',
        '**/test-utils.ts',
        'packages/*/src/**/types.ts',
      ],
      thresholds: {
        lines: 98,
        statements: 98,
        branches: 98,
        functions: 98,
      },
    },
  },
});
