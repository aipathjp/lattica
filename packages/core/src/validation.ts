/**
 * Cell value validation.
 *
 * A {@link Validator} is a pure predicate (sync or async) over a
 * {@link CellValue}. {@link ValidationModel} resolves an effective validator
 * for a cell — a per-cell validator overrides a per-column one — runs it, and
 * tracks the set of cells that most recently failed validation so the renderer
 * can paint them. Subscribers are notified whenever the invalid set changes
 * shape via {@link ValidationModel.validate} (or the explicit clear).
 */

import type { CellValue } from './types.js';

/** A predicate over a cell value. May be synchronous or asynchronous. */
export type Validator = (value: CellValue) => boolean | Promise<boolean>;

/** Coerce a cell value to a finite number, or `null` when not numeric. */
function toFiniteNumber(value: CellValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Factory collection of common validators. */
export const validators = {
  /** Finite number or a string that parses to a finite number. */
  numeric(): Validator {
    return (value) => toFiniteNumber(value) !== null;
  },

  /** Numeric and an integer. */
  integer(): Validator {
    return (value) => {
      const n = toFiniteNumber(value);
      return n !== null && Number.isInteger(n);
    };
  },

  /** Not `null` and not the empty string. */
  nonEmpty(): Validator {
    return (value) => value !== null && value !== '';
  },

  /** Numeric and within the inclusive `[min, max]` range. */
  range(min: number, max: number): Validator {
    return (value) => {
      const n = toFiniteNumber(value);
      return n !== null && n >= min && n <= max;
    };
  },

  /** Member of an allowed set (strict equality). */
  list(allowed: readonly CellValue[]): Validator {
    return (value) => allowed.includes(value);
  },

  /** `String(value)` matches the regular expression. */
  regex(re: RegExp): Validator {
    return (value) => re.test(String(value));
  },
} as const;

/** A cell coordinate. */
interface Cell {
  readonly row: number;
  readonly col: number;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** Tracks validators per column / per cell and the current invalid set. */
export class ValidationModel {
  private readonly columnValidators = new Map<number, Validator>();
  private readonly cellValidators = new Map<string, Validator>();
  private readonly invalid = new Map<string, Cell>();
  private readonly listeners = new Set<() => void>();

  /** Set (or replace) the validator applied to every cell in a column. */
  setColumnValidator(col: number, v: Validator): void {
    this.columnValidators.set(col, v);
  }

  /** Set (or replace) the validator for a single cell; overrides the column. */
  setCellValidator(row: number, col: number, v: Validator): void {
    this.cellValidators.set(cellKey(row, col), v);
  }

  /** Resolve the effective validator (cell takes precedence over column). */
  getValidator(row: number, col: number): Validator | undefined {
    const cell = this.cellValidators.get(cellKey(row, col));
    if (cell !== undefined) {
      return cell;
    }
    return this.columnValidators.get(col);
  }

  /**
   * Validate a value against the effective validator. With no validator the
   * value is treated as valid. Updates the invalid set and emits accordingly.
   */
  async validate(row: number, col: number, value: CellValue): Promise<boolean> {
    const validator = this.getValidator(row, col);
    if (validator === undefined) {
      return true;
    }
    const ok = await validator(value);
    const key = cellKey(row, col);
    if (ok) {
      this.invalid.delete(key);
    } else {
      this.invalid.set(key, { row, col });
    }
    this.emit();
    return ok;
  }

  /** Is the cell currently in the invalid set? */
  isInvalid(row: number, col: number): boolean {
    return this.invalid.has(cellKey(row, col));
  }

  /** Snapshot of all currently-invalid cells. */
  getInvalid(): Cell[] {
    return [...this.invalid.values()].map((c) => ({ row: c.row, col: c.col }));
  }

  /** Clear the invalid set and notify subscribers. */
  clearInvalid(): void {
    this.invalid.clear();
    this.emit();
  }

  /** Subscribe to invalid-set changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
