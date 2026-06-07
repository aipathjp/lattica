# @lattica/react

The canvas-rendered, virtualized React data grid for Lattica. `<LatticaGrid>` is
a thin view over a headless `GridController` that owns the formula engine,
row/column sizing, selection, and undo. The cell body is painted on a single
`<canvas>` for performance, while headers and the active-cell editor stay in the
DOM for accessibility and IME-aware input. All non-trivial math lives in pure,
tested modules (geometry, scene, painter, keyboard, scroll, measure).

## Install

```sh
pnpm add @lattica/react
```

## API overview

### LatticaGrid + useGridController

Create a controller with `useGridController` and pass it to `<LatticaGrid>`.

```tsx
import { LatticaGrid, useGridController } from '@lattica/react';

function Sheet() {
  const controller = useGridController({ rowCount: 1000, colCount: 26 });
  controller.setCellText(0, 0, 'Hello');
  controller.setCellText(1, 0, '=2+2');
  return <LatticaGrid controller={controller} width={800} height={500} />;
}
```

`LatticaGridProps` also accepts `columns` (multi-level `ColumnNode[]`), `theme`
(`Partial<GridTheme>`), `className`, `style`, and a `contextMenu` builder.

### Driving the controller

The controller exposes intent-level methods that the view renders:

```ts
controller.setCellText(2, 0, '=SUM(A1:A2)'); // undoable edit
controller.getDisplay(2, 0);                 // formatted value, e.g. '4'
controller.toggleSort(0);                    // sort by visual column 0
controller.setColumnFilter(1, [{ kind: 'gt', value: 100 }]);
controller.runSearch('total', { caseSensitive: false }); // returns hit count
controller.undoLast();
```

### Cell types

The `CellTypeRegistry` maps a column type name to a `CellRenderer`.
`defaultCellTypes` ships with `text`, `number`, and `boolean` renderers
(`builtinRenderers`); register your own and assign it to a column.

```ts
import { defaultCellTypes, drawCellText, type CellRenderer } from '@lattica/react';

const badge: CellRenderer = (ctx) => drawCellText({ ...ctx, align: 'center' });
defaultCellTypes.register('badge', badge);
controller.setColumnType(2, 'badge'); // physical column index
```

### Theming & presets

```ts
import { resolveTheme, themePresets, getPreset, darkTheme } from '@lattica/react';

const theme = resolveTheme({ ...darkTheme });
const preset = getPreset('highContrast'); // from themePresets
```

### Other exports

- Geometry/hit-testing: `hitTest`, `cellRect`, `columnAt`, `rowAt`, `maxScroll`.
- Rendering internals: `buildScene`, `paintScene` (`Canvas2D`), `visibleIndices`.
- Interaction: `interpretKey`, `ShortcutRegistry` / `normalizeChord`, `buildMenu` / `findItem` / `runItem`.
- Sizing: `wrapText`, `autoColumnWidth`, `autoRowHeight`.
- Accessibility: `gridAria`, `rowAria`, `cellAria`, `columnHeaderAria`, `rowHeaderAria`.
- i18n: `I18n`, `enUS`, `jaJP`.
- Resize hit-testing: `hitColumnBorder`, `hitRowBorder`, `hitResizeHandle`.
