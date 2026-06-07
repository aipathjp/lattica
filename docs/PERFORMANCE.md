# Lattica Performance

Lattica is built around a **canvas-free hot path**: the per-frame engine work
(deciding which cells are visible, building the paint instruction list, and
issuing the draw-call sequence) is pure JavaScript with no DOM and no real
canvas. Only the final draw calls touch a `CanvasRenderingContext2D`. This makes
the render pipeline measurable in isolation and keeps a million-row grid
interactive.

## What the benchmark measures

[`packages/react/bench/bench.mjs`](../packages/react/bench/bench.mjs) is a
runnable Node ESM script (intentionally **not** a `*.ts` under `src/**`, so it is
excluded from coverage and from Vitest). It exercises the real published API,
resolved from each package's built `dist`:

- `SizeManager`, `SelectionModel` from `@lattica/core`
- `buildScene`, `paintScene` from `@lattica/react`

### Methodology

1. **Geometry over a huge sheet.** Two `SizeManager`s model **1,000,000 rows ×
   1,000 columns** (1e9 cells). A handful of per-row/-column size overrides are
   injected so the prefix-sum + binary-search code paths are exercised, not just
   the all-default arithmetic fast path.
2. **Viewport** is `1400 × 900` px with one frozen row and one frozen column.
3. **No-op 2D context.** `paintScene` is given a structural `Canvas2D` mock whose
   methods are all empty (no recording, no allocation). This isolates engine cost
   from raster/GPU cost — the numbers are the cost a browser pays *before* pixels
   are produced.
4. **Frame loop.** After a JIT warm-up, the script runs **300 frames**, scrolling
   diagonally across the entire sheet. Each frame calls `buildScene(...)` +
   `paintScene(...)`. Timing uses `performance.now()`.
5. **`getIndexAt` micro-bench.** Separately, 1,000,000 random pixel offsets are
   converted to row indices via `SizeManager.getIndexAt` over the 1e6-row axis to
   demonstrate the logarithmic lookup (binary search over the axis).

## How to run

```bash
# from the repo root
pnpm build
node packages/react/bench/bench.mjs
```

`pnpm build` is required first: the script imports from each package's `dist`,
exactly as an external consumer would.

## Observed results

Measured on the development machine (Apple Silicon, macOS, Node 20+) on
2026-06-07. Re-run locally for your own hardware — these are real numbers from a
local run, not estimates.

```
Sheet:            1,000,000 rows x 1,000 cols  (1,000,000,000 cells)
Viewport:         1400 x 900 px
Frames measured:  300

buildScene + paintScene (per frame):
  visible cells/frame:  751
  ms/frame (avg):       ~0.12
  frames/sec:           ~8,000

SizeManager.getIndexAt over 1,000,000-row axis (O(log n)):
  lookups:              1,000,000
  ns/lookup (avg):      ~13,400
  lookups/sec:          ~74,000
```

Representative back-to-back runs of the exact self-verify command
(`pnpm build >/dev/null 2>&1 && node packages/react/bench/bench.mjs`):

| Run | visible cells/frame | ms/frame (avg) | frames/sec | getIndexAt ns | lookups/sec |
| --- | ------------------- | -------------- | ---------- | ------------- | ----------- |
| 1   | 751                 | 0.1275         | 7,845      | 13,400.5      | 74,624      |
| 2   | 751                 | 0.1152         | 8,677      | 13,483.9      | 74,162      |

### Reading the numbers

- **~0.12 ms/frame** for the full canvas-free pipeline means the engine consumes
  a tiny fraction of a 16.7 ms (60 fps) budget. The grid is bound by raster/GPU
  and DOM, not by Lattica's own bookkeeping, even on a billion-cell sheet.
- **751 visible cells/frame** confirms virtualization: regardless of the 1e9
  total cells, only the cells intersecting the viewport (plus overscan and frozen
  bands) are ever built or painted.
- **`getIndexAt`** stays sub-cell-count: it is logarithmic in the axis length
  (binary search), so a 1e6-row axis resolves a pixel→index hit test without
  scanning. The per-lookup cost here reflects the current implementation, in
  which each binary-search probe re-derives a cumulative offset (itself a small
  binary search over the sparse size overrides). It is dominated by the override
  prefix-sum lookups; with zero overrides the path is pure arithmetic and far
  faster. This is the honest measured value, not a theoretical one.
