# AGENTS.md — Using Lattica (for AI coding agents)

This file tells coding agents (Claude Code, Cursor, etc.) how to use **Lattica**
correctly. It is task-oriented and copy-paste friendly. For human prose see
`docs/USAGE.md`; for the full feature log see `docs/PROGRESS.md`.

## What Lattica is

A clean-room, **MIT-licensed** data grid + spreadsheet engine for **React /
Next.js**. No GPL/Handsontable/HyperFormula code. Canvas rendering + DOM editing
hybrid, a self-built Excel-compatible formula engine (150 functions), CRDT
collaboration, AI-native helpers, and an MCP tool layer.

Monorepo (pnpm). Eight published packages:

| Package | Import from | Purpose |
|---|---|---|
| `@lattica/core` | `@lattica/core` | Headless models: sizes, selection, undo, merge, validation, conditional format (value + visual), number format, aggregate, pivot, sparkline, chart layout, detail, fill, coords. No React/DOM. |
| `@lattica/formula` | `@lattica/formula` | `SheetEngine`, parser, 150 functions, dependency graph, spill, named ranges, R1C1, structured refs. |
| `@lattica/data` | `@lattica/data` | Visual↔physical index mapping, sort/filter models, nested rows, `DataView`, `AsyncRowModel`. |
| `@lattica/react` | `@lattica/react` | `<LatticaGrid>`, `<LatticaStatusBar>`, `<LatticaChart>`, `useGridController`, themes/palette/density. |
| `@lattica/io` | `@lattica/io` | CSV/TSV, XLSX read + plain/`writeStyledXlsx`, JSON, clipboard, `tableToPdf`. |
| `@lattica/collab` | `@lattica/collab` | CRDT (LWW), fractional index keys, presence, transport. |
| `@lattica/ai` | `@lattica/ai` | Provider-agnostic NL→formula/operation, smart fill, anomaly, etc. (MockProvider for tests). |
| `@lattica/mcp` | `@lattica/mcp` | Grid tool registry + `ToolDispatcher` for AI agents. |

## Install

```bash
pnpm add @lattica/react @lattica/core @lattica/formula
# add @lattica/io @lattica/data @lattica/ai @lattica/mcp @lattica/collab as needed
```

Peer deps: `react`/`react-dom` ≥ 18 (tested on 19). ESM + CJS are both shipped.

> **Import rule:** consumers import from the package name (`@lattica/react`).
> The `.js` suffix you see on *internal* relative imports (`./foo.js`) is a
> source convention for NodeNext ESM — do **not** add it to package imports.

## Quickstart — a React grid

```tsx
'use client';
import { useEffect } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const columns: ColumnNode[] = [
  { headerName: 'Item' }, { headerName: 'Qty' }, { headerName: 'Total' },
];

export default function Demo() {
  const controller = useGridController({ rowCount: 100, colCount: 3 });
  useEffect(() => {
    controller.setCellText(0, 0, 'Apple');
    controller.setCellText(0, 1, '3');
    controller.setCellText(0, 2, '=B1*100'); // formulas use A1 refs
  }, [controller]);
  return <LatticaGrid controller={controller} columns={columns} width={800} height={480} />;
}
```

- `useGridController(options)` returns a stable headless `GridController`.
- `<LatticaGrid controller columns width height theme renderDetail contextMenu />`.
- `columns` are optional multi-level header defs (`ColumnNode` = leaf `{headerName}`
  or group `{headerName, children, collapsible?, showWhen?}`). Omit for A,B,C… letters.

## The coordinate model (important)

The grid distinguishes **visual** (what the user sees, after sort/filter/move/hide)
from **physical** (storage) indices. Public `GridController` methods take **visual**
indices and map internally. When you need the data-row behind a visual row, use
`controller.getPhysicalRow(visualRow)`. Formulas operate on **physical** A1 cells.

## GridController — the headless API (most-used)

