# Lattica

> High-performance, framework-agnostic **data grid & spreadsheet engine** for React / Next.js.
> Clean-room, **zero copyleft**, fully owned IP — MIT licensed.

Lattica is an independent alternative to Handsontable / AG Grid built from the
ground up: a **canvas-rendered** body for large-scale scrolling, a **clean-room
Excel-compatible formula engine**, a **table CRDT** for realtime collaboration,
**XLSX/CSV** interop, and **multi-level grouping headers** — with no dependency
on any GPL/commercial grid or formula library.

> The architecture decisions are grounded in a verified technical study; see
> [`docs/RESEARCH.md`](docs/RESEARCH.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Packages

| Package | Description | Runtime deps |
|---------|-------------|--------------|
| [`@lattica/core`](packages/core) | Framework-agnostic engine: A1 coords, virtualization math, sparse data store, selection, command/undo, multi-level header flattening, typed emitter | **none** |
| [`@lattica/formula`](packages/formula) | Clean-room Excel-compatible formula engine: lexer → Pratt parser → evaluator + incremental dependency graph (`#CYCLE!` detection), ~55 functions | core |
| [`@lattica/react`](packages/react) | React bindings: canvas-rendered virtualized grid, DOM editing overlay (IME-aware), multi-level grouping headers, `GridController` | core, formula |
| [`@lattica/io`](packages/io) | CSV/TSV (RFC 4180), clipboard (TSV + HTML), dependency-free XLSX export (stored-ZIP + CRC-32) | core |
| [`@lattica/collab`](packages/collab) | Realtime: LWW table CRDT, fractional indexing for stable row/col order, presence, transport abstraction | core |

## Why

- **Scales** — the cell body is painted on a single `<canvas>`, bypassing React
  reconciliation, so hundreds of thousands of cells scroll smoothly (DOM-virtualized
  grids stall once they create/destroy hundreds of DOM nodes per frame).
- **No license traps** — Handsontable and HyperFormula are GPL/commercial; AG Grid
  Enterprise is paid. Lattica is MIT and self-contained.
- **Real spreadsheet semantics** — dependency graph, topological recalculation,
  minimal re-evaluation, circular-reference detection, Excel error propagation.
- **Collaboration-ready** — a tombstone-free LWW CRDT converges deterministically;
  fractional indexing keeps row/column order stable across concurrent inserts.

## Quick start

```bash
pnpm add @lattica/react @lattica/core @lattica/formula
```

```tsx
'use client';
import { LatticaGrid, useGridController } from '@lattica/react';

export default function Sheet() {
  const controller = useGridController({ rowCount: 1000, colCount: 50 });
  // Seed a couple of cells + a formula.
  controller.setCellText(0, 0, '10');
  controller.setCellText(1, 0, '20');
  controller.setCellText(2, 0, '=SUM(A1:A2)'); // => 30
  return <LatticaGrid controller={controller} width={800} height={500} />;
}
```

### Multi-level grouping headers

```tsx
const columns = [
  { headerName: 'ID', field: 'id' },
  {
    headerName: 'Name',
    children: [{ headerName: 'First' }, { headerName: 'Last' }],
  },
  {
    headerName: 'Metrics',
    collapsible: true,
    children: [
      { headerName: 'Total' },
      { headerName: 'Detail', showWhen: 'open' }, // hidden when the group collapses
    ],
  },
];
<LatticaGrid controller={controller} columns={columns} />;
```

### Headless usage (no React)

```ts
import { SheetEngine } from '@lattica/formula';
const sheet = new SheetEngine();
sheet.setContent({ row: 0, col: 0 }, 5);
sheet.setContent({ row: 0, col: 1 }, '=A1*2');
sheet.getValue({ row: 0, col: 1 }); // 10
```

### Export & clipboard

```ts
import { matrixToXlsx, serializeTsv, parseClipboard } from '@lattica/io';
const bytes = matrixToXlsx([['Name', 'Score'], ['Ann', 92]]); // valid .xlsx
```

### Realtime collaboration

```ts
import { CollabSession, InMemoryNetwork } from '@lattica/collab';
const net = new InMemoryNetwork(); // swap for a Supabase Realtime transport
const a = new CollabSession('a', net.connect());
const b = new CollabSession('b', net.connect());
a.setCell('r1', 'hello');
b.doc.get('r1'); // 'hello'
```

## Development

```bash
pnpm install
pnpm test            # vitest, 98% coverage thresholds enforced
pnpm coverage
pnpm build           # tsup → ESM + CJS + d.ts for every package
pnpm typecheck
pnpm lint
```

## License

MIT © AI-Path, Inc. ([aipathjp](https://github.com/aipathjp)). Clean-room
implementation; no third-party grid/formula source was referenced.
