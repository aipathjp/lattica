# Lattica Usage Guide

An end-to-end tour of building a spreadsheet with Lattica — from a basic React
grid to AI-assisted editing. Every example uses real exported names from the
`@lattica/*` packages. Lattica is ESM and TypeScript-first.

## Contents

1. [Install](#install)
2. [A grid with `<LatticaGrid>` and `useGridController`](#a-grid-with-latticagrid-and-usegridcontroller)
3. [Editing and formulas](#editing-and-formulas)
4. [Cell types and alignment](#cell-types-and-alignment)
5. [Conditional formatting](#conditional-formatting)
6. [Search](#search)
7. [Sort and filter](#sort-and-filter)
8. [Fill handle](#fill-handle)
9. [CSV and XLSX import/export](#csv-and-xlsx-importexport)
10. [Realtime collaboration](#realtime-collaboration)
11. [AI features](#ai-features)

---

## Install

```sh
pnpm add @lattica/react @lattica/core @lattica/data @lattica/formula
pnpm add @lattica/io @lattica/collab @lattica/ai @lattica/mcp
```

`@lattica/react` depends on the core/data/formula engines transitively; add the
others as you adopt their features.

---

## A grid with `<LatticaGrid>` and `useGridController`

`useGridController` creates a stable headless `GridController` (it owns the
formula engine, sizing, selection, and undo); `<LatticaGrid>` renders it.

```tsx
import { LatticaGrid, useGridController } from '@lattica/react';

export function Spreadsheet() {
  const controller = useGridController({
    rowCount: 1000,
    colCount: 26,
    defaultRowHeight: 24,
    defaultColWidth: 120,
    frozenRows: 1,
    frozenCols: 1,
  });

  return <LatticaGrid controller={controller} width={960} height={600} />;
}
```

`LatticaGridProps` also accepts `columns` (multi-level `ColumnNode[]` headers),
`theme` (a `Partial<GridTheme>`), `className`, `style`, and a `contextMenu`
builder. You can drive the controller directly outside the render path.

---

## Editing and formulas

Edits go through the controller as undoable commands. The embedded
`@lattica/formula` `SheetEngine` evaluates formulas with leading `=`.

```ts
controller.setCellText(0, 0, 'Sales');
controller.setCellText(1, 0, '10');
controller.setCellText(2, 0, '20');
controller.setCellText(3, 0, '=SUM(A2:A3)');

controller.getDisplay(3, 0);  // '30' (formatted value)
controller.getEditText(3, 0); // '=SUM(A2:A3)' (editable source)

controller.undoLast();
controller.redoLast();
```

Inline editing is wired automatically by `<LatticaGrid>`, but the programmatic
methods (`beginEdit`, `updateDraft`, `commitEdit`, `cancelEdit`) are available if
you build a custom editor.

---

## Cell types and alignment

`@lattica/react` ships a `CellTypeRegistry` (`defaultCellTypes`) with `text`,
`number`, and `boolean` renderers. Register custom renderers and assign a type
(and alignment) per **physical** column.

```ts
import { defaultCellTypes, drawCellText, type CellRenderer } from '@lattica/react';

const currency: CellRenderer = (ctx) =>
  drawCellText({ ...ctx, align: ctx.align === 'left' ? 'right' : ctx.align });

defaultCellTypes.register('currency', currency);

controller.setColumnType(0, 'currency'); // physical column 0
controller.setColumnAlign(0, 'right');
```

---

## Conditional formatting

The controller exposes a `ConditionalFormatModel` as `controller.conditionalFormat`.
Add `CfRule`s (first match wins); the grid applies them automatically, and a
search hit overlays a yellow tint on top of any rule style.

```ts
import type { CfRule } from '@lattica/core';

const highValue: CfRule = { kind: 'gt', value: 1000, style: { background: '#fde', bold: true } };
const negative: CfRule = { kind: 'lt', value: 0, style: { color: '#c00' } };

controller.conditionalFormat.addRule(highValue);
controller.conditionalFormat.addRule(negative);

controller.getCellStyle(3, 0); // resolved CfStyle | null for that cell
```

Rule kinds include `eq`/`ne`/`gt`/`gte`/`lt`/`lte`, `between`, `contains`, and
`empty`/`notEmpty`.

---

## Search

`runSearch` scans displayed cell text, stores match state on
`controller.search`, tints hit cells, and returns the hit count.

```ts
const count = controller.runSearch('total', {
  caseSensitive: false,
  wholeCell: false,
  regex: false,
});
```

`SearchOptions` supports `caseSensitive`, `wholeCell`, and `regex` (an invalid
regex yields zero hits rather than throwing).

---

## Sort and filter

Sort and filter are **view transforms** (powered by `@lattica/data`), addressed
by **visual** column index. They do not mutate the underlying data.

```ts
import type { FilterCondition } from '@lattica/data';

// Sort: cycles asc -> desc -> cleared. Pass `true` for an additive (secondary) key.
controller.toggleSort(1);
controller.toggleSort(0, true);
controller.getSortDirection(1); // 'asc' | 'desc' | null

// Filter: replace a column's conditions. An empty array clears the filter.
const conditions: FilterCondition[] = [
  { kind: 'gte', value: 100 },
  { kind: 'lt', value: 1000 },
];
controller.setColumnFilter(1, conditions, 'and');
controller.setColumnFilter(1, []); // clear

controller.clearView(); // drop all sort + filter
```

Condition kinds: `equals`, `notEquals`, `contains`, `notContains`,
`gt`/`gte`/`lt`/`lte`, `between`, `empty`/`notEmpty`, `in`.

---

## Fill handle

The fill handle drags a seed selection across adjacent cells, extending series
where one is detected. `<LatticaGrid>` wires the drag UI to the controller's
`fillTo`:

```ts
// After selecting the seed range, fill to a target cell (visual coordinates):
controller.fillTo(/* targetRow */ 10, /* targetCol */ 0);
```

Under the hood this uses the pure `fillRegion` / `detectSeries` / `extendSeries`
helpers from `@lattica/core` (with `FillDirection` `'down' | 'up' | 'right' | 'left'`),
so series like `1, 2, 3…` extend automatically.

---

## CSV and XLSX import/export

Use `@lattica/io` for file interop. It works on plain string/value matrices, so
you map between matrices and the grid yourself.

### Import CSV/XLSX

```ts
import { parseDelimited, readXlsx } from '@lattica/io';

const rows = parseDelimited(csvText); // string[][]
rows.forEach((line, r) =>
  line.forEach((text, c) => controller.setCellText(r, c, text)),
);

const wb = readXlsx(xlsxBytes); // Uint8Array -> ReadWorkbook
const firstSheet = wb.sheets[0];
firstSheet?.rows.forEach((line, r) =>
  line.forEach((cell, c) => controller.setCellText(r, c, String(cell ?? ''))),
);
```

### Export CSV/XLSX

```ts
import { serializeDelimited, matrixToXlsx } from '@lattica/io';

const matrix: string[][] = [];
for (let r = 0; r < controller.getRowCount(); r++) {
  const line: string[] = [];
  for (let c = 0; c < controller.getColCount(); c++) line.push(controller.getDisplay(r, c));
  matrix.push(line);
}

const csv = serializeDelimited(matrix);     // string
const xlsx = matrixToXlsx(matrix, 'Export'); // Uint8Array
```

For clipboard copy/paste, `toClipboardText` / `toClipboardHtml` / `parseClipboard`
pair with the controller's `copySelection()` and `paste(matrix)`.

---

## Realtime collaboration

`@lattica/collab` provides a CRDT document, presence, and a transport. A
`CollabSession` is the object your UI talks to; `InMemoryNetwork` connects
sessions in-process (perfect for demos and tests).

```ts
import { CollabSession, InMemoryNetwork } from '@lattica/collab';

const network = new InMemoryNetwork();

const me = new CollabSession('site-a', network.connect(), { name: 'Alice', color: '#e11' });
const peer = new CollabSession('site-b', network.connect(), { name: 'Bob' });

// Local edit -> broadcast -> replicated to peers.
me.setCell('A1', 'hello');
peer.doc.get('A1'); // 'hello'

// Cursor / selection presence.
me.updatePresence({ cursor: 'B2' });
peer.presence; // PresenceRegistry of remote sites

me.leave(); // broadcast leave + stop listening
```

To bridge a real backend (WebSocket, WebRTC, Supabase Realtime, …), implement
the `CollabTransport` interface (`send` + `subscribe`) and pass it to
`CollabSession`. Sync grid edits by feeding `setCell`/`doc.get` through your
`GridController`.

---

## AI features

All AI features run on a provider-agnostic `AIClient`. Use `MockProvider` for
tests/offline; swap in your own `AIProvider` in production. `AIClient` enforces a
call budget and accumulates token usage.

```ts
import { MockProvider, AIClient } from '@lattica/ai';

const client = new AIClient(new MockProvider({
  texts: ['…'],
  objects: [{ formula: 'SUM(A1:A10)' }],
}), { maxCalls: 50, maxOutputTokens: 512 });
```

### Natural language → formula

```ts
import { nlToFormula } from '@lattica/ai';

const r = await nlToFormula(client, 'sum of column A', { context: 'A1:A10 holds sales' });
if (r.valid) controller.setCellText(11, 0, r.formula); // r.formula is parse-validated
```

### Generate a column

```ts
import { generateColumn } from '@lattica/ai';

const rows = [['Acme', 'NY'], ['Globex', 'CA']];
const cells = await generateColumn(client, rows, {
  template: 'Write a one-line tagline for {0} in {1}.',
});
cells.forEach((cell, r) => controller.setCellText(r, 2, cell.value));
// each cell also carries `.provenance` { model, prompt, usage }
```

### Smart fill

```ts
import { smartFill } from '@lattica/ai';

// Deterministic rule when one fits; AI fallback otherwise.
const filled = await smartFill(
  [{ input: 'jane@x.com', output: 'jane' }],
  ['bob@x.com', 'amy@x.com'],
  client,
); // ['bob', 'amy']
```

### Semantic search

```ts
import { SemanticIndex, type Embedder } from '@lattica/ai';

const embedder: Embedder = (text) => embed(text); // your embedding model
const index = new SemanticIndex(embedder);
await index.add('row-1', 'Q3 revenue report');
await index.add('row-2', 'office supplies invoice');
const hits = await index.search('earnings', 5); // [{ id, score }] by similarity
```

### MCP tools for AI agents

Expose the grid's formula engine to an agent as callable tools.

```ts
import { createGridTools, ToolDispatcher } from '@lattica/mcp';

const dispatcher = new ToolDispatcher(createGridTools(controller.engine));

dispatcher.list();                                     // tool metadata
dispatcher.call('set_cell', { row: 0, col: 0, content: '=A2+A3' });
const out = dispatcher.call('get_cell', { row: 0, col: 0 });
// { ok: true, output: { value: '…' } } — call() never throws
```

Standard tools: `get_cell`, `set_cell`, `get_range`, `evaluate`, `define_name`.

### Workflow planning with HITL

`planWorkflow` plans an ordered list of `WorkflowStep`s restricted to allowed
tool names; `WorkflowRunner` executes only approved steps and records an audit
trail.

```ts
import { planWorkflow, WorkflowRunner } from '@lattica/ai';

const toolNames = dispatcher.list().map((t) => t.name);
const steps = await planWorkflow(client, 'sum each column and sort by total', toolNames);

const runner = new WorkflowRunner((step) => dispatcher.call(step.tool, step.input));
const audit = runner.run(steps, (step) => step.tool !== 'set_cell'); // approve callback (HITL)
runner.getAudit(); // applied / rejected / failed per step
```

This closes the loop: natural-language intent → planned tool calls →
human-approved execution against the same `SheetEngine` your `<LatticaGrid>`
renders.
