/**
 * Scene builder — turns the current scroll position, geometry, selection, and a
 * value accessor into a flat list of cell paint instructions for the visible
 * (and frozen) region. Pure: no canvas, no DOM. The {@link paintScene} function
 * consumes a Scene; tests assert on the Scene directly.
 */

import {
  computeVisibleWindow,
  type SelectionModel,
  type MergeArea,
  type CellVisual,
  type IconMark,
  type SparklineShape,
} from '@ai-path/tb-core';
import { cellRect, columnX, summaryBandHeight, type GridGeometry, type Rect } from './geometry.js';
import { wrapText, type MeasureText } from './measure.js';

export interface CellPaint {
  row: number;
  col: number;
  rect: Rect;
  text: string;
  selected: boolean;
  active: boolean;
  /** Cell-type name (resolved by the painter's registry); text when omitted. */
  type?: string;
  /** Horizontal alignment for the cell content. */
  align?: 'left' | 'center' | 'right';
  /** Raw value (for renderers like checkbox that read the value, not text). */
  value?: unknown;
  /** Conditional-format style for this cell, if any. */
  cfStyle?: { background?: string; color?: string };
  /** Font weight for the cell text (from cell meta). Default normal. */
  fontWeight?: 'bold' | 'normal';
  /** In-cell data bar (ratio 0..1 + color), if any. */
  bar?: { ratio: number; color: string };
  /** Icon-set mark to draw at the cell's left, if any. */
  icon?: IconMark;
  /** In-cell sparkline shape (cell-local coordinates), if any. */
  sparkline?: SparklineShape;
  /** Wrapped text lines for a wrap-enabled column. Present only when the text
   *  actually broke into 2+ lines; single-line text paints the normal path. */
  lines?: string[];
  /** True when the cell has a comment (paints the top-right corner marker). */
  comment?: boolean;
  /** Placeholder hint painted (muted) when the cell's display text is empty.
   *  Display-only — never stored, copied, or used as the edit text. */
  placeholder?: string;
  /** True for pinned (frozen) rows/columns — painted last, over scrolled cells. */
  frozen?: boolean;
  /** True when pinned on both axes (the frozen corner) — painted last of all,
   *  so single-axis frozen cells (e.g. an overscan row in a pinned column)
   *  cannot cover it. */
  frozenCorner?: boolean;
  /** True for pinned summary (footer) cells — painted over everything else.
   *  For these, `row` is the summary-row index within the band. */
  summary?: boolean;
}

export interface Scene {
  cells: CellPaint[];
  /** Pinned summary (footer) cells, present when the grid declares summary rows. */
  summaryCells?: CellPaint[];
  activeRect: Rect | null;
  visibleRows: number[];
  visibleCols: number[];
}

export interface BuildSceneParams {
  geom: GridGeometry;
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  selection: SelectionModel;
  getDisplay: (row: number, col: number) => string;
  overscan?: number;
  /** Resolve a cell-type name for a cell (optional). */
  getType?: (row: number, col: number) => string | undefined;
  /** Resolve alignment for a cell (optional). */
  getAlign?: (row: number, col: number) => 'left' | 'center' | 'right' | undefined;
  /** Raw value accessor (optional; used by value-based renderers). */
  getValue?: (row: number, col: number) => unknown;
  /** Conditional-format style accessor (optional). */
  getCfStyle?: (row: number, col: number) => { background?: string; color?: string } | null;
  /** Lowest-priority per-cell style, below conditional formats and visual rules. */
  getBaseStyle?: (row: number, col: number) => { background?: string; color?: string } | null;
  /** Per-cell meta style (background / color / fontWeight). Highest-priority
   *  cell style: it overrides conditional-format, search, validation, and
   *  visual-rule styles, but stays below the selection tint and the active
   *  border (both painted later, over the cell background). */
  getCellMeta?: (
    row: number,
    col: number,
  ) => { background?: string; color?: string; fontWeight?: 'bold' | 'normal' } | null;
  /** Visual conditional-format accessor (color scale / data bar / icon set). */
  getVisual?: (row: number, col: number) => CellVisual | null;
  /** Sparkline accessor; receives the cell size for layout. */
  getSparkline?: (row: number, col: number, width: number, height: number) => SparklineShape | null;
  /** Merge-area accessor (optional); covered cells are skipped, anchors span. */
  getMerge?: (row: number, col: number) => MergeArea | null;
  /** Wrap flag per cell (optional). With `measureText` + `font`, wrap-enabled
   *  text cells get their display text broken into {@link CellPaint.lines}. */
  getWrap?: (row: number, col: number) => boolean;
  /** Text measurer used to wrap text (required for wrapping). */
  measureText?: MeasureText;
  /** CSS font the cells are painted with (required for wrapping). */
  font?: string;
  /** Horizontal cell padding (per side) subtracted from the wrap width. */
  wrapPaddingX?: number;
  /** Whether a cell has a comment attached (paints a corner marker). */
  hasComment?: (row: number, col: number) => boolean;
  /** Placeholder hint for a cell (consulted only when the display text is
   *  empty). Return undefined for none. */
  getPlaceholder?: (row: number, col: number) => string | undefined;
  /** Display text for a pinned summary (footer) cell (optional). */
  getSummaryDisplay?: (summaryRow: number, col: number) => string;
  /** Suppress selection visuals: no selected/active flags, no activeRect. */
  hideSelection?: boolean;
}