```ts
// content
setCellText(row, col, raw)            // raw: '=formula' | number-ish string | text
getDisplay(row, col): string          // formatted value
getValue(row, col): unknown           // raw value (error → '#DIV/0!' string)
getEditText(row, col): string         // original input (=formula or literal)
getRowCount() / getColCount()

// selection / edit / clipboard / undo
selection.setActive({row,col}); selection.extendTo({row,col})
beginEdit/updateDraft/commitEdit/cancelEdit
copySelection(): string[][]; paste(matrix); deleteSelection()
undoLast(); redoLast()

// columns
setColumnType(col, 'text'|'number'|'checkbox'|'dropdown'|'date'|'autocomplete')
setColumnAlign(col, 'left'|'center'|'right')
setColumnOptions(col, string[])        // dropdown/autocomplete + list validator
setColumnFormat(col, '#,##0.00')       // Excel number format
setColumnValidator(col, v => boolean)  // invalid cells tint red
hideColumn(visualCol); showColumn(physicalCol); showAllColumns()
moveColumn(fromVisual, toVisual)

// sort / filter / find
toggleSort(col, additive?)             // none→asc→desc→none
setColumnFilter(col, conditions[])     // {kind:'gt',value} | {kind:'equals',value} | 'in' | 'contains' …
columnFacets(col); setColumnSetFilter(col, values[]) // Excel-style value picker
clearView()
replaceAll(query, replacement, {regex?,caseSensitive?,wholeCell?}): number

// aggregation / status bar
aggregateColumn(col, 'sum'|'avg'|'count'|'min'|'max'|'median'): number|null
selectionSummary(): { count, sum, avg, min, max }

// visual conditional formatting
setColorScale(col, ['#fee','#fca','#16a34a'])
setDataBar(col, '#93c5fd')
setIconSet(col, ['🔴','🟡','🟢'])
conditionalFormat.addRule({ kind:'gt', value:70, style:{ background:'#d8f5d0', bold:true } })

// merge / nested rows / sparkline / master-detail
mergeSelection(); unmerge()
setRowTree(nodes); toggleRowGroup(row)
setCellSparkline(row, col, number[], 'line'|'bar'|'winloss')
toggleDetail(row); setDetailHeight(px)  // render with <LatticaGrid renderDetail={fn}>

// fill handle
fillTo(row, col)
```

The underlying formula engine is `controller.engine` (a `SheetEngine`).

## Formula engine headless (no React)

```ts
import { SheetEngine } from '@lattica/formula';
const e = new SheetEngine();
e.setContent({ row: 0, col: 0 }, 10);
e.setContent({ row: 0, col: 1 }, '=A1*2');
e.getValue({ row: 0, col: 1 }); // 20
e.evaluateFormula('=SUM(SEQUENCE(3))'); // one-off
e.defineName('Tax', '=0.1'); e.defineTable('Sales', { row:1, col:0, rowCount:100, headers:['Item','Amount'] });
```

Supported: 150 functions (math/stat/text/date/financial/logical/lookup incl.
`XLOOKUP`/`XMATCH`, dynamic arrays `FILTER`/`SORT`/`SORTBY`/`UNIQUE`/`SEQUENCE`/
`TRANSPOSE`/`VSTACK`/`HSTACK`, `LET`, `LAMBDA`+`MAP`/`REDUCE`/`SCAN`/`BYROW`/`BYCOL`),
**spill** (anchor shows top-left, fills neighbors, `#SPILL!` on collision),
**named ranges**, **structured references** `Table[Col]`, R1C1. `builtinFunctionNames()`
lists them all.

## Recipes

**Rich editors + validation** — set the column type; dropdown/autocomplete also take options:
```ts
controller.setColumnType(0, 'dropdown'); controller.setColumnOptions(0, ['A','B']);
controller.setColumnType(1, 'date');
controller.setColumnValidator(2, v => typeof v === 'number' && v > 0);
```

