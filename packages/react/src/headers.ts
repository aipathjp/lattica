/**
 * Pure positioning for the DOM header layers. Multi-level grouping headers are
 * rendered as DOM (not canvas) for accessibility and rich interaction; this
 * module turns a {@link HeaderLayout} (or the default single row of column
 * letters) plus the current scroll/geometry into absolutely-positioned header
 * boxes. Row-number gutter cells are positioned the same way.
 */

import { columnIndexToLabel, type HeaderLayout } from '@lattica/core';
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
 */
export function columnHeaderCells(
  geom: GridGeometry,
  scrollLeft: number,
  visibleCols: readonly number[],
  layout: HeaderLayout | null,
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
      if (!overlaps(cell.startLeaf, cell.endLeaf, firstCol, lastCol)) {
        continue;
      }
      const left = columnX(geom, scrollLeft, cell.startLeaf);
      const right = columnX(geom, scrollLeft, cell.endLeaf - 1) + geom.colSizes.getSize(cell.endLeaf - 1);
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
        ...(cell.isGroup ? {} : { col: cell.startLeaf }),
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
