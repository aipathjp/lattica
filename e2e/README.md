# Lattica E2E (Playwright)

End-to-end browser tests live here, separate from the Vitest unit suite under
`packages/*/src`. They run against a **served** instance of the playground app
(`examples/playground`) and are named `*.spec.ts` so Vitest (which includes
`packages/*/src/**/*.test.ts(x)`) never picks them up and they stay out of the
100% coverage gate.

## What is covered

`grid.spec.ts` — representative smoke for the canvas grid via the kitchen-sink
page:

- loads `/kitchen-sink` and asserts the grid renders (`role="grid"` /
  `data-testid="lattica-grid"`),
- clicks a header sort control (`data-testid="lattica-sort-0"`),
- verifies the **Export CSV** / **Export XLSX** buttons exist,
- checks the fill handle (`data-testid="lattica-fill-handle"`) appears on
  selection.

`spill.spec.ts` — dynamic-array (spill) demo via the `/spill` page:

- asserts the grid renders,
- asserts the in-page probe reports `spill OK` (the seeded SEQUENCE / SORT
  array formulas resolve through the controller into spilled cells),
- exercises the home-page navigation links to both demos.

Selectors mirror the playground pages and the testids emitted by
`packages/react/src/LatticaGrid.tsx` (`lattica-grid`, `lattica-sort-<col>`,
`lattica-fill-handle`, `lattica-menu`).

## One-time setup

Install the Playwright browsers (Chromium is the only configured project):

```bash
pnpm exec playwright install chromium
```

## Running

The playground is a wired Next.js App Router app (`dev` / `build` / `start`
scripts). By default Playwright boots its `dev` server automatically via the
`webServer` block in `playwright.config.ts` (port 4310):

```bash
pnpm exec playwright test          # full chromium run (managed dev server)
pnpm exec playwright test --ui     # interactive UI mode
pnpm exec playwright test e2e/spill.spec.ts
```

To run against an already-running server (e.g. a production build), set
`PLAYWRIGHT_BASE_URL` and the managed server is skipped:

```bash
pnpm --filter ./examples/playground build
pnpm --filter ./examples/playground start &      # serves on :4310
PLAYWRIGHT_BASE_URL=http://localhost:4310 pnpm exec playwright test
```
