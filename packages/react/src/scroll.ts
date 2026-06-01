/**
 * Pure scroll math: given the current scroll offset and a target cell, compute
 * the minimal new scroll offset that brings the cell fully into the body
 * viewport (frozen leading cells are always visible, so they never force a
 * scroll). Clamped to the valid scroll range.
 */

import { maxScroll, type GridGeometry } from './geometry.js';

export interface ScrollOffset {
  left: number;
  top: number;
}

function axis(
  offset: number,
  size: number,
  scroll: number,
  viewport: number,
  frozenExtent: number,
  max: number,
): number {
  // Frozen leading cells (offset within the frozen band) need no scrolling.
  if (offset < frozenExtent) {
    return Math.min(scroll, max);
  }
  const visibleStart = scroll;
  const visibleEnd = scroll + Math.max(0, viewport - frozenExtent);
  let next = scroll;
  if (offset < visibleStart) {
    next = offset;
  } else if (offset + size > visibleEnd) {
    next = offset + size - Math.max(0, viewport - frozenExtent);
  }
  return Math.max(0, Math.min(next, max));
}

export function scrollToCell(
  geom: GridGeometry,
  scroll: ScrollOffset,
  clientWidth: number,
  clientHeight: number,
  row: number,
  col: number,
): ScrollOffset {
  const { maxLeft, maxTop } = maxScroll(geom, clientWidth, clientHeight);
  const frozenW = geom.colSizes.getOffset(Math.min(geom.frozenCols, geom.colSizes.getCount()));
  const frozenH = geom.rowSizes.getOffset(Math.min(geom.frozenRows, geom.rowSizes.getCount()));
  return {
    left: axis(
      geom.colSizes.getOffset(col),
      geom.colSizes.getSize(col),
      scroll.left,
      clientWidth - geom.rowHeaderWidth,
      frozenW,
      maxLeft,
    ),
    top: axis(
      geom.rowSizes.getOffset(row),
      geom.rowSizes.getSize(row),
      scroll.top,
      clientHeight - geom.colHeaderHeight,
      frozenH,
      maxTop,
    ),
  };
}

/** Clamp a desired scroll offset to the valid range. */
export function clampScroll(
  geom: GridGeometry,
  desired: ScrollOffset,
  clientWidth: number,
  clientHeight: number,
): ScrollOffset {
  const { maxLeft, maxTop } = maxScroll(geom, clientWidth, clientHeight);
  return {
    left: Math.max(0, Math.min(desired.left, maxLeft)),
    top: Math.max(0, Math.min(desired.top, maxTop)),
  };
}
