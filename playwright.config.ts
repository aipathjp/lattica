import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Lattica's end-to-end suite.
 *
 * The specs under `./e2e` drive a *served* instance of the playground app
 * (`examples/playground`). They are intentionally kept out of the Vitest unit
 * include glob (`packages/* /src/**`) by living at the repo root and using the
 * `*.spec.ts` suffix, so they never enter the 100% coverage gate.
 *
 * NOTE on `webServer`: the playground is currently a set of App Router source
 * files but does NOT yet declare a Next.js dependency or a `dev`/`start` script
 * of its own. To actually serve it for E2E you would first add `next` to
 * `examples/playground/package.json` and a `dev` script (e.g.
 * `"dev": "next dev -p 4321"`). Until then the `webServer` block below is the
 * documented integration point — flip `command`/`url` to the real values once
 * Next is wired up. CI can also point `PLAYWRIGHT_BASE_URL` at an
 * already-running server and skip the managed `webServer` entirely.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4321);
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
        // The playground needs Next added to actually serve — see the note above.
        // Once `next` + a `dev` script exist in examples/playground, this command
        // will boot it on PORT and Playwright will wait for `url` to respond.
        command: `pnpm --filter ./examples/playground run dev -- -p ${PORT}`,
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
