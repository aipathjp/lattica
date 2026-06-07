# Lattica E2E (Playwright)

End-to-end browser tests live here, separate from the Vitest unit suite under
`packages/*/src`. They run against a **served** instance of the playground app
(`examples/playground`) and are named `*.spec.ts` so Vitest (which includes
`packages/*/src/**/*.test.ts(x)`) never picks them up and they stay out of the
100% coverage gate.

## What is covered

`grid.spec.ts` is a representative smoke for the canvas grid via the
kitchen-sink page:

- loads `/kitchen-sink` and asserts the grid renders (`role="grid"` /
  `data-testid="lattica-grid"`),
- clicks a header sort control (`data-testid="lattica-sort-0"`),
- verifies the **Export CSV** / **Export XLSX** buttons exist,
- checks the fill handle (`data-testid="lattica-fill-handle"`) appears on
  selection.

Selectors mirror `examples/playground/app/kitchen-sink/page.tsx` and the testids
emitted by `packages/react/src/LatticaGrid.tsx` (`lattica-grid`, `lattica-sort-<col>`,
`lattica-fill-handle`, `lattica-menu`).

## One-time setup

Install the Playwright browsers (Chromium is the only configured project):

```bash
pnpm exec playwright install
```

## Serving the app

The specs need a server at `baseURL` (default `http://localhost:4321`). The
playground is App Router source only — it does **not yet declare Next.js or a
`dev` script**. To run these tests for real you must first:

1. Add `next` to `examples/playground/package.json` and a script such as
   `"dev": "next dev -p 4321"`.
2. Either let Playwright manage the server (the `webServer` block in
   `playwright.config.ts` runs `pnpm --filter ./examples/playground run dev`), or
   start it yourself and point Playwright at it:

   ```bash
   # external server already running on some URL:
   PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test
   ```

## Running

```bash
pnpm exec playwright test          # full chromium run
pnpm exec playwright test --ui     # interactive UI mode
pnpm exec playwright test e2e/grid.spec.ts
```
