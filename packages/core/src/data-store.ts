/**
 * DataStore — sparse, row/column-addressable cell storage.
 *
 * Values are kept in a `Map` keyed by `"row,col"` so that empty cells cost
 * nothing. The store tracks logical row/column counts independently of the
 * populated cells, supporting grids far larger than their filled region.
 *
 * The store is intentionally dumb: it holds raw {@link CellValue}s and emits
 * change notifications. Formulas, validation, and undo live in higher layers
 * that drive the store through commands.
 */

import type { CellAddress, CellValue } from './types.js';
import { addressKey } from './coords.js';

export interface CellChange {
  readonly row: number;
  readonly col: number;
  readonly previous: CellValue;
  readonly next: CellValue;
}

export type DataStoreListener = (changes: readonly CellChange[]) => void;

export interface DataStoreOptions {
  rowCount: number;
  colCount: number;
}

export class DataStore {
  private rowCount: number;
  private colCount: number;
  private readonly cells = new Map<string, CellValue>();
  private readonly listeners = new Set<DataStoreListener>();

  constructor(options: DataStoreOptions) {
    if (options.rowCount < 0 || options.colCount < 0) {
      throw new RangeError('rowCount and colCount must be >= 0');
    }
    this.rowCount = options.rowCount;
    this.colCount = options.colCount;
  }

  getRowCount(): number {
    return this.rowCount;
  }

  getColCount(): number {
    return this.colCount;
  }

  private assertInBounds(row: number, col: number): void {
    if (row < 0 || row >= this.rowCount || col < 0 || col >= this.colCount) {
      throw new RangeError(
        `cell (${row}, ${col}) out of bounds [0,${this.rowCount}) x [0,${this.colCount})`,
      );
    }
  }

  /** Read a cell value; returns `null` for empty cells. */
  get(address: CellAddress): CellValue {
    this.assertInBounds(address.row, address.col);
    return this.cells.get(addressKey(address)) ?? null;
  }

  /** Write a single cell, emitting a change if the value differs. */
  set(address: CellAddress, value: CellValue): void {
    this.setMany([{ address, value }]);
  }

  /** Write multiple cells atomically, emitting one batched change event. */
  setMany(entries: ReadonlyArray<{ address: CellAddress; value: CellValue }>): void {
    const changes: CellChange[] = [];
    for (const { address, value } of entries) {
      this.assertInBounds(address.row, address.col);
      const key = addressKey(address);
      const previous = this.cells.get(key) ?? null;
      if (Object.is(previous, value)) {
        continue;
      }
      if (value === null) {
        this.cells.delete(key);
      } else {
        this.cells.set(key, value);
      }
      changes.push({ row: address.row, col: address.col, previous, next: value });
    }
    if (changes.length > 0) {
      this.emit(changes);
    }
  }

  /** Number of non-empty cells. */
  get populatedCount(): number {
    return this.cells.size;
  }

  /** Iterate every populated cell. */
  forEachPopulated(fn: (address: CellAddress, value: CellValue) => void): void {
    for (const [key, value] of this.cells) {
      const comma = key.indexOf(',');
      const row = Number(key.slice(0, comma));
      const col = Number(key.slice(comma + 1));
      fn({ row, col }, value);
    }
  }

  /** Resize the logical grid; cells outside the new bounds are dropped. */
  resize(rowCount: number, colCount: number): void {
    if (rowCount < 0 || colCount < 0) {
      throw new RangeError('rowCount and colCount must be >= 0');
    }
    const changes: CellChange[] = [];
    if (rowCount < this.rowCount || colCount < this.colCount) {
      for (const [key, value] of [...this.cells]) {
        const comma = key.indexOf(',');
        const row = Number(key.slice(0, comma));
        const col = Number(key.slice(comma + 1));
        if (row >= rowCount || col >= colCount) {
          this.cells.delete(key);
          changes.push({ row, col, previous: value, next: null });
        }
      }
    }
    this.rowCount = rowCount;
    this.colCount = colCount;
    if (changes.length > 0) {
      this.emit(changes);
    }
  }

  /** Subscribe to change events. Returns an unsubscribe function. */
  subscribe(listener: DataStoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(changes: readonly CellChange[]): void {
    for (const listener of this.listeners) {
      listener(changes);
    }
  }
}
