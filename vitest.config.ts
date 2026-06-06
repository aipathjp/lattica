import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
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
        // Type-only modules (interfaces / type aliases, no executable code).
        'packages/formula/src/ast.ts',
        'packages/formula/src/tokens.ts',
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100,
      },
    },
  },
});
