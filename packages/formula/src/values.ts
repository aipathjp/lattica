/**
 * Value coercion helpers implementing Excel-compatible type semantics.
 *
 * The runtime value of a formula is a {@link CellScalar} (number | string |
 * boolean | null) or a {@link FormulaError}. Ranges evaluate to a 2D array of
 * scalars; functions decide how to consume them.
 */

import { FormulaError, VALUE } from './errors.js';

export type CellScalar = number | string | boolean | null;
/** A 2D block of values, as produced by a range reference. */
export type Matrix = (CellScalar | FormulaError)[][];
export type FormulaValue = CellScalar | FormulaError | Matrix;

/** Coerce a scalar to a number following Excel rules; returns FormulaError on failure. */
export function toNumber(value: CellScalar | FormulaError): number | FormulaError {
  if (FormulaError.is(value)) {
    return value;
  }
  if (value === null) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  const num = Number(trimmed);
  return Number.isNaN(num) ? VALUE : num;
}

/** Coerce a scalar to a string. */
export function toText(value: CellScalar | FormulaError): string {
  if (FormulaError.is(value)) {
    return value.type;
  }
  if (value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

/** Coerce a scalar to a boolean following Excel rules. */
export function toBoolean(value: CellScalar | FormulaError): boolean | FormulaError {
  if (FormulaError.is(value)) {
    return value;
  }
  if (value === null) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const upper = value.trim().toUpperCase();
  if (upper === 'TRUE') {
    return true;
  }
  if (upper === 'FALSE') {
    return false;
  }
  return VALUE;
}

/**
 * Excel comparison ordering. Numbers < text < booleans by type rank; within a
 * type, natural ordering (text is case-insensitive). Returns -1, 0, or 1.
 */
export function compareScalars(a: CellScalar, b: CellScalar): number {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) {
    return ra < rb ? -1 : 1;
  }
  switch (ra) {
    case 0: {
      // number (null treated as 0 only for arithmetic, but for comparison
      // an empty cell ranks as number 0)
      const na = a === null ? 0 : (a as number);
      const nb = b === null ? 0 : (b as number);
      return na === nb ? 0 : na < nb ? -1 : 1;
    }
    case 1: {
      const sa = (a as string).toUpperCase();
      const sb = (b as string).toUpperCase();
      return sa === sb ? 0 : sa < sb ? -1 : 1;
    }
    default: {
      const ba = a ? 1 : 0;
      const bb = b ? 1 : 0;
      return ba === bb ? 0 : ba < bb ? -1 : 1;
    }
  }
}

function typeRank(value: CellScalar): 0 | 1 | 2 {
  if (value === null || typeof value === 'number') {
    return 0;
  }
  if (typeof value === 'string') {
    return 1;
  }
  return 2;
}

/** Is this a number-or-coercible value (for numeric aggregation that skips text)? */
export function isNumeric(value: CellScalar): value is number | boolean {
  return typeof value === 'number' || typeof value === 'boolean';
}
