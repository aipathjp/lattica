# Kitchen Sink demo

A single Next.js App Router page — [`app/kitchen-sink/page.tsx`](./app/kitchen-sink/page.tsx) —
that exercises a broad slice of the Lattica public API as a *consumer* (it only
imports the published `@lattica/*` packages and never reaches into their `src`).

Route: `/kitchen-sink`.

## What it shows

- **`useGridController` + `<LatticaGrid>`** — the headless model wired to the
  canvas-rendered, virtualized grid view (`@lattica/react`).
- **Seed data + formula** — four rows of `Score` / `Price` / `Active`, plus a
  `Total` column driven by `=SUM(A{n}:B{n})`, all via `controller.setCellText`.
- **Column type & alignment** — `setColumnType(2, 'checkbox')` renders the
  `Active` column as checkboxes; `setColumnAlign(1, 'right')` right-aligns
  `Price`.
- **Conditional formatting** — `controller.conditionalFormat.addRule({...})`
  highlights scores `> 70` with a green, bold style.

## Buttons

| Button | Controller / helper call |
| --- | --- |
| Sort col 0 | `controller.toggleSort(0)` |
| Filter col 0 > 50 | `controller.setColumnFilter(0, [{ kind: 'gt', value: 50 }])` |
| Clear view | `controller.clearView()` |
| Merge selection | `controller.mergeSelection()` |
| Search "TRUE" | `controller.runSearch('TRUE')` |
| Export CSV | `serializeDelimited(...)` from `@lattica/io` |
| Export XLSX | `matrixToXlsx(...)` from `@lattica/io` |

## AI panel

A button runs `nlToFormula` against an `AIClient` backed by a deterministic
`MockProvider` (all from `@lattica/ai`). `nlToFormula` calls `generateObject`,
so the mock is seeded with `objects: [{ formula: '=SUM(A1:B1)' }]`; the returned
formula is validated by the real formula parser and the result (with its
validity) is displayed. No network or model SDK is involved.

## Verify

```sh
cd /Users/fumiosakurai/Documents/Cursor/lattica
pnpm --filter @lattica/example-playground run typecheck
```

The page typechecks against the **built** `@lattica/*` packages (`packages/*/dist`).
If you change a package, rebuild it first so its `dist` type declarations are
current. `@lattica/ai` was added to the playground's `dependencies` for this demo.
