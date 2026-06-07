# @lattica/core

The framework-agnostic data-grid engine at the heart of Lattica. It provides the pure, DOM-free building blocks a grid is made of — coordinate math, a sparse cell store, selection and undo models, multi-level headers, search, validation, conditional formatting, comments, borders, and fill/series logic — so that view layers (such as `@lattica/react`) and tooling can compose them without pulling in any rendering concerns.

## Install

```sh
pnpm add @lattica/core
```

## API overview

The package re-exports cell/value types from `./types.js` plus a set of focused models and pure helpers. The most commonly used exports are listed below.

### Coordinates

A1-notation conversion and addressing helpers.

```ts
import { toA1, parseA1, columnIndexToLabel, addressKey } from '@lattica/core';

toA1({ row: 0, col: 0 }); // 'A1'
parseA1('B3');            // { row: 2, col: 1 }
columnIndexToLabel(26);   // 'AA'
addressKey({ row: 1, col: 1 }); // stable string key for maps/sets
```

### DataStore

A sparse, observable cell store with change events.

```ts
import { DataStore } from '@lattica/core';

const store = new DataStore();
const off = store.subscribe((change) => console.info('changed', change));
store.set({ row: 0, col: 0 }, 42);
store.get({ row: 0, col: 0 }); // 42
off();
```

### Selection & undo

`SelectionModel` tracks the active cell and selected ranges; `UndoManager` runs
reversible `Command`s (and `CompositeCommand`s) with undo/redo.

```ts
import { SelectionModel, UndoManager, type Command } from '@lattica/core';

const selection = new SelectionModel({ rowCount: 100, colCount: 26 });
selection.moveTo({ row: 0, col: 0 });

const undo = new UndoManager();
const cmd: Command = { label: 'demo', apply() {/* … */}, invert() { return cmd; } };
undo.execute(cmd);
undo.undo();
```

### Search & conditional formatting

`searchGrid` is a pure scan over a cell accessor; `ConditionalFormatModel` maps a
value to a `CfStyle` via an ordered list of `CfRule`s (first match wins).

```ts
import { searchGrid, ConditionalFormatModel, type CfRule } from '@lattica/core';

const matches = searchGrid(rows, cols, (r, c) => getDisplay(r, c), 'total', {
  caseSensitive: false,
  wholeCell: false,
});

const cf = new ConditionalFormatModel();
const rule: CfRule = { kind: 'gt', value: 100, style: { background: '#fee', bold: true } };
cf.addRule(rule);
cf.styleFor(150); // -> { background: '#fee', bold: true }
```

### Other models

- `SizeManager` — row/column size tracking with defaults and overrides.
- `HeaderModel` / `computeHeaderLayout` — multi-level grouped column headers (`ColumnDef`, `ColumnGroupDef`, `ColumnNode`).
- `MergeModel`, `BorderModel`, `CommentModel`, `ValidationModel` (with `validators`).
- `SummaryFn` helpers: `summarize`, `summarizeColumn`, `toNumberOrNull`.
- Ranges: `normalizeRange`, `rangeContains`, `rangesIntersect`, `forEachCell`, `clampRange`.
- Viewport: `computeVisibleWindow`, `forEachIndex`.
- Fill: `detectSeries` / `extendSeries` (`SeriesKind`) and `fillRegion` (`FillDirection`).
- Persistence: `serializeState` / `deserializeState` / `emptyState` (`GridStateSnapshot`).
- Eventing: `Emitter`, `HookBus`.
