/**
 * Pixel ↔ cell geometry, including frozen (pinned) leading rows/columns and the
 * row-number / column-letter header bands. All functions are pure and operate
 * on {@link SizeManager}s from `@ai-path/tb-core`, so they are unit-testable
 * without a DOM or canvas.
 *
 * Coordinate space: pixel (0,0) is the top-left of the grid's own client area.
 * The body region begins at `(rowHeaderWidth, colHeaderHeight)`.
 */

import type { SizeManager } from '@ai-path/tb-core';

export interface GridGeometry {
  rowSizes: SizeManager;
  colSizes: SizeManager;
  frozenRows: number;
  frozenCols: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  /** Pinned summary (footer) rows at the grid's bottom edge (0 when absent). */
  summaryRows?: number;
  /** Pixel height of each pinned summary row. */
  summaryRowHeight?: number;
}

/** Total pixel height of the pinned summary (footer) band. */
export function summaryBandHeight(geom: GridGeometry): number {
  return (geom.summaryRows ?? 0) * (geom.summaryRowHeight ?? 0);
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

/**
 * Total size of `count` consecutive indices starting at `start` — the pixel
 * span of a merge area along one axis.
 */
export function spanSize(sizes: SizeManager, start: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += sizes.getSize(start + i);
  }
  return total;
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

/** A visible row's vertical strip: its visual index, top edge, and height. */
export interface RowStrip {
  row: number;
  top: number;
  height: number;
}

/**
 * The full-width strip occupied by a row, in client pixels: from the body's
 * left edge (after the row-number gutter) to the data's right edge, clipped to
 * the client width. The row-full-width companion of {@link cellRect}.
 */
export function rowStripRect(
  geom: GridGeometry,
  scrollLeft: number,
  scrollTop: number,
  row: number,
  clientWidth: number,
): Rect {
  const right = Math.min(
    clientWidth,
    geom.rowHeaderWidth + geom.colSizes.getTotalSize() - scrollLeft,
  );
  return {
    x: geom.rowHeaderWidth,
    y: rowY(geom, scrollTop, row),
    width: Math.max(0, right - geom.rowHeaderWidth),
    height: geom.rowSizes.getSize(row),
  };
}

/**
 * Every row whose strip starts above the body's bottom edge (the client height
 * minus the pinned summary band): frozen rows first, then the scrolled window.
 * One call gives an external rail UI the position of each visible row.
 */
export function visibleRowStrips(
  geom: GridGeometry,
  scrollTop: number,
  clientHeight: number,
): RowStrip[] {
  const sizes = geom.rowSizes;
  const count = sizes.getCount();
  const frozenCount = Math.min(geom.frozenRows, count);
  const bottom = clientHeight - summaryBandHeight(geom);
  const scroll = Math.max(0, scrollTop);
  const strips: RowStrip[] = [];
  for (let row = 0; row < frozenCount; row++) {
    const top = rowY(geom, scroll, row);
    if (top < bottom) {
      strips.push({ row, top, height: sizes.getSize(row) });
    }
  }
  const frozenSize = frozenExtent(sizes, frozenCount);
  const first = Math.max(frozenCount, sizes.getIndexAt(frozenSize + scroll));
  for (let row = first; row < count; row++) {
    const top = rowY(geom, scroll, row);
    if (top >= bottom) {
      break;
    }
    strips.push({ row, top, height: sizes.getSize(row) });
  }
  return strips;
}

/** One axis of {@link layoutSignature}: count, total extent, and every override. */
function axisSignature(sizes: SizeManager): string {
  const overrides = [...sizes.getOverrides()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, size]) => `${index}:${size}`)
    .join(',');
  return `${sizes.getCount()}*${sizes.getTotalSize()}|${overrides}`;
}

/**
 * Compact fingerprint of everything that affects pixel layout: scroll offsets,
 * client size, header bands, frozen counts, the summary band, and per-axis
 * sizes (count + total + individual overrides, so equal-total redistributions
 * still change the signature). Two layouts paint the same grid chrome iff
 * their signatures are equal — used to drive layout-change notifications.
 */
export function layoutSignature(
  geom: GridGeometry,
  scrollLeft: number,
  scrollTop: number,
  clientWidth: number,
  clientHeight: number,
): string {
  return [
    scrollLeft,
    scrollTop,
    clientWidth,
    clientHeight,
    geom.rowHeaderWidth,
    geom.colHeaderHeight,
    geom.frozenRows,
    geom.frozenCols,
    summaryBandHeight(geom),
    axisSignature(geom.rowSizes),
    axisSignature(geom.colSizes),
  ].join(';');
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
  // The pinned summary band eats into the scrollable body, so the last data
  // rows must be reachable above it.
  const bodyHeight = clientHeight - geom.colHeaderHeight - summaryBandHeight(geom);
  const totalW = geom.colSizes.getTotalSize();
  const totalH = geom.rowSizes.getTotalSize();
  return {
    maxLeft: Math.max(0, totalW - bodyWidth),
    maxTop: Math.max(0, totalH - bodyHeight),
  };
}
