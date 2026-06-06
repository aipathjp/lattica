/**
 * Pure 2D FILL-REGION applicator powering the fill handle.
 *
 * Given a rectangular seed block of cells and a drag {@link FillDirection},
 * compute the values to write into the newly-extended cells. The work is reduced
 * to 1D series extension via {@link extendSeries} from './fill-series.js':
 *
 * - `down`/`up`: each COLUMN of the seed is an independent series; the result is
 *   `count` new ROWS. For `up` the series is continued upward (the seed columns
 *   are reversed so the progression runs away from the handle), and the produced
 *   rows are returned in final top-to-bottom visual order.
 * - `right`/`left`: each ROW of the seed is an independent series; the result is
 *   `count` new COLUMNS. For `left` the series is continued leftward, and the
 *   produced columns are returned in final left-to-right visual order.
 *
 * The return shape is always a 2D block of the produced cells in visual order.
 * All functions are pure and side-effect free.
 */

import { extendSeries } from './fill-series.js';
import type { CellValue } from './types.js';

/** The four directions a fill handle can be dragged. */
export type FillDirection = 'down' | 'up' | 'right' | 'left';

/** A read-only 2D block of cell values (rows of columns). */
type SeedBlock = readonly (readonly CellValue[])[];

/** Extract column `col` from `seed` top-to-bottom. */
function column(seed: SeedBlock, col: number): CellValue[] {
  return seed.map((row) => row[col] ?? null);
}

/**
 * Produce `count` new rows below the seed, one series per column.
 * Returns rows top-to-bottom (the row nearest the seed first).
 */
function fillDown(seed: SeedBlock, width: number, count: number): CellValue[][] {
  // Each column is non-empty (seed has >= 1 row) and count > 0, so extendSeries
  // returns exactly `count` values — `values[r]` is always defined.
  const perColumn = Array.from({ length: width }, (_, col) =>
    extendSeries(column(seed, col), count),
  );
  return Array.from({ length: count }, (_, r) =>
    perColumn.map((values) => values[r]!),
  );
}

/** Build a 2D block from per-line extension results, transposing for vertical fills. */
function fillVertical(
  seed: SeedBlock,
  width: number,
  count: number,
  reverse: boolean,
): CellValue[][] {
  if (!reverse) {
    return fillDown(seed, width, count);
  }
  // Reverse each column so the progression continues upward, then flip the
  // produced rows back into top-to-bottom visual order.
  const perColumn = Array.from({ length: width }, (_, col) =>
    extendSeries([...column(seed, col)].reverse(), count),
  );
  return Array.from({ length: count }, (_, r) =>
    perColumn.map((values) => values[count - 1 - r]!),
  );
}

/**
 * Produce `count` new columns from the seed, one series per row.
 * `reverse` continues the series leftward and returns columns left-to-right.
 */
function fillHorizontal(
  seed: SeedBlock,
  count: number,
  reverse: boolean,
): CellValue[][] {
  return seed.map((row) => {
    const source = reverse ? [...row].reverse() : [...row];
    const extended = extendSeries(source, count);
    return reverse ? extended.reverse() : extended;
  });
}

/**
 * Compute the values for `count` NEW lines extended from `seed` in `direction`.
 *
 * - `down`/`up` return `count` rows (each `seed`-width wide), in top-to-bottom
 *   visual order.
 * - `right`/`left` return `seed.length` rows, each `count` columns wide, in
 *   left-to-right visual order.
 *
 * Returns `[]` when `count <= 0` or the seed is empty (no rows). A seed whose
 * rows are all empty (zero width) also yields no produced cells.
 */
export function fillRegion(
  seed: SeedBlock,
  direction: FillDirection,
  count: number,
): CellValue[][] {
  if (count <= 0 || seed.length === 0) {
    return [];
  }

  // A seed with no width produces nothing, consistently across both axes.
  const width = Math.max(...seed.map((row) => row.length));
  if (width === 0) {
    return [];
  }

  switch (direction) {
    case 'down':
    case 'up':
      return fillVertical(seed, width, count, direction === 'up');
    case 'right':
    case 'left':
      return fillHorizontal(seed, count, direction === 'left');
  }
}
