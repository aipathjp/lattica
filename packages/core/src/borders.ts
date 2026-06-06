/**
 * Cell border model (pure logic, no rendering).
 *
 * A {@link BorderModel} tracks per-side border styling for individual cells,
 * keyed by their zero-based `{ row, col }` address. Each of the four sides can
 * carry an independent {@link BorderStyle}; setting a side to `null` clears just
 * that side, and a cell with no remaining sides is dropped entirely. The model
 * is renderer-agnostic and exposes a change subscription so view layers can
 * react.
 */

import type { CellAddress } from './types.js';
import { addressKey } from './coords.js';

/** One edge of a cell. */
export type BorderSide = 'top' | 'right' | 'bottom' | 'left';

/** Visual styling for a single border edge. */
export interface BorderStyle {
  width?: number;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

/** The set of styled borders for a cell, keyed by side. */
export type CellBorders = Partial<Record<BorderSide, BorderStyle>>;

export class BorderModel {
  private readonly borders = new Map<string, CellBorders>();
  private readonly listeners = new Set<() => void>();

  /**
   * Set (or, when `style` is `null`, clear) one `side` of the cell at
   * `(row,col)`. Clearing the last remaining side removes the cell's entry.
   */
  set(row: number, col: number, side: BorderSide, style: BorderStyle | null): void {
    const key = this.keyOf(row, col);
    const existing = this.borders.get(key);
    if (style === null) {
      if (existing === undefined || existing[side] === undefined) {
        return;
      }
      delete existing[side];
      if (Object.keys(existing).length === 0) {
        this.borders.delete(key);
      }
      this.notify();
      return;
    }
    const cell = existing ?? {};
    cell[side] = { ...style };
    if (existing === undefined) {
      this.borders.set(key, cell);
    }
    this.notify();
  }

  /** A copy of the borders for `(row,col)`; `{}` if the cell has none. */
  get(row: number, col: number): CellBorders {
    const cell = this.borders.get(this.keyOf(row, col));
    if (cell === undefined) {
      return {};
    }
    const result: CellBorders = {};
    for (const side of Object.keys(cell) as BorderSide[]) {
      result[side] = { ...cell[side]! };
    }
    return result;
  }

  /** Remove every side from the cell at `(row,col)`. */
  clearCell(row: number, col: number): void {
    if (this.borders.delete(this.keyOf(row, col))) {
      this.notify();
    }
  }

  /** Remove all borders from every cell. */
  clear(): void {
    if (this.borders.size === 0) {
      return;
    }
    this.borders.clear();
    this.notify();
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private keyOf(row: number, col: number): string {
    const address: CellAddress = { row, col };
    return addressKey(address);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
