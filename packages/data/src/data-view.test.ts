import { describe, it, expect, vi } from 'vitest';
import { DataView } from './data-view.js';
import type { SortConfig } from './sort.js';
import type { ColumnFilter } from './filter.js';

/**
 * Backing matrix accessor: `matrix[physicalRow][col]` is the cell value. Returns
 * the value for a given physical row and column.
 */
function makeAccessor(matrix: unknown[][]): (physicalRow: number, col: number) => unknown {
  return (physicalRow, col) => matrix[physicalRow]?.[col];
}

describe('DataView', () => {
  it('starts with identity counts and mapping', () => {
    const view = new DataView(3, 2);
    expect(view.getRowCount()).toBe(3);
    expect(view.getColCount()).toBe(2);
    expect(view.toPhysical(0, 0)).toEqual({ row: 0, col: 0 });
    expect(view.toPhysical(2, 1)).toEqual({ row: 2, col: 1 });
  });

  it('exposes underlying row/col mappers', () => {
    const view = new DataView(4, 3);
    expect(view.rows.length).toBe(4);
    expect(view.cols.length).toBe(3);
  });

  it('returns -1 components for out-of-range visual cells', () => {
    const view = new DataView(2, 2);
    expect(view.toPhysical(5, 5)).toEqual({ row: -1, col: -1 });
  });

  it('sort changes visual order and toPhysical reflects it', () => {
    // Column 0 values: row0=30, row1=10, row2=20 -> asc order rows: 1,2,0
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    const configs: SortConfig[] = [{ col: 0, direction: 'asc' }];
    view.applySort(makeAccessor(matrix), configs);
    expect(view.toPhysical(0, 0).row).toBe(1);
    expect(view.toPhysical(1, 0).row).toBe(2);
    expect(view.toPhysical(2, 0).row).toBe(0);
  });

  it('descending sort orders high to low', () => {
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    view.applySort(makeAccessor(matrix), [{ col: 0, direction: 'desc' }]);
    expect(view.toPhysical(0, 0).row).toBe(0);
    expect(view.toPhysical(1, 0).row).toBe(2);
    expect(view.toPhysical(2, 0).row).toBe(1);
  });

  it('empty sort configs resets to identity order', () => {
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    view.applySort(makeAccessor(matrix), [{ col: 0, direction: 'asc' }]);
    expect(view.toPhysical(0, 0).row).toBe(1);
    view.applySort(makeAccessor(matrix), []);
    expect(view.toPhysical(0, 0).row).toBe(0);
    expect(view.toPhysical(1, 0).row).toBe(1);
    expect(view.toPhysical(2, 0).row).toBe(2);
  });

  it('filter hides rows and drops the visible row count', () => {
    // Keep rows where col0 >= 20 -> rows 0 and 2 visible, row1 hidden.
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    const filters: ColumnFilter[] = [{ col: 0, conditions: [{ kind: 'gte', value: 20 }] }];
    view.applyFilter(makeAccessor(matrix), filters);
    expect(view.getRowCount()).toBe(2);
    expect(view.toPhysical(0, 0).row).toBe(0);
    expect(view.toPhysical(1, 0).row).toBe(2);
  });

  it('re-applying a filter replaces the prior hidden set', () => {
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    const accessor = makeAccessor(matrix);
    // First filter hides row1 (value 10 < 20).
    view.applyFilter(accessor, [{ col: 0, conditions: [{ kind: 'gte', value: 20 }] }]);
    expect(view.getRowCount()).toBe(2);
    expect(view.rows.isHidden(1)).toBe(true);
    // Second filter hides only row0 (value 30 > 25); row1 must reappear.
    view.applyFilter(accessor, [{ col: 0, conditions: [{ kind: 'lt', value: 25 }] }]);
    expect(view.getRowCount()).toBe(2);
    expect(view.rows.isHidden(0)).toBe(true);
    expect(view.rows.isHidden(1)).toBe(false);
    expect(view.rows.isHidden(2)).toBe(false);
  });

  it('clearing the filter (empty filters) unhides everything', () => {
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    const accessor = makeAccessor(matrix);
    view.applyFilter(accessor, [{ col: 0, conditions: [{ kind: 'gte', value: 20 }] }]);
    expect(view.getRowCount()).toBe(2);
    view.applyFilter(accessor, []);
    expect(view.getRowCount()).toBe(3);
    expect(view.rows.isHidden(1)).toBe(false);
  });

  it('combines sort and filter', () => {
    // col0: row0=30, row1=10, row2=20, row3=5
    // Filter col0 >= 15 keeps rows 0 and 2; sort asc -> visual rows 2 then 0.
    const matrix = [[30], [10], [20], [5]];
    const view = new DataView(4, 1);
    const accessor = makeAccessor(matrix);
    view.applyFilter(accessor, [{ col: 0, conditions: [{ kind: 'gte', value: 15 }] }]);
    view.applySort(accessor, [{ col: 0, direction: 'asc' }]);
    expect(view.getRowCount()).toBe(2);
    expect(view.toPhysical(0, 0).row).toBe(2);
    expect(view.toPhysical(1, 0).row).toBe(0);
  });

  it('resize clears sort and filter state', () => {
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    const accessor = makeAccessor(matrix);
    view.applySort(accessor, [{ col: 0, direction: 'asc' }]);
    view.applyFilter(accessor, [{ col: 0, conditions: [{ kind: 'gte', value: 20 }] }]);
    expect(view.getRowCount()).toBe(2);

    view.resize(2, 4);
    expect(view.rows.length).toBe(2);
    expect(view.cols.length).toBe(4);
    expect(view.getRowCount()).toBe(2);
    expect(view.getColCount()).toBe(4);
    // Identity order restored, nothing hidden.
    expect(view.toPhysical(0, 0).row).toBe(0);
    expect(view.toPhysical(1, 0).row).toBe(1);
    expect(view.rows.isHidden(0)).toBe(false);
  });

  it('resize then applyFilter starts from a clean filter set', () => {
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    const accessor = makeAccessor(matrix);
    view.applyFilter(accessor, [{ col: 0, conditions: [{ kind: 'gte', value: 20 }] }]);
    view.resize(3, 1);
    // After resize, previously-tracked hidden set is empty; new filter hides only its rows.
    // Keep col0 >= 15: row1 (value 10) fails and is hidden; rows 0 and 2 stay.
    view.applyFilter(accessor, [{ col: 0, conditions: [{ kind: 'gte', value: 15 }] }]);
    expect(view.rows.isHidden(1)).toBe(true);
    expect(view.rows.isHidden(0)).toBe(false);
    expect(view.rows.isHidden(2)).toBe(false);
  });

  it('notifies subscribers on applySort/applyFilter/resize and stops after unsubscribe', () => {
    const matrix = [[30], [10], [20]];
    const view = new DataView(3, 1);
    const accessor = makeAccessor(matrix);
    const listener = vi.fn();
    const unsubscribe = view.subscribe(listener);

    view.applySort(accessor, []);
    expect(listener).toHaveBeenCalledTimes(1);
    view.applyFilter(accessor, []);
    expect(listener).toHaveBeenCalledTimes(2);
    view.resize(2, 2);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    view.resize(3, 3);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
