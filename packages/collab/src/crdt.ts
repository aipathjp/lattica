/**
 * Table CRDT — a last-write-wins (LWW) register per cell, keyed by an opaque
 * string (the React layer keys by a stable row/column order key from
 * {@link ./order-key}, so inserts/deletes don't disturb existing references).
 *
 * Each write carries a Lamport `clock` and the originating `site`. Concurrent
 * writes to the same cell are resolved deterministically by `(clock, site)`,
 * which avoids tombstones and the concurrent-insert interleaving problems that
 * plague sequence CRDTs. Applying the same set of operations in any order on
 * any replica converges to the same state (commutative, associative,
 * idempotent).
 */

import type { CellValue } from '@lattica/core';

export type SiteId = string;

export interface CellOp {
  readonly kind: 'cell';
  readonly key: string;
  readonly value: CellValue;
  readonly clock: number;
  readonly site: SiteId;
}

interface Register {
  value: CellValue;
  clock: number;
  site: SiteId;
}

export type DocumentListener = (op: CellOp) => void;

/** Returns true if `incoming` should overwrite `current` under LWW ordering. */
function incomingWins(incoming: { clock: number; site: SiteId }, current: Register): boolean {
  if (incoming.clock !== current.clock) {
    return incoming.clock > current.clock;
  }
  return incoming.site > current.site;
}

export class TableDocument {
  private readonly registers = new Map<string, Register>();
  private clock = 0;
  private readonly listeners = new Set<DocumentListener>();

  constructor(readonly site: SiteId) {}

  /** Current Lamport clock value. */
  getClock(): number {
    return this.clock;
  }

  /** Read a cell's value, or null if unset. */
  get(key: string): CellValue {
    return this.registers.get(key)?.value ?? null;
  }

  /** Whether a key currently holds a value. */
  has(key: string): boolean {
    const reg = this.registers.get(key);
    return reg !== undefined && reg.value !== null;
  }

  /**
   * Apply a local edit: bumps the clock, updates state, and returns the op to
   * broadcast. Notifies local listeners.
   */
  setLocal(key: string, value: CellValue): CellOp {
    this.clock += 1;
    const op: CellOp = { kind: 'cell', key, value, clock: this.clock, site: this.site };
    this.registers.set(key, { value, clock: op.clock, site: op.site });
    this.emit(op);
    return op;
  }

  /**
   * Merge a remote op. Advances the Lamport clock, applies LWW, and returns
   * true if the visible value changed.
   */
  applyRemote(op: CellOp): boolean {
    this.clock = Math.max(this.clock, op.clock);
    const current = this.registers.get(op.key);
    if (current === undefined || incomingWins(op, current)) {
      const changed = (current?.value ?? null) !== op.value;
      this.registers.set(op.key, { value: op.value, clock: op.clock, site: op.site });
      if (changed) {
        this.emit(op);
      }
      return changed;
    }
    return false;
  }

  /** Snapshot of all non-null cell values. */
  snapshot(): Record<string, CellValue> {
    const out: Record<string, CellValue> = {};
    for (const [key, reg] of this.registers) {
      if (reg.value !== null) {
        out[key] = reg.value;
      }
    }
    return out;
  }

  /** Export every register as an op array (for initial sync). */
  exportOps(): CellOp[] {
    const ops: CellOp[] = [];
    for (const [key, reg] of this.registers) {
      ops.push({ kind: 'cell', key, value: reg.value, clock: reg.clock, site: reg.site });
    }
    return ops;
  }

  /** Merge another document's state into this one. */
  merge(other: TableDocument): void {
    for (const op of other.exportOps()) {
      this.applyRemote(op);
    }
  }

  subscribe(listener: DocumentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(op: CellOp): void {
    for (const listener of this.listeners) {
      listener(op);
    }
  }
}
