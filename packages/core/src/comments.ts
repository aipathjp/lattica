/**
 * Cell comment model (pure logic, no rendering).
 *
 * A {@link CommentModel} associates a short text note with individual cells,
 * keyed by their zero-based `{ row, col }` address. Setting an empty (or
 * whitespace-only) note removes any existing comment, mirroring spreadsheet
 * behaviour where clearing a comment's text deletes it. The model is renderer-
 * agnostic and exposes a change subscription so view layers can react.
 */

import type { CellAddress } from './types.js';
import { addressKey } from './coords.js';

/** A comment attached to a single cell. */
export interface CellComment {
  row: number;
  col: number;
  text: string;
}

export class CommentModel {
  private readonly comments = new Map<string, CellComment>();
  private readonly listeners = new Set<() => void>();

  /**
   * Attach `text` to `(row,col)`. An empty or whitespace-only `text` removes any
   * existing comment instead of storing a blank one.
   */
  set(row: number, col: number, text: string): void {
    const trimmed = text.trim();
    if (trimmed === '') {
      this.remove(row, col);
      return;
    }
    const key = this.keyOf(row, col);
    this.comments.set(key, { row, col, text });
    this.notify();
  }

  /** The comment text at `(row,col)`, or null if none. */
  get(row: number, col: number): string | null {
    const comment = this.comments.get(this.keyOf(row, col));
    return comment === undefined ? null : comment.text;
  }

  /**
   * Remove the comment at `(row,col)`.
   * @returns whether a comment was removed.
   */
  remove(row: number, col: number): boolean {
    const removed = this.comments.delete(this.keyOf(row, col));
    if (removed) {
      this.notify();
    }
    return removed;
  }

  /** Whether a comment exists at `(row,col)`. */
  has(row: number, col: number): boolean {
    return this.comments.has(this.keyOf(row, col));
  }

  /** A snapshot copy of every comment. */
  list(): CellComment[] {
    return [...this.comments.values()].map((c) => ({ ...c }));
  }

  /** Remove every comment. */
  clear(): void {
    if (this.comments.size === 0) {
      return;
    }
    this.comments.clear();
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