/** Sum the sizes of `count` indices starting at `start`. */
function spanSize(sizes: GridGeometry['rowSizes'], start: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += sizes.getSize(start + i);
  }
  return total;
}

/** The visible index list along one axis: frozen leading indices + the window. */
export function visibleIndices(
  sizes: GridGeometry['rowSizes'],
  scroll: number,
  client: number,
  frozenCount: number,
  overscan: number,
): number[] {
  const window = computeVisibleWindow(sizes, { scroll, client, frozenCount, overscan });
  const indices: number[] = [];
  for (let i = 0; i < frozenCount && i < sizes.getCount(); i++) {
    indices.push(i);
  }
  for (let i = window.scrollable.start; i < window.scrollable.end; i++) {
    indices.push(i);
  }
  return indices;
}

export function buildScene(params: BuildSceneParams): Scene {
  const { geom, scrollLeft, scrollTop, clientWidth, clientHeight, selection, getDisplay } = params;
  const overscan = params.overscan ?? 2;
  const hideSelection = params.hideSelection ?? false;

  const visibleRows = visibleIndices(
    geom.rowSizes,
    scrollTop,
    Math.max(0, clientHeight - geom.colHeaderHeight),
    geom.frozenRows,
    overscan,
  );
  const visibleCols = visibleIndices(
    geom.colSizes,
    scrollLeft,
    Math.max(0, clientWidth - geom.rowHeaderWidth),
    geom.frozenCols,
    overscan,
  );

  const cells: CellPaint[] = [];
  let activeRect: Rect | null = null;
  const state = selection.getState();

  // Wrapping is active only when all three inputs are supplied — grids without
  // wrap columns pass none of them and skip the per-cell wrap check entirely.
  const wrapCtx =
    params.getWrap !== undefined && params.measureText !== undefined && params.font !== undefined
      ? {
          getWrap: params.getWrap,
          measure: params.measureText,
          font: params.font,
          padX: params.wrapPaddingX ?? 0,
        }
      : null;

  for (const row of visibleRows) {
    for (const col of visibleCols) {
      const merge = params.getMerge?.(row, col) ?? null;
      // Skip cells covered by a merge (only the anchor is painted).
      if (merge !== null && (merge.row !== row || merge.col !== col)) {
        continue;
      }
      const rect = cellRect(geom, scrollLeft, scrollTop, row, col);
      if (merge !== null) {
        rect.width = spanSize(geom.colSizes, merge.col, merge.colspan);
        rect.height = spanSize(geom.rowSizes, merge.row, merge.rowspan);
      }
      const active = !hideSelection && selection.isActive({ row, col });
      const visual = params.getVisual?.(row, col) ?? null;
      const baseStyle = params.getBaseStyle?.(row, col) ?? null;
      const explicitStyle = params.getCfStyle?.(row, col) ?? null;
      let cfStyle = baseStyle === null && explicitStyle === null ? undefined : { ...(baseStyle ?? {}), ...(explicitStyle ?? {}) };
      // A color-scale background applies only when no explicit cf/search/invalid
      // background already claimed the cell.
      if (visual?.background !== undefined) {
        cfStyle = { ...(cfStyle ?? {}), background: explicitStyle?.background ?? visual.background };
      }
      // Cell meta is the top style layer (re-read every scene build): its
      // background/color win over cf/search/invalid/visual styles. Selection
      // tint and the active border still paint over it.
      const meta = params.getCellMeta?.(row, col) ?? null;
      if (meta?.background !== undefined) {
        cfStyle = { ...(cfStyle ?? {}), background: meta.background };
      }
      if (meta?.color !== undefined) {
        cfStyle = { ...(cfStyle ?? {}), color: meta.color };
      }
      const cell: CellPaint = {
        row,
        col,
        rect,
        text: getDisplay(row, col),
        selected: !hideSelection && selection.isSelected({ row, col }),
        active,
        type: params.getType?.(row, col),
        align: params.getAlign?.(row, col),
        value: params.getValue?.(row, col),
        cfStyle,
        fontWeight: meta?.fontWeight,
        bar: visual?.bar,
        icon: visual?.icon,
        sparkline: params.getSparkline?.(row, col, rect.width, rect.height) ?? undefined,
        comment: params.hasComment?.(row, col) === true ? true : undefined,
        frozen: row < geom.frozenRows || col < geom.frozenCols,
        frozenCorner: row < geom.frozenRows && col < geom.frozenCols,
      };
      // Placeholder hints apply only to empty cells (a display value wins).
      if (params.getPlaceholder !== undefined && cell.text === '') {
        const hint = params.getPlaceholder(row, col);
        if (hint !== undefined) {
          cell.placeholder = hint;
        }
      }
      // Wrap only the default text paint path (undefined type or 'text');
      // typed cells keep their renderer's single-line behavior.
      if (
        wrapCtx !== null &&
        (cell.type === undefined || cell.type === 'text') &&
        cell.text !== '' &&
        wrapCtx.getWrap(row, col)
      ) {
        const maxWidth = Math.max(1, rect.width - wrapCtx.padX * 2);
        const lines = wrapText(cell.text, maxWidth, wrapCtx.font, wrapCtx.measure);
        if (lines.length > 1) {
          cell.lines = lines;
        }
      }
      cells.push(cell);
      if (active && state.active.row === row && state.active.col === col) {
        activeRect = rect;
      }
    }
  }

  const scene: Scene = { cells, activeRect, visibleRows, visibleCols };
  const summaryCells = buildSummaryCells(params, visibleCols);
  if (summaryCells !== null) {
    scene.summaryCells = summaryCells;
  }
  return scene;
}

