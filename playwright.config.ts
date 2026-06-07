import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Lattica's end-to-end suite.
 *
 * The specs under `./e2e` drive a *served* instance of the playground app
 * (`examples/playground`, a Next.js App Router project). They are intentionally
 * kept out of the Vitest unit include glob (`packages/* /src/**`) by living at
 * the repo root and using the `*.spec.ts` suffix, so they never enter the 100%
 * coverage gate.
 *
 * The managed `webServer` boots the playground's `dev` server on PORT. Set
 * `PLAYWRIGHT_BASE_URL` to point at an already-running server (e.g. a
 * production `next start`, as used in local verification) and the managed
 * server is skipped.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4310);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // Managed dev server for the playground. Disabled when PLAYWRIGHT_BASE_URL is
  // provided (i.e. an external server is already running).
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter ./examples/playground run dev`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