**Faceted filter / hide / move** — UI is built in (`▽` header button, header context menu),
or drive headlessly via `setColumnSetFilter` / `hideColumn` / `moveColumn`.

**Pivot table**
```ts
import { pivot, pivotToMatrix } from '@lattica/core';
const r = pivot(records, { rows:['region'], columns:['product'], value:'units', agg:'sum' });
const matrix = pivotToMatrix(r); // header + body + totals; write into a grid
```

**Charts & sparklines**
```tsx
import { LatticaChart } from '@lattica/react';
<LatticaChart spec={{ kind:'bar', categories:['Q1','Q2'], series:[{name:'N', values:[3,5]}] }} width={320} height={200} />
controller.setCellSparkline(0, 1, [3,5,4,7], 'line');
```

**Themes & density**
```ts
import { buildTheme, densityOptions } from '@lattica/react';
const theme = buildTheme({ palette: 'midnight', density: 'spacious' });
const c = useGridController({ rowCount: 100, colCount: 8, ...densityOptions('compact') });
<LatticaGrid controller={c} theme={theme} />
<LatticaStatusBar controller={c} theme={theme} />
```
Palettes: `light dark highContrast midnight sepia solarizedLight solarizedDark`.
Densities: `compact comfortable spacious`. `buildTheme({ palette, density, fontFamily, overrides })`.

**Export**
```ts
import { serializeDelimited, matrixToXlsx, writeStyledXlsx, tableToPdf } from '@lattica/io';
serializeDelimited(rows);                 // CSV (string)
matrixToXlsx(rows, 'Sheet1');             // Uint8Array (values)
writeStyledXlsx({ sheets:[{ name:'S', rows: styledCells, merges }] }); // numFmt/fills/bold/merge
tableToPdf(rows, { title:'Report' });     // Uint8Array (PDF, Latin-1)
```

**Async / server-side rows**
```ts
import { AsyncRowModel } from '@lattica/data';
const m = new AsyncRowModel({ blockSize: 50, fetcher: (offset, limit) => fetchPage(offset, limit) });
await m.ensureRange(start, end); m.getRow(i); m.getTotal(); m.subscribe(rerender);
```

**AI (provider-agnostic)** — pass any provider; tests use `MockProvider`.
**MCP** — `createGridTools(engine)` + `ToolDispatcher` expose get/set/range/evaluate/define_name.

## Conventions & gotchas

- **Headless first.** All logic lives in `@lattica/core`/`@lattica/data`/`@lattica/formula`;
  React is a thin view. Prefer driving the `GridController`, not DOM.
- **Visual vs physical** indices (see above). Don't pass physical indices to public
  controller methods or vice-versa.
- **Spilled cells are virtual** — they have no stored content; writing into one blocks
  the spill (`#SPILL!`).
- **Errors are values** — `getValue` returns `'#DIV/0!'`-style strings; the engine
  returns `FormulaError` objects (use `FormulaError.is(x)`).
- **No runtime deps** in core/io (self-built ZIP/deflate/PDF). Keep it that way.
- **PDF** uses Helvetica/WinAnsi; non-Latin-1 chars become `?` (no font embedding).

## If you modify this repo

- Tests: **Vitest**, unit tests next to source (`foo.ts` → `foo.test.ts`).
  **100% coverage is mandatory** (lines/branches/functions/statements) — `vitest.config.ts`
  enforces it. Unreachable defensive branches use `/* v8 ignore next -- reason */`.
- Gate before commit: `npx vitest run --coverage` (100%), `npx eslint .` (0),
  `pnpm run typecheck`, `pnpm run build` — all clean.
- One feature = one PR; keep `docs/PROGRESS.md` updated.
- Demo app: `examples/playground` (Next.js). `pnpm --filter ./examples/playground dev`.
- E2E: Playwright specs in `e2e/` (`*.spec.ts`, kept out of the coverage glob).
