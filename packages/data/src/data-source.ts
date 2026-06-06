/**
 * DataSource — binds an array-of-objects dataset plus a column schema to the
 * grid model. Each row is a plain object (`T`); each column is described by a
 * `ColumnDef` that names the object property it reads (`data`) and an optional
 * display `header`.
 *
 * The DataSource sits on top of two {@link IndexMapper}s — one for rows, one for
 * columns — so that every read goes through a visual→physical translation. The
 * grid asks for "visual cell (r, c)"; the DataSource resolves that to the
 * physical row object and the physical column definition, then reads/writes the
 * underlying property. Hiding, moving, sorting, and filtering are all expressed
 * purely as mutations of the exposed `rows` / `cols` mappers — the DataSource
 * itself never reorders the backing array, keeping object identity stable.
 *
 * Out-of-range visual indices read as `null` and writes to them are ignored, so
 * the renderer can probe slightly beyond the edges without special-casing.
 *
 * Mutations that change observable output (`loadData`, `setCell`) notify
 * subscribers. Reordering/hiding done through the mappers is observed by
 * subscribing to those mappers directly.
 */

import type { IndexMapper } from './index-mapper.js';
import { IndexMapper as IndexMapperImpl } from './index-mapper.js';

/** Describes a single column: which property it reads and an optional header. */
export interface ColumnDef<T> {
  /** Property key on the row object this column reads/writes. */
  data: keyof T & string;
  /** Display header; falls back to `data` when omitted. */
  header?: string;
}

export class DataSource<T extends Record<string, unknown>> {
  /** Backing row objects in physical order. */
  private source: T[];
  /** Column schema in physical order. */
  private readonly columns: ColumnDef<T>[];

  /** Visual↔physical mapper for rows. */
  readonly rows: IndexMapper;
  /** Visual↔physical mapper for columns. */
  readonly cols: IndexMapper;

  private readonly listeners = new Set<() => void>();

  constructor(opts: { data?: T[]; columns: ColumnDef<T>[] }) {
    this.source = opts.data ?? [];
    this.columns = opts.columns;
    this.rows = new IndexMapperImpl(this.source.length);
    this.cols = new IndexMapperImpl(this.columns.length);
  }

  /** Replace the dataset, resetting the row mapper to the new length. Emits. */
  loadData(rows: T[]): void {
    this.source = rows;
    this.rows.reset(rows.length);
    this.emit();
  }

  /** Number of visible rows. */
  getRowCount(): number {
    return this.rows.visibleCount;
  }

  /** Number of visible columns. */
  getColCount(): number {
    return this.cols.visibleCount;
  }

  /**
   * Value at a visible visual cell, or `null` if the visual indices are out of
   * range (hidden/beyond the edge).
   */
  getCell(visualRow: number, visualCol: number): unknown {
    const physRow = this.rows.getPhysicalIndex(visualRow);
    const physCol = this.cols.getPhysicalIndex(visualCol);
    if (physRow === -1 || physCol === -1) {
      return null;
    }
    const row = this.source[physRow]!;
    const col = this.columns[physCol]!;
    return row[col.data];
  }

  /**
   * Write a value back onto the bound row object. Out-of-range visual cells are
   * ignored. Emits when a write actually targets a valid cell.
   */
  setCell(visualRow: number, visualCol: number, value: unknown): void {
    const physRow = this.rows.getPhysicalIndex(visualRow);
    const physCol = this.cols.getPhysicalIndex(visualCol);
    if (physRow === -1 || physCol === -1) {
      return;
    }
    const row = this.source[physRow]!;
    const col = this.columns[physCol]!;
    row[col.data] = value as T[keyof T & string];
    this.emit();
  }

  /** Header for a visible column: the `header` field, or the `data` key. */
  getColumnHeader(visualCol: number): string {
    const physCol = this.cols.getPhysicalIndex(visualCol);
    if (physCol === -1) {
      return '';
    }
    const col = this.columns[physCol]!;
    return col.header ?? col.data;
  }

  /** The full visible matrix in visual (row, col) order. */
  getData(): unknown[][] {
    const result: unknown[][] = [];
    const physRows = this.rows.getVisibleIndexes();
    const physCols = this.cols.getVisibleIndexes();
    for (const physRow of physRows) {
      const row = this.source[physRow]!;
      const out: unknown[] = [];
      for (const physCol of physCols) {
        out.push(row[this.columns[physCol]!.data]);
      }
      result.push(out);
    }
    return result;
  }

  /** The underlying row objects in physical order. */
  getSourceData(): T[] {
    return this.source;
  }

  /** Subscribe to data mutations (`loadData` / `setCell`). Returns unsubscribe. */
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
