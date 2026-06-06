/**
 * Merged-cell model (pure logic, no rendering).
 *
 * A {@link MergeModel} tracks rectangular blocks of cells that should be treated
 * as a single visual unit. Each block has an *anchor* (its top-left cell, where
 * content lives) and zero or more *covered* cells (the remaining cells, which a
 * renderer hides). A cell belongs to at most one merge; {@link MergeModel.add}
 * rejects any block that overlaps an existing one. The model is renderer-
 * agnostic: it exposes membership queries and a change subscription so view
 * layers can react.
 */

import type { GridRange } from './types.js';
import { normalizeRange, rangesIntersect } from './range.js';

/** A rectangular merged block addressed by its anchor plus row/column span. */
export interface MergeArea {
  /** Anchor row (top edge, zero-based). */
  row: number;
  /** Anchor column (left edge, zero-based). */
  col: number;
  /** Number of rows the block spans (>= 1). */
  rowspan: number;
  /** Number of columns the block spans (>= 1). */
  colspan: number;
}

/** Convert a {@link MergeArea} to a {@link GridRange} for geometry helpers. */
function areaToRange(area: MergeArea): GridRange {
  return {
    start: { row: area.row, col: area.col },
    end: { row: area.row + area.rowspan - 1, col: area.col + area.colspan - 1 },
  };
}

/** Is `(row,col)` inside the inclusive bounds of `area`? */
function areaContains(area: MergeArea, row: number, col: number): boolean {
  return (
    row >= area.row &&
    row < area.row + area.rowspan &&
    col >= area.col &&
    col < area.col + area.colspan
  );
}

export class MergeModel {
  private readonly areas: MergeArea[] = [];
  private readonly listeners = new Set<() => void>();

  /**
   * Register a merged block.
   * @throws RangeError if `rowspan` or `colspan` is less than 1, or if the block
   *   overlaps an existing merge.
   */
  add(area: MergeArea): void {
    if (area.rowspan < 1 || area.colspan < 1) {
      throw new RangeError(
        `merge span must be >= 1, got rowspan=${area.rowspan} colspan=${area.colspan}`,
      );
    }
    const range = areaToRange(area);
    for (const existing of this.areas) {
      if (rangesIntersect(range, areaToRange(existing))) {
        throw new RangeError(
          `merge at (${area.row},${area.col}) overlaps existing merge at (${existing.row},${existing.col})`,
        );
      }
    }
    // Store a normalized copy so the caller cannot mutate internal state.
    const n = normalizeRange(range);
    this.areas.push({
      row: n.top,
      col: n.left,
      rowspan: n.bottom - n.top + 1,
      colspan: n.right - n.left + 1,
    });
    this.notify();
  }

  /**
   * Remove the merge whose anchor (top-left cell) is exactly `(row,col)`.
   * @returns whether a merge was removed.
   */
  remove(row: number, col: number): boolean {
    const index = this.areas.findIndex((a) => a.row === row && a.col === col);
    if (index === -1) {
      return false;
    }
    this.areas.splice(index, 1);
    this.notify();
    return true;
  }

  /** Remove every merge. */
  clear(): void {
    if (this.areas.length === 0) {
      return;
    }
    this.areas.length = 0;
    this.notify();
  }

  /** The merge covering `(row,col)` (as anchor or covered cell), else null. */
  getMergeAt(row: number, col: number): MergeArea | null {
    for (const area of this.areas) {
      if (areaContains(area, row, col)) {
        return { ...area };
      }
    }
    return null;
  }

  /** Is `(row,col)` the anchor (top-left) of some merge? */
  isAnchor(row: number, col: number): boolean {
    return this.areas.some((a) => a.row === row && a.col === col);
  }

  /** Is `(row,col)` inside a merge but not its anchor (i.e. visually hidden)? */
  isCovered(row: number, col: number): boolean {
    const area = this.getMergeAt(row, col);
    if (area === null) {
      return false;
    }
    return !(area.row === row && area.col === col);
  }

  /** A snapshot copy of all merged blocks. */
  list(): MergeArea[] {
    return this.areas.map((a) => ({ ...a }));
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
