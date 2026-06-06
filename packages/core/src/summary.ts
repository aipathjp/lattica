/**
 * Pure column-summary aggregation.
 *
 * Computes a single numeric statistic over a sequence of {@link CellValue}s.
 * {@link toNumberOrNull} defines the coercion contract used by every numeric
 * aggregate: numbers pass through, numeric strings parse, booleans map to 1/0,
 * and everything else (text, blanks, `null`) is non-numeric. {@link summarize}
 * works over a materialized array; {@link summarizeColumn} adapts a lazy
 * row-accessor to the same logic without building an intermediate array.
 */

import type { CellValue } from './types.js';

/** The supported aggregation kinds. */
export type SummaryFn = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countNumbers';

/**
 * Coerce a cell value to a number, or `null` when it is not numeric.
 *
 * - `number`: returned as-is (including `NaN`/`Infinity`, which the caller may
 *   produce intentionally — they remain "numeric").
 * - `string`: parsed as a number; blank or non-numeric strings yield `null`.
 * - `boolean`: `true` → 1, `false` → 0.
 * - `null`: `null`.
 */
export function toNumberOrNull(value: CellValue): number | null {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    const n = Number(trimmed);
    return Number.isNaN(n) ? null : n;
  }
  // value is null here.
  return null;
}

/** Is a cell value non-empty (i.e. not `null` and not a blank/whitespace string)? */
function isNonEmpty(value: CellValue): boolean {
  if (value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  return true;
}

/**
 * Aggregate a list of cell values.
 *
 * - `count`: number of non-empty cells.
 * - `countNumbers`: number of numeric cells (per {@link toNumberOrNull}).
 * - `sum`/`avg`/`min`/`max`: over numeric cells only. With no numeric cells,
 *   `sum` is 0, `avg` is 0, and `min`/`max` are 0.
 */
export function summarize(values: readonly CellValue[], fn: SummaryFn): number {
  if (fn === 'count') {
    let n = 0;
    for (const v of values) {
      if (isNonEmpty(v)) {
        n++;
      }
    }
    return n;
  }

  const numbers: number[] = [];
  for (const v of values) {
    const n = toNumberOrNull(v);
    if (n !== null) {
      numbers.push(n);
    }
  }

  switch (fn) {
    case 'countNumbers':
      return numbers.length;
    case 'sum':
      return numbers.reduce((a, b) => a + b, 0);
    case 'avg':
      return numbers.length === 0 ? 0 : numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case 'min':
      return numbers.length === 0 ? 0 : Math.min(...numbers);
    case 'max':
      return numbers.length === 0 ? 0 : Math.max(...numbers);
    /* v8 ignore next 2 -- exhaustive switch; SummaryFn has no other members */
    default:
      return 0;
  }
}

/**
 * Aggregate a column described by a lazy row accessor. Equivalent to
 * {@link summarize} over `[getValue(0), …, getValue(rowCount - 1)]` but without
 * allocating the intermediate array for non-collecting functions.
 */
export function summarizeColumn(
  rowCount: number,
  getValue: (row: number) => CellValue,
  fn: SummaryFn,
): number {
  const values: CellValue[] = [];
  for (let row = 0; row < rowCount; row++) {
    values.push(getValue(row));
  }
  return summarize(values, fn);
}
