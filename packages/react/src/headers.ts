/**
 * Pure positioning for the DOM header layers. Multi-level grouping headers are
 * rendered as DOM (not canvas) for accessibility and rich interaction; this
 * module turns a {@link HeaderLayout} (or the default single row of column
 * letters) plus the current scroll/geometry into absolutely-positioned header
 * boxes. Row-number gutter cells are positioned the same way.
 */

import { columnIndexToLabel, type HeaderLayout } from '@ai-path/lattica-core';
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
 */
export function columnHeaderCells(
  geom: GridGeometry,
  scrollLeft: number,
  visibleCols: readonly number[],
  layout: HeaderLayout | null,
  leafToVisual: (leaf: number) => number = (leaf) => leaf,
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
        y: cell.depth * bandHeight,
        width: right - left,
        height: cell.rowSpan * bandHeight,
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
