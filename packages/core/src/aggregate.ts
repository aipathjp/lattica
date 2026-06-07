/**
 * Column / range aggregation primitives, shared by group-summary rows, the
 * status bar's selection summary, and any consumer that needs sum / average /
 * min / max / median / count over a set of cell values. Pure and value-typed
 * so it is trivially unit-testable.
 */

import type { CellValue } from './types.js';

/** Supported aggregation functions. */
export type AggregateFn = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median';

/** Coerce a cell value to a finite number, or null when not numeric. */
function toNumber(value: CellValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') {
      return null;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Is the value "present" for COUNTA-style counting (not null / empty string)? */
function isPresent(value: CellValue): boolean {
  return value !== null && value !== '';
}

/**
 * Aggregate `values` with `fn`. `count` returns the number of non-empty cells.
 * Every other function operates on the numeric subset and returns `null` when
 * there are no numeric values.
 */
export function aggregate(values: readonly CellValue[], fn: AggregateFn): number | null {
  if (fn === 'count') {
    return values.reduce<number>((n, v) => (isPresent(v) ? n + 1 : n), 0);
  }
  const nums: number[] = [];
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) {
      nums.push(n);
    }
  }
  if (nums.length === 0) {
    return null;
  }
  switch (fn) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
    case 'median': {
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
    }
  }
}

/** Distinct cell values with display labels, sorted by label (for set filters). */
export function distinctValues(
  values: readonly CellValue[],
  label: (v: CellValue) => string,
): { value: CellValue; label: string }[] {
  const seen = new Map<string, CellValue>();
  for (const v of values) {
    const l = label(v);
    if (!seen.has(l)) {
      seen.set(l, v);
    }
  }
  return [...seen.entries()]
    .map(([l, value]) => ({ value, label: l }))
    // Labels are unique (deduped above), so a strict < / >= split suffices.
    .sort((a, b) => (a.label < b.label ? -1 : 1));
}
