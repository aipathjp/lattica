# @ai-path/tb-react

## 0.4.0 (2026-08-08)

### Added

- **`<LatticaGrid overflowTooltip>` — hover tooltips for truncated cells.** Canvas
  cell text is hard-clipped, so a value wider than its column is cut with no
  ellipsis and no visual cue. With `overflowTooltip`, hovering a cell whose
  painted text does not fit shows the full text in the existing tooltip overlay
  after `TOOLTIP_DELAY_MS`; cells whose text fits show nothing. Column-header
  labels that do not fit their header box (after the collapse caret and the
  sort / filter buttons) get the same treatment.
  - Priority is unchanged where it already existed: a cell comment wins, then
    `cellTooltip`, then the truncated text.
  - Not eligible: `checkbox` / `boolean` / `bar` columns (they paint no text)
    and cells replaced by a sparkline. Merge anchors are measured across their
    full span; `wrap` columns are measured against the row height and the wrap
    width; the text measured is the one actually painted (`displayValue`
    override included).
  - Truncation is measured once per newly hovered cell with the same
    `canvasMeasurer` and font string the painter uses — nothing is added to the
    paint path.
- New pure module exports for consumers that want the same verdict outside the
  grid: `paintsCellText`, `isCellTextClipped`, `headerChromeWidth`,
  `isHeaderLabelClipped` (plus the `CellTextFit`, `HeaderChrome`,
  `HeaderLabelFit` types).
- `spanSize(sizes, start, count)` is now exported from the geometry module (it
  was a private scene-builder helper).

### Compatibility

- **Opt-in, no behavior change by default.** `overflowTooltip` defaults to
  `false`; grids that do not pass it hover exactly as they did in 0.3.0.
- Depends on `@ai-path/tb-core` / `@ai-path/tb-data` / `@ai-path/tb-formula`
  `0.3.0` — those packages are unchanged and are not re-released.

## 0.3.0 (2026-07-05)

- tayca Handsontable-replacement batches (PRs #58–#77): `bar` / `link` cell
  types, multi-line headers, `wrap` + `autoSizeRows`, `EditorRegistry`,
  `displayValue`, comments + `cellTooltip`, `summaryRows`, `elapsed` / `time`
  options, full-width input policy, navigation & context-menu options,
  `cellMeta`, placeholders, `commitEditing` / `cancelEditing`, pixel-layout
  APIs, `autoHeight`, `insertRow` / `removeRow`. All additive and opt-in.

## 0.2.0 (2026-07-05)

- Renamed from `@ai-path/lattica-react` — the product is now **Taible**. No API changes; package name only.
