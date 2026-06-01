/**
 * SelectionModel — tracks the active cell, the anchor used for shift-extension,
 * and a list of selected ranges (for multi-range / ctrl-click selection).
 *
 * The model is grid-aware: it clamps all movement to the supplied dimensions
 * and never produces an out-of-bounds active cell. It is pure UI state and
 * emits a change event on every mutation.
 */

import type { CellAddress, GridRange } from './types.js';
import { addressEquals } from './coords.js';
import { clampRange, normalizeRange, rangeContains, singleCell } from './range.js';

export interface SelectionState {
  readonly active: CellAddress;
  readonly anchor: CellAddress;
  readonly ranges: readonly GridRange[];
}

export type SelectionListener = (state: SelectionState) => void;

export interface SelectionModelOptions {
  rowCount: number;
  colCount: number;
}

export class SelectionModel {
  private rowCount: number;
  private colCount: number;
  private active: CellAddress = { row: 0, col: 0 };
  private anchor: CellAddress = { row: 0, col: 0 };
  private ranges: GridRange[] = [singleCell({ row: 0, col: 0 })];
  private readonly listeners = new Set<SelectionListener>();

  constructor(options: SelectionModelOptions) {
    this.rowCount = Math.max(0, options.rowCount);
    this.colCount = Math.max(0, options.colCount);
  }

  setDimensions(rowCount: number, colCount: number): void {
    this.rowCount = Math.max(0, rowCount);
    this.colCount = Math.max(0, colCount);
    // Re-clamp current selection.
    this.setActive(this.active);
  }

  getState(): SelectionState {
    return { active: this.active, anchor: this.anchor, ranges: this.ranges };
  }

  private clampAddress(address: CellAddress): CellAddress {
    if (this.rowCount === 0 || this.colCount === 0) {
      return { row: 0, col: 0 };
    }
    return {
      row: Math.max(0, Math.min(address.row, this.rowCount - 1)),
      col: Math.max(0, Math.min(address.col, this.colCount - 1)),
    };
  }

  /** Move the active cell, collapsing the selection to that single cell. */
  setActive(address: CellAddress): void {
    const clamped = this.clampAddress(address);
    this.active = clamped;
    this.anchor = clamped;
    this.ranges = [singleCell(clamped)];
    this.emit();
  }

  /** Extend the selection from the anchor to `address` (shift-click / shift-arrow). */
  extendTo(address: CellAddress): void {
    const clamped = this.clampAddress(address);
    this.active = clamped;
    this.ranges = [{ start: this.anchor, end: clamped }];
    this.emit();
  }

  /** Add an independent range, keeping existing ones (ctrl-click). */
  addRange(range: GridRange): void {
    const clamped = clampRange(range, this.rowCount, this.colCount);
    this.ranges = [...this.ranges, clamped];
    this.anchor = clamped.start;
    this.active = clamped.end;
    this.emit();
  }

  /** Move the active cell by a delta, collapsing selection. */
  move(dRow: number, dCol: number): void {
    this.setActive({ row: this.active.row + dRow, col: this.active.col + dCol });
  }

  /** Extend the selection by a delta from the current active cell. */
  extend(dRow: number, dCol: number): void {
    this.extendTo({ row: this.active.row + dRow, col: this.active.col + dCol });
  }

  /** Select an entire row. */
  selectRow(row: number): void {
    const r = Math.max(0, Math.min(row, this.rowCount - 1));
    this.active = { row: r, col: 0 };
    this.anchor = { row: r, col: 0 };
    this.ranges = [{ start: { row: r, col: 0 }, end: { row: r, col: this.colCount - 1 } }];
    this.emit();
  }

  /** Select an entire column. */
  selectColumn(col: number): void {
    const c = Math.max(0, Math.min(col, this.colCount - 1));
    this.active = { row: 0, col: c };
    this.anchor = { row: 0, col: c };
    this.ranges = [{ start: { row: 0, col: c }, end: { row: this.rowCount - 1, col: c } }];
    this.emit();
  }

  /** Select the whole grid. */
  selectAll(): void {
    this.anchor = { row: 0, col: 0 };
    this.active = { row: 0, col: 0 };
    this.ranges = [
      { start: { row: 0, col: 0 }, end: { row: this.rowCount - 1, col: this.colCount - 1 } },
    ];
    this.emit();
  }

  /** Is the given cell within any selected range? */
  isSelected(address: CellAddress): boolean {
    return this.ranges.some((range) => rangeContains(range, address));
  }

  /** Is the given cell the active cell? */
  isActive(address: CellAddress): boolean {
    return addressEquals(this.active, address);
  }

  /** The bounding box of all selected ranges, normalized. */
  getSelectionBounds(): GridRange {
    let { top, left, bottom, right } = normalizeRange(this.ranges[0]!);
    for (let i = 1; i < this.ranges.length; i++) {
      const n = normalizeRange(this.ranges[i]!);
      top = Math.min(top, n.top);
      left = Math.min(left, n.left);
      bottom = Math.max(bottom, n.bottom);
      right = Math.max(right, n.right);
    }
    return { start: { row: top, col: left }, end: { row: bottom, col: right } };
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
