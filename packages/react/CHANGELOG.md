# @ai-path/tb-react

## 0.4.2 (2026-08-08)

### Fixed

- **Amending existing text no longer wipes the cell.** The focus effect depended on
  the whole `edit` object, which `updateDraft` recreates on every keystroke. The
  effect therefore re-ran per key and re-applied `select()` / `setSelectionRange()`,
  throwing the caret away — typing one character into a filled cell cleared it. The
  effect now keys on the edit *session* (row/col), so the caret is positioned once
  when the session opens and left alone while you type. No `editSelection` value
  worked around this, and it reproduced with a bare `LatticaGrid`.

### Added

- **`<LatticaGrid imeSafeInput>` — opt-in surface for Japanese/CJK input.** The grid
  root is a `div[tabindex=0]`; a `div` cannot host IME composition, so while focus
  sat there the first character of a conversion was swallowed (`sakurai` → `あくらい`):
  `interpretKey` treats it as `{ type: 'edit', initial }` and opens the editor with it
  as the draft, so the IME never receives it. `editSelection='end'` only turned it into
  `sあくらい`. With `imeSafeInput`, a transparent textarea is kept focused over the
  active cell so composition is alive before the first keystroke and the whole
  conversion lands. Commits still flow through `beginEdit` → `updateDraft` →
  `commitEdit`, so validation and persistence are unchanged.

  Opt-in because it moves where DOM focus lives, which callers may depend on.
  Recommended for any grid that accepts Japanese text. Both defects were reproduced
  and verified against real Chromium via CDP `Input.imeSetComposition`.

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
