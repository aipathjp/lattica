/**
 * DataView — composes two {@link IndexMapper}s (one for rows, one for columns)
 * with row sorting and filtering, presenting a single transformed *view* over an
 * underlying physical data source.
 *
 * A grid renders against the VISUAL space exposed here: it asks for the visible
 * row/column counts and, for each visible cell, maps back to the PHYSICAL cell
 * via {@link DataView.toPhysical}. Sorting reorders the row mapper; filtering
 * hides physical rows in the row mapper. Columns are carried by their own mapper
 * so hide/move on columns compose cleanly even though sort/filter only act on
 * rows here.
 *
 * Notes:
 * - `applySort` computes a physical row permutation over the *current row count*
 *   (`rows.length`, including hidden rows) and feeds it to `rows.setOrder`. Empty
 *   configs yield the identity order, effectively clearing the sort.
 * - `applyFilter` REPLACES any prior filter: the rows hidden by the previous
 *   filter are unhidden first, then the freshly-failing rows are hidden. This
 *   keeps re-application idempotent and lets rows that no longer match reappear.
 * - `resize` resets both mappers to fresh identity orders, discarding sort and
 *   filter state.
 * - Subscribers are notified after `applySort`, `applyFilter`, and `resize`.
 */

import { IndexMapper } from './index-mapper.js';
import { sortPhysicalOrder, type SortConfig } from './sort.js';
import { filteredHiddenRows, type ColumnFilter } from './filter.js';

/** A physical cell address (row + column in the underlying data source). */
export interface PhysicalCell {
  row: number;
  col: number;
}

export class DataView {
  /** Visual<->physical mapper for rows (carries sort order + filter hides). */
  readonly rows: IndexMapper;
  /** Visual<->physical mapper for columns. */
  readonly cols: IndexMapper;

  /** Physical rows hidden by the most recently applied filter. */
  private filterHidden: number[] = [];

  private readonly listeners = new Set<() => void>();

  constructor(rowCount: number, colCount: number) {
    this.rows = new IndexMapper(rowCount);
    this.cols = new IndexMapper(colCount);
  }

  /** Number of currently visible rows. */
  getRowCount(): number {
    return this.rows.visibleCount;
  }

  /** Number of currently visible columns. */
  getColCount(): number {
    return this.cols.visibleCount;
  }

  /**
   * Map a visual cell position to its physical address in the data source. The
   * returned `row`/`col` are `-1` when the visual position is out of range.
   */
  toPhysical(visualRow: number, visualCol: number): PhysicalCell {
    return {
      row: this.rows.getPhysicalIndex(visualRow),
      col: this.cols.getPhysicalIndex(visualCol),
    };
  }

  /**
   * Recompute the visual row order from `configs` and apply it to the row mapper.
   * Empty `configs` restores the identity order (sort cleared). Notifies.
   */
  applySort(
    getValue: (physicalRow: number, col: number) => unknown,
    configs: SortConfig[],
  ): void {
    const order = sortPhysicalOrder(this.rows.length, getValue, configs);
    this.rows.setOrder(order);
    this.emit();
  }

  /**
   * Recompute and apply a row filter, REPLACING any previous filter. Rows hidden
   * by the prior filter are unhidden first so rows that no longer match reappear;
   * the newly-failing rows are then hidden. Notifies.
   */
  applyFilter(
    getValue: (physicalRow: number, col: number) => unknown,
    filters: ColumnFilter[],
  ): void {
    const nextHidden = filteredHiddenRows(this.rows.length, getValue, filters);
    this.rows.setHidden(this.filterHidden, false);
    this.rows.setHidden(nextHidden, true);
    this.filterHidden = nextHidden;
    this.emit();
  }

  /**
   * Reset both mappers to identity orders of the given lengths, discarding all
   * sort and filter state. Notifies.
   */
  resize(rowCount: number, colCount: number): void {
    this.rows.reset(rowCount);
    this.cols.reset(colCount);
    this.filterHidden = [];
    this.emit();
  }

  /** Subscribe to view changes (sort/filter/resize). Returns an unsubscribe fn. */
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