/**
 * Build the pinned summary (footer) band: one row of cells per summary spec,
 * anchored to the viewport's bottom edge — or directly below the last data row
 * when the content is shorter than the viewport. Reuses the visible/frozen
 * column set of the body so frozen columns pin inside the band too.
 */
function buildSummaryCells(params: BuildSceneParams, visibleCols: number[]): CellPaint[] | null {
  const { geom, scrollLeft, scrollTop, clientHeight } = params;
  const count = geom.summaryRows ?? 0;
  if (count === 0 || params.getSummaryDisplay === undefined) {
    return null;
  }
  const rowHeight = geom.summaryRowHeight ?? 0;
  const contentBottom = geom.colHeaderHeight + geom.rowSizes.getTotalSize() - scrollTop;
  const bandTop = Math.min(clientHeight - summaryBandHeight(geom), contentBottom);
  const cells: CellPaint[] = [];
  for (let s = 0; s < count; s++) {
    for (const col of visibleCols) {
      cells.push({
        row: s,
        col,
        rect: {
          x: columnX(geom, scrollLeft, col),
          y: bandTop + s * rowHeight,
          width: geom.colSizes.getSize(col),
          height: rowHeight,
        },
        text: params.getSummaryDisplay(s, col),
        selected: false,
        active: false,
        align: params.getAlign?.(0, col),
        summary: true,
        frozen: col < geom.frozenCols,
      });
    }
  }
  return cells;
}
