/**
 * FILTER model — a pure, source-agnostic description of which PHYSICAL rows
 * should be hidden because they fail one or more column filters.
 *
 * The model never touches the data source itself; instead, callers supply a
 * `getValue(physicalRow, col)` accessor and a row count, and the model returns
 * the sorted list of physical rows that FAIL the active filters. That list is
 * exactly what you feed to `IndexMapper.setHidden(rows, true)`.
 *
 * Filtering semantics:
 * - Each {@link ColumnFilter} targets a single column and holds one or more
 *   {@link FilterCondition}s combined by its `conjunction` (default `'and'`).
 * - A row is *kept* (visible) only if it satisfies EVERY active column filter.
 *   Equivalently, a row is *hidden* if it fails at least one column filter.
 * - With no filters, nothing is hidden.
 *
 * Condition semantics:
 * - `contains` / `notContains` compare on `String(value)` case-insensitively.
 * - Numeric comparisons (`gt`/`gte`/`lt`/`lte`/`between`) coerce the cell via
 *   `Number(value)`; a cell that is not a finite number never matches.
 * - `empty` is `null`, `undefined`, or `''`; `notEmpty` is its negation.
 * - `equals` / `notEquals` use strict equality (`===` / `!==`).
 * - `in` matches when the cell strictly equals any of the provided values.
 *
 * The {@link FilterModel} class adds stateful storage (one filter per column)
 * plus a subscription mechanism mirroring {@link IndexMapper}.
 */

export type FilterCondition =
  | { kind: 'equals'; value: unknown }
  | { kind: 'notEquals'; value: unknown }
  | { kind: 'contains'; text: string }
  | { kind: 'notContains'; text: string }
  | { kind: 'gt'; value: number }
  | { kind: 'gte'; value: number }
  | { kind: 'lt'; value: number }
  | { kind: 'lte'; value: number }
  | { kind: 'between'; min: number; max: number }
  | { kind: 'empty' }
  | { kind: 'notEmpty' }
  | { kind: 'in'; values: unknown[] };

export interface ColumnFilter {
  col: number;
  conditions: FilterCondition[];
  /** How this column's conditions combine. Defaults to `'and'`. */
  conjunction?: 'and' | 'or';
}

/** Is the cell considered "empty" (null, undefined, or empty string)? */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Coerce a cell to a finite number, or `undefined` if it is not numeric. */
function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Does a single cell value satisfy a single condition? */
export function matchesCondition(value: unknown, cond: FilterCondition): boolean {
  switch (cond.kind) {
    case 'equals':
      return value === cond.value;
    case 'notEquals':
      return value !== cond.value;
    case 'contains':
      return String(value).toLowerCase().includes(cond.text.toLowerCase());
    case 'notContains':
      return !String(value).toLowerCase().includes(cond.text.toLowerCase());
    case 'gt': {
      const n = toNumber(value);
      return n !== undefined && n > cond.value;
    }
    case 'gte': {
      const n = toNumber(value);
      return n !== undefined && n >= cond.value;
    }
    case 'lt': {
      const n = toNumber(value);
      return n !== undefined && n < cond.value;
    }
    case 'lte': {
      const n = toNumber(value);
      return n !== undefined && n <= cond.value;
    }
    case 'between': {
      const n = toNumber(value);
      return n !== undefined && n >= cond.min && n <= cond.max;
    }
    case 'empty':
      return isEmpty(value);
    case 'notEmpty':
      return !isEmpty(value);
    case 'in':
      return cond.values.includes(value);
  }
}

/**
 * Does a row satisfy a single column filter? A filter with no conditions is
 * vacuously satisfied. Conditions combine by the filter's conjunction
 * (default `'and'`).
 */
function rowSatisfiesFilter(
  physicalRow: number,
  filter: ColumnFilter,
  getValue: (physicalRow: number, col: number) => unknown,
): boolean {
  if (filter.conditions.length === 0) {
    return true;
  }
  const value = getValue(physicalRow, filter.col);
  if (filter.conjunction === 'or') {
    return filter.conditions.some((c) => matchesCondition(value, c));
  }
  return filter.conditions.every((c) => matchesCondition(value, c));
}

/**
 * Compute the sorted (ascending) list of physical rows in `0..rowCount-1` that
 * FAIL the given filters and should therefore be hidden. A row fails if it does
 * not satisfy ALL of the column filters. With no filters, returns `[]`.
 */
export function filteredHiddenRows(
  rowCount: number,
  getValue: (physicalRow: number, col: number) => unknown,
  filters: ColumnFilter[],
): number[] {
  if (filters.length === 0) {
    return [];
  }
  const hidden: number[] = [];
  for (let row = 0; row < rowCount; row++) {
    const keep = filters.every((f) => rowSatisfiesFilter(row, f, getValue));
    if (!keep) {
      hidden.push(row);
    }
  }
  return hidden;
}

/**
 * Stateful holder of one {@link ColumnFilter} per column, with change
 * notification. Apply it against a data source to get the physical rows to hide.
 */
export class FilterModel {
  /** col -> filter for that column. */
  private readonly filters = new Map<number, ColumnFilter>();
  private readonly listeners = new Set<() => void>();

  /** Set (or replace) the filter for its column. */
  set(filter: ColumnFilter): void {
    this.filters.set(filter.col, filter);
    this.emit();
  }

  /**
   * Remove the filter for a column. Returns `true` if a filter existed and was
   * removed, `false` otherwise.
   */
  remove(col: number): boolean {
    const existed = this.filters.delete(col);
    this.emit();
    return existed;
  }

  /** Remove all filters. */
  clear(): void {
    this.filters.clear();
    this.emit();
  }

  /** All active filters, in ascending column order. */
  getFilters(): ColumnFilter[] {
    return [...this.filters.values()].sort((a, b) => a.col - b.col);
  }

  /**
   * Compute the physical rows to hide given a row count and value accessor.
   * Equivalent to {@link filteredHiddenRows} with the current filters.
   */
  apply(rowCount: number, getValue: (physicalRow: number, col: number) => unknown): number[] {
    return filteredHiddenRows(rowCount, getValue, this.getFilters());
  }

  /** Subscribe to mutations. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
