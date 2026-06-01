/**
 * Pure helpers for rectangular grid ranges. A {@link GridRange} may be stored
 * with `start`/`end` in any corner orientation; `normalizeRange` returns a
 * canonical top-left → bottom-right form used by every other helper.
 */

import type { CellAddress, GridRange } from './types.js';

export interface NormalizedRange {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/** Canonicalize a range to top-left/bottom-right bounds. */
export function normalizeRange(range: GridRange): NormalizedRange {
  return {
    top: Math.min(range.start.row, range.end.row),
    left: Math.min(range.start.col, range.end.col),
    bottom: Math.max(range.start.row, range.end.row),
    right: Math.max(range.start.col, range.end.col),
  };
}

/** A single-cell range. */
export function singleCell(address: CellAddress): GridRange {
  return { start: address, end: address };
}

/** Does the range contain the given cell? */
export function rangeContains(range: GridRange, address: CellAddress): boolean {
  const n = normalizeRange(range);
  return (
    address.row >= n.top &&
    address.row <= n.bottom &&
    address.col >= n.left &&
    address.col <= n.right
  );
}

/** Number of cells in the range. */
export function rangeArea(range: GridRange): number {
  const n = normalizeRange(range);
  return (n.bottom - n.top + 1) * (n.right - n.left + 1);
}

/** Do two ranges overlap at all? */
export function rangesIntersect(a: GridRange, b: GridRange): boolean {
  const na = normalizeRange(a);
  const nb = normalizeRange(b);
  return !(
    na.right < nb.left ||
    nb.right < na.left ||
    na.bottom < nb.top ||
    nb.bottom < na.top
  );
}

/** Smallest range covering both inputs. */
export function rangeUnion(a: GridRange, b: GridRange): GridRange {
  const na = normalizeRange(a);
  const nb = normalizeRange(b);
  return {
    start: { row: Math.min(na.top, nb.top), col: Math.min(na.left, nb.left) },
    end: { row: Math.max(na.bottom, nb.bottom), col: Math.max(na.right, nb.right) },
  };
}

/** Iterate every cell in a range in row-major order. */
export function forEachCell(range: GridRange, fn: (address: CellAddress) => void): void {
  const n = normalizeRange(range);
  for (let row = n.top; row <= n.bottom; row++) {
    for (let col = n.left; col <= n.right; col++) {
      fn({ row, col });
    }
  }
}

/** Clamp a range so it lies within `[0,rowCount) x [0,colCount)`. */
export function clampRange(range: GridRange, rowCount: number, colCount: number): GridRange {
  const n = normalizeRange(range);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max - 1));
  return {
    start: { row: clamp(n.top, rowCount), col: clamp(n.left, colCount) },
    end: { row: clamp(n.bottom, rowCount), col: clamp(n.right, colCount) },
  };
}
