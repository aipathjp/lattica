/**
 * Sort model — turns one or more column sort directives into a *physical* row
 * order suitable for `IndexMapper.setOrder`.
 *
 * The sort is computed entirely in physical space: callers supply `rowCount`
 * and a `getValue(physicalRow, col)` accessor, and receive back a permutation
 * of `0..rowCount-1` that arranges the physical rows according to the active
 * `SortConfig`s. Feeding that array to `IndexMapper.setOrder` makes the visual
 * order reflect the sort while every other feature (hide, move, filter) keeps
 * operating on stable physical identities.
 *
 * Design notes:
 * - The sort is **stable**: rows that compare equal under all configs keep their
 *   original relative (physical) order. We achieve this by carrying the original
 *   index as a final tie-breaker.
 * - `defaultComparator` imposes a total order across mixed types so a column with
 *   ragged data (numbers, strings, booleans, blanks) never throws: null/undefined
 *   always sort last, and otherwise values are grouped by a stable type rank.
 * - `SortModel` is a thin stateful wrapper that cycles directions, supports
 *   additive (multi-column) sorting, and notifies subscribers on every change.
 */

/** Direction a single column is sorted in. */
export type SortDirection = 'asc' | 'desc';

/** A single column's contribution to the overall sort. */
export interface SortConfig {
  /** Column index being sorted. */
  col: number;
  /** Ascending or descending. */
  direction: SortDirection;
}

/**
 * Compares two cell values, returning a negative/zero/positive number in the
 * familiar `Array.prototype.sort` convention.
 */
export type CellComparator = (a: unknown, b: unknown) => number;

/**
 * Type-rank used to order values of different kinds against each other. Lower
 * ranks sort first; null/undefined are handled separately so they always trail.
 */
function typeRank(value: unknown): number {
  switch (typeof value) {
    case 'number':
      return 0;
    case 'bigint':
      return 0;
    case 'boolean':
      return 1;
    case 'string':
      return 2;
    default:
      return 3;
  }
}

/**
 * Default total-order comparator:
 * - numbers (and bigints) compare numerically;
 * - booleans compare with `false < true`;
 * - strings compare case-insensitively (locale-independent, lowercased);
 * - `null`/`undefined` always sort LAST;
 * - values of differing types are ordered by a stable type rank.
 */
export function defaultComparator(a: unknown, b: unknown): number {
  const aNil = a === null || a === undefined;
  const bNil = b === null || b === undefined;
  if (aNil && bNil) {
    return 0;
  }
  if (aNil) {
    return 1;
  }
  if (bNil) {
    return -1;
  }

  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) {
    return ra - rb;
  }

  // Same type rank: compare within the kind.
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  if (typeof a === 'string' && typeof b === 'string') {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al < bl) {
      return -1;
    }
    if (al > bl) {
      return 1;
    }
    return 0;
  }
  // Two bigints compare with bigint operators to preserve precision beyond
  // Number.MAX_SAFE_INTEGER.
  if (typeof a === 'bigint' && typeof b === 'bigint') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // Numbers and bigints share rank 0; for mixed/number operands compare via
  // Number coercion. NaN (numbers only) is treated as equal here; the stable
  // tie-break in sortPhysicalOrder keeps ordering deterministic.
  const an = Number(a);
  const bn = Number(b);
  if (an < bn) {
    return -1;
  }
  if (an > bn) {
    return 1;
  }
  return 0;
}

/**
 * Compute a physical row order honoring `configs` in priority order.
 *
 * - Returns the identity order `[0, 1, …, rowCount-1]` when `configs` is empty.
 * - The sort is stable: equal rows keep their original physical order.
 * - Earlier configs take precedence; `desc` negates the comparator result.
 * - `comparatorFor(col)` may supply a custom comparator per column; when omitted
 *   (or for any column it does not cover) `defaultComparator` is used.
 */
export function sortPhysicalOrder(
  rowCount: number,
  getValue: (physicalRow: number, col: number) => unknown,
  configs: SortConfig[],
  comparatorFor?: (col: number) => CellComparator,
): number[] {
  const order: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    order.push(i);
  }
  if (configs.length === 0) {
    return order;
  }

  const comparators = configs.map((c) => comparatorFor?.(c.col) ?? defaultComparator);

  order.sort((ra, rb) => {
    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]!;
      const cmp = comparators[i]!;
      const result = cmp(getValue(ra, cfg.col), getValue(rb, cfg.col));
      if (result !== 0) {
        return cfg.direction === 'desc' ? -result : result;
      }
    }
    // Stable tie-break by original physical index.
    return ra - rb;
  });

  return order;
}

/**
 * Stateful, observable holder of the active sort. Cycles a column through
 * none → asc → desc → none, supports additive multi-column sorting, and emits
 * to subscribers whenever the configuration changes.
 */
export class SortModel {
  private configs: SortConfig[] = [];
  private readonly listeners = new Set<() => void>();

  /**
   * Cycle the given column's direction (none → asc → desc → none).
   * - `additive` (default `false`): when `false`, sorting a column replaces all
   *   other columns; when `true`, the column joins/updates the existing set,
   *   preserving the others.
   */
  toggle(col: number, additive = false): void {
    const existing = this.configs.find((c) => c.col === col);
    const nextDirection: SortDirection | undefined =
      existing === undefined ? 'asc' : existing.direction === 'asc' ? 'desc' : undefined;

    if (additive) {
      if (nextDirection === undefined) {
        this.configs = this.configs.filter((c) => c.col !== col);
      } else if (existing === undefined) {
        this.configs = [...this.configs, { col, direction: nextDirection }];
      } else {
        this.configs = this.configs.map((c) =>
          c.col === col ? { col, direction: nextDirection } : c,
        );
      }
    } else {
      this.configs = nextDirection === undefined ? [] : [{ col, direction: nextDirection }];
    }

    this.emit();
  }

  /** Snapshot of the active sort configs, in priority order. */
  getConfigs(): SortConfig[] {
    return this.configs.map((c) => ({ ...c }));
  }

  /** Remove all sort configs. */
  clear(): void {
    this.configs = [];
    this.emit();
  }

  /** Compute the physical row order for the current configs. */
  apply(rowCount: number, getValue: (physicalRow: number, col: number) => unknown): number[] {
    return sortPhysicalOrder(rowCount, getValue, this.configs);
  }

  /** Subscribe to configuration changes. Returns an unsubscribe function. */
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
