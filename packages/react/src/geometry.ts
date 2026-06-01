/**
 * Pixel ↔ cell geometry, including frozen (pinned) leading rows/columns and the
 * row-number / column-letter header bands. All functions are pure and operate
 * on {@link SizeManager}s from `@lattica/core`, so they are unit-testable
 * without a DOM or canvas.
 *
 * Coordinate space: pixel (0,0) is the top-left of the grid's own client area.
 * The body region begins at `(rowHeaderWidth, colHeaderHeight)`.
 */

import type { SizeManager } from '@lattica/core';

export interface GridGeometry {
  rowSizes: SizeManager;
  colSizes: SizeManager;
  frozenRows: number;
  frozenCols: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
}

export type Region = 'corner' | 'colHeader' | 'rowHeader' | 'cell';

export interface HitResult {
  region: Region;
  row: number;
  col: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function frozenExtent(sizes: SizeManager, frozen: number): number {
  return sizes.getOffset(Math.min(frozen, sizes.getCount()));
}

/** X pixel of a column's left edge in the body coordinate space. */
export function columnX(geom: GridGeometry, scrollLeft: number, col: number): number {
  if (col < geom.frozenCols) {
    return geom.rowHeaderWidth + geom.colSizes.getOffset(col);
  }
  return geom.rowHeaderWidth + geom.colSizes.getOffset(col) - scrollLeft;
}

/** Y pixel of a row's top edge. */
export function rowY(geom: GridGeometry, scrollTop: number, row: number): number {
  if (row < geom.frozenRows) {
    return geom.colHeaderHeight + geom.rowSizes.getOffset(row);
  }
  return geom.colHeaderHeight + geom.rowSizes.getOffset(row) - scrollTop;
}

/** The rectangle occupied by a cell, in client pixels. */
export function cellRect(
  geom: GridGeometry,
  scrollLeft: number,
  scrollTop: number,
  row: number,
  col: number,
): Rect {
  return {
    x: columnX(geom, scrollLeft, col),
    y: rowY(geom, scrollTop, row),
    width: geom.colSizes.getSize(col),
    height: geom.rowSizes.getSize(row),
  };
}

/** Column index at a client x coordinate (within the body), clamped. */
export function columnAt(geom: GridGeometry, scrollLeft: number, x: number): number {
  const frozenW = frozenExtent(geom.colSizes, geom.frozenCols);
  const xInGrid = x - geom.rowHeaderWidth;
  if (xInGrid < frozenW) {
    return geom.colSizes.getIndexAt(xInGrid);
  }
  return geom.colSizes.getIndexAt(xInGrid + scrollLeft);
}

/** Row index at a client y coordinate (within the body), clamped. */
export function rowAt(geom: GridGeometry, scrollTop: number, y: number): number {
  const frozenH = frozenExtent(geom.rowSizes, geom.frozenRows);
  const yInGrid = y - geom.colHeaderHeight;
  if (yInGrid < frozenH) {
    return geom.rowSizes.getIndexAt(yInGrid);
  }
  return geom.rowSizes.getIndexAt(yInGrid + scrollTop);
}

/** Classify a client pixel into a region plus the row/col it falls on. */
export function hitTest(
  geom: GridGeometry,
  scrollLeft: number,
  scrollTop: number,
  x: number,
  y: number,
): HitResult {
  const inHeaderX = x < geom.rowHeaderWidth;
  const inHeaderY = y < geom.colHeaderHeight;
  if (inHeaderX && inHeaderY) {
    return { region: 'corner', row: -1, col: -1 };
  }
  if (inHeaderY) {
    return { region: 'colHeader', row: -1, col: columnAt(geom, scrollLeft, x) };
  }
  if (inHeaderX) {
    return { region: 'rowHeader', row: rowAt(geom, scrollTop, y), col: -1 };
  }
  return { region: 'cell', row: rowAt(geom, scrollTop, y), col: columnAt(geom, scrollLeft, x) };
}

/** Maximum scroll offsets so the last rows/cols are reachable. */
export function maxScroll(
  geom: GridGeometry,
  clientWidth: number,
  clientHeight: number,
): { maxLeft: number; maxTop: number } {
  const bodyWidth = clientWidth - geom.rowHeaderWidth;
  const bodyHeight = clientHeight - geom.colHeaderHeight;
  const totalW = geom.colSizes.getTotalSize();
  const totalH = geom.rowSizes.getTotalSize();
  return {
    maxLeft: Math.max(0, totalW - bodyWidth),
    maxTop: Math.max(0, totalH - bodyHeight),
  };
}
