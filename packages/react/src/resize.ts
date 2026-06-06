/**
 * Resize hit-testing for the header bands. Detects when a pointer sits near a
 * column's right border (in the column-header band) or a row's bottom border (in
 * the row-header gutter), so the grid component can surface resize handles.
 *
 * All functions are pure and reuse {@link columnX} / {@link rowY} from
 * `./geometry.js` to locate borders in the visible coordinate space.
 */

import type { GridGeometry } from './geometry.js';
import { columnX, rowY, columnAt, rowAt } from './geometry.js';

/** Identifies the column/row whose trailing border the pointer is resizing. */
export interface ResizeTarget {
  type: 'col' | 'row';
  index: number;
}

const DEFAULT_TOLERANCE = 4;

/**
 * Hit-test the column-header band for a column's right border.
 *
 * Only fires while the pointer is within the column-header band
 * (`y < colHeaderHeight`) and to the right of the row header
 * (`x >= rowHeaderWidth`). Returns the column whose RIGHT border is within
 * `tolerance` px of `x`, preferring the nearer of the two candidate borders
 * around the pointer.
 */
export function hitColumnBorder(
  geom: GridGeometry,
  scrollLeft: number,
  x: number,
  y: number,
  tolerance: number = DEFAULT_TOLERANCE,
): ResizeTarget | null {
  if (y >= geom.colHeaderHeight || x < geom.rowHeaderWidth) {
    return null;
  }

  const count = geom.colSizes.getCount();
  if (count === 0) {
    return null;
  }

  // The column under the pointer plus its left neighbour cover both borders
  // that could be within tolerance of `x`.
  const at = columnAt(geom, scrollLeft, x);
  let best: ResizeTarget | null = null;
  let bestDist = Infinity;
  for (const col of [at - 1, at]) {
    if (col < 0 || col >= count) {
      continue;
    }
    const rightBorder = columnX(geom, scrollLeft, col) + geom.colSizes.getSize(col);
    const dist = Math.abs(x - rightBorder);
    if (dist <= tolerance && dist < bestDist) {
      best = { type: 'col', index: col };
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Hit-test the row-header gutter for a row's bottom border.
 *
 * Only fires while the pointer is within the row-header gutter
 * (`x < rowHeaderWidth`) and below the column header
 * (`y >= colHeaderHeight`). Returns the row whose BOTTOM border is within
 * `tolerance` px of `y`, preferring the nearer of the two candidate borders.
 */
export function hitRowBorder(
  geom: GridGeometry,
  scrollTop: number,
  x: number,
  y: number,
  tolerance: number = DEFAULT_TOLERANCE,
): ResizeTarget | null {
  if (x >= geom.rowHeaderWidth || y < geom.colHeaderHeight) {
    return null;
  }

  const count = geom.rowSizes.getCount();
  if (count === 0) {
    return null;
  }

  const at = rowAt(geom, scrollTop, y);
  let best: ResizeTarget | null = null;
  let bestDist = Infinity;
  for (const row of [at - 1, at]) {
    if (row < 0 || row >= count) {
      continue;
    }
    const bottomBorder = rowY(geom, scrollTop, row) + geom.rowSizes.getSize(row);
    const dist = Math.abs(y - bottomBorder);
    if (dist <= tolerance && dist < bestDist) {
      best = { type: 'row', index: row };
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Combined resize hit-test: tries a column border first, then a row border.
 * Returns the first match, or `null` when the pointer is over neither.
 */
export function hitResizeHandle(
  geom: GridGeometry,
  scrollLeft: number,
  scrollTop: number,
  x: number,
  y: number,
  tolerance: number = DEFAULT_TOLERANCE,
): ResizeTarget | null {
  return (
    hitColumnBorder(geom, scrollLeft, x, y, tolerance) ??
    hitRowBorder(geom, scrollTop, x, y, tolerance)
  );
}
