/**
 * Pure positioning for the DOM header layers. Multi-level grouping headers are
 * rendered as DOM (not canvas) for accessibility and rich interaction; this
 * module turns a {@link HeaderLayout} (or the default single row of column
 * letters) plus the current scroll/geometry into absolutely-positioned header
 * boxes. Row-number gutter cells are positioned the same way.
 */

import { columnIndexToLabel, type HeaderLayout } from '@ai-path/tb-core';
import { columnX, rowY, type GridGeometry } from './geometry.js';

export interface PositionedHeader {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isGroup: boolean;
  collapsible: boolean;
  collapsed: boolean;
  /** Leaf column index for non-group headers (undefined for group headers). */
  col?: number;
}

export interface PositionedRowHeader {
  row: number;
  label: string;
  y: number;
  height: number;
}

/** Does `[aStart,aEnd)` overlap `[bStart,bEnd)`? */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface HeaderHeightOptions {
  /**
   * Base total header height (the controller's `colHeaderHeight` option).
   * Divided evenly across `layout.depth` bands, as before.
   */
  baseHeight: number;
  /** Pixel height per label line (`theme.headerLineHeight`). */
  lineHeight: number;
  /** Vertical padding above/below the label block (`theme.headerPaddingY`). */
  paddingY: number;
}

export interface HeaderRowHeights {
  /** Height of each header row, top to bottom. Single entry when no layout. */
  rows: readonly number[];
  /** Sum of `rows` — the effective `colHeaderHeight` for the geometry. */
  total: number;
}

/**
 * Compute per-row header heights from a layout's `rowLineCounts`.
 *
 * Single-line rows keep the legacy uniform band (`baseHeight / depth`) so
 * existing layouts are pixel-identical. A row containing a multi-line label
 * (`"\n"` in a `headerName`) expands to fit
 * `lines * lineHeight + 2 * paddingY`, never shrinking below its band.
 */
export function computeHeaderRowHeights(
  layout: HeaderLayout | null,
  opts: HeaderHeightOptions,
): HeaderRowHeights {
  if (layout === null || layout.depth === 0) {
    return { rows: [opts.baseHeight], total: opts.baseHeight };
  }
  const band = opts.baseHeight / layout.depth;
  const rows = layout.rowLineCounts.map((lines) =>
    lines <= 1 ? band : Math.max(band, lines * opts.lineHeight + 2 * opts.paddingY),
  );
  return { rows, total: rows.reduce((sum, h) => sum + h, 0) };
}

/**
 * Position column header cells. When `layout` is provided, multi-level group
 * cells are laid out across `layout.depth` bands; otherwise a single row of
 * column letters is produced for the visible columns.
 *
 * Layout leaf indices are *definition* (physical) indices; on-screen positions
 * are *visual* indices. `leafToVisual` translates between the two (returning a
 * negative value for hidden leaves) so hidden columns drop out of the header
 * band instead of desyncing it from the canvas. Omitting it assumes the
 * identity mapping (no hidden/moved columns).
 *
 * `rowHeights` (from {@link computeHeaderRowHeights}) supplies per-row header
 * heights so rows with multi-line labels can be taller than the rest. Omitted,
 * every row gets the uniform band `geom.colHeaderHeight / layout.depth`.
 */
export function columnHeaderCells(
  geom: GridGeometry,
  scrollLeft: number,
  visibleCols: readonly number[],
  layout: HeaderLayout | null,
  leafToVisual: (leaf: number) => number = (leaf) => leaf,
  rowHeights?: readonly number[],
): PositionedHeader[] {
  if (visibleCols.length === 0) {
    return [];
  }
  const firstCol = visibleCols[0]!;
  const lastCol = visibleCols[visibleCols.length - 1]! + 1;

  if (layout === null || layout.depth === 0) {
    return visibleCols.map((col) => ({
      id: `c${col}`,
      label: columnIndexToLabel(col),
      x: columnX(geom, scrollLeft, col),
      y: 0,
      width: geom.colSizes.getSize(col),
      height: geom.colHeaderHeight,
      isGroup: false,
      collapsible: false,
      collapsed: false,
      col,
    }));
  }

  const bandHeight = geom.colHeaderHeight / layout.depth;
  // Prefix offsets so a cell's y/height follow the (possibly uneven) rows.
  const offsets: number[] = [0];
  for (let r = 0; r < layout.depth; r++) {
    offsets.push(offsets[r]! + (rowHeights?.[r] ?? bandHeight));
  }
  const result: PositionedHeader[] = [];
  for (const row of layout.rows) {
    for (const cell of row) {
      // Visual extent of the cell's still-visible leaves (hidden ones drop out).
      let minVisual = -1;
      let maxVisual = -1;
      for (let leaf = cell.startLeaf; leaf < cell.endLeaf; leaf++) {
        const visual = leafToVisual(leaf);
        if (visual < 0) {
          continue;
        }
        if (minVisual === -1 || visual < minVisual) {
          minVisual = visual;
        }
        if (visual > maxVisual) {
          maxVisual = visual;
        }
      }
      if (minVisual === -1 || !overlaps(minVisual, maxVisual + 1, firstCol, lastCol)) {
        continue;
      }
      const left = columnX(geom, scrollLeft, minVisual);
      const right = columnX(geom, scrollLeft, maxVisual) + geom.colSizes.getSize(maxVisual);
      result.push({
        id: cell.id,
        label: cell.label,
        x: left,
        y: offsets[cell.depth]!,
        width: right - left,
        height: offsets[cell.depth + cell.rowSpan]! - offsets[cell.depth]!,
        isGroup: cell.isGroup,
        collapsible: cell.collapsible,
        collapsed: cell.collapsed,
        ...(cell.isGroup ? {} : { col: minVisual }),
      });
    }
  }
  return result;
}

/** Position the row-number gutter cells for the visible rows. */
export function rowHeaderCells(
  geom: GridGeometry,
  scrollTop: number,
  visibleRows: readonly number[],
): PositionedRowHeader[] {
  return visibleRows.map((row) => ({
    row,
    label: String(row + 1),
    y: rowY(geom, scrollTop, row),
    height: geom.rowSizes.getSize(row),
  }));
}
