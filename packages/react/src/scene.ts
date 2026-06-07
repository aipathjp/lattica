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
} from '@lattica/core';
import { cellRect, type GridGeometry, type Rect } from './geometry.js';

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
  /** In-cell data bar (ratio 0..1 + color), if any. */
  bar?: { ratio: number; color: string };
  /** Icon-set mark to draw at the cell's left, if any. */
  icon?: IconMark;
  /** In-cell sparkline shape (cell-local coordinates), if any. */
  sparkline?: SparklineShape;
}

export interface Scene {
  cells: CellPaint[];
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
  /** Visual conditional-format accessor (color scale / data bar / icon set). */
  getVisual?: (row: number, col: number) => CellVisual | null;
  /** Sparkline accessor; receives the cell size for layout. */
  getSparkline?: (row: number, col: number, width: number, height: number) => SparklineShape | null;
  /** Merge-area accessor (optional); covered cells are skipped, anchors span. */
  getMerge?: (row: number, col: number) => MergeArea | null;
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
      const active = selection.isActive({ row, col });
      const visual = params.getVisual?.(row, col) ?? null;
      let cfStyle = params.getCfStyle?.(row, col) ?? undefined;
      // A color-scale background applies only when no explicit cf/search/invalid
      // background already claimed the cell.
      if (visual?.background !== undefined) {
        cfStyle = { ...(cfStyle ?? {}), background: cfStyle?.background ?? visual.background };
      }
      const cell: CellPaint = {
        row,
        col,
        rect,
        text: getDisplay(row, col),
        selected: selection.isSelected({ row, col }),
        active,
        type: params.getType?.(row, col),
        align: params.getAlign?.(row, col),
        value: params.getValue?.(row, col),
        cfStyle,
        bar: visual?.bar,
        icon: visual?.icon,
        sparkline: params.getSparkline?.(row, col, rect.width, rect.height) ?? undefined,
      };
      cells.push(cell);
      if (active && state.active.row === row && state.active.col === col) {
        activeRect = rect;
      }
    }
  }

  return { cells, activeRect, visibleRows, visibleCols };
}
