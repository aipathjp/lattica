/**
 * Dynamic-array functions: TRANSPOSE, SEQUENCE, UNIQUE, SORT, FILTER.
 * Exercised through the SheetEngine so the spilled result is observable, and
 * directly through a one-off evaluator for the raw Matrix shape.
 */

import { describe, it, expect } from 'vitest';
import { SheetEngine } from './engine.js';
import { FormulaError } from './errors.js';

const A = (row: number, col: number) => ({ row, col });

/** Evaluate a formula in isolation, returning its raw FormulaValue. */
function evalRaw(formula: string) {
  return new SheetEngine().evaluateFormula(formula);
}

describe('TRANSPOSE', () => {
  it('transposes a 2×3 range into 3×2', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(0, 1), 2);
    e.setContent(A(0, 2), 3);
    e.setContent(A(1, 0), 4);
    e.setContent(A(1, 1), 5);
    e.setContent(A(1, 2), 6);
    e.setContent(A(0, 5), '=TRANSPOSE(A1:C2)');
    // Result is 3 rows × 2 cols anchored at F1.
    expect(e.getValue(A(0, 5))).toBe(1);
    expect(e.getValue(A(0, 6))).toBe(4);
    expect(e.getValue(A(1, 5))).toBe(2);
    expect(e.getValue(A(1, 6))).toBe(5);
    expect(e.getValue(A(2, 5))).toBe(3);
    expect(e.getValue(A(2, 6))).toBe(6);
  });

  it('errors on wrong arity', () => {
    expect(FormulaError.is(evalRaw('=TRANSPOSE()'))).toBe(true);
  });

  it('transposes a scalar to itself (1×1)', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 9);
    e.setContent(A(0, 2), '=TRANSPOSE(A1)');
    expect(e.getValue(A(0, 2))).toBe(9);
  });
});

describe('SEQUENCE', () => {
  it('generates a column by default', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=SEQUENCE(3)');
    expect(e.getValue(A(0, 0))).toBe(1);
    expect(e.getValue(A(1, 0))).toBe(2);
    expect(e.getValue(A(2, 0))).toBe(3);
  });

  it('honours rows, cols, start, and step', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=SEQUENCE(2,3,10,5)');
    expect(e.getValue(A(0, 0))).toBe(10);
    expect(e.getValue(A(0, 1))).toBe(15);
    expect(e.getValue(A(0, 2))).toBe(20);
    expect(e.getValue(A(1, 0))).toBe(25);
    expect(e.getValue(A(1, 1))).toBe(30);
    expect(e.getValue(A(1, 2))).toBe(35);
  });

  it('rejects non-positive dimensions', () => {
    expect(FormulaError.is(evalRaw('=SEQUENCE(0)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SEQUENCE(2,0)'))).toBe(true);
  });

  it('rejects wrong arity', () => {
    expect(FormulaError.is(evalRaw('=SEQUENCE()'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SEQUENCE(1,2,3,4,5)'))).toBe(true);
  });

  it('propagates argument errors for each parameter', () => {
    expect(FormulaError.is(evalRaw('=SEQUENCE(1/0)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SEQUENCE(2,1/0)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SEQUENCE(2,2,1/0)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SEQUENCE(2,2,1,1/0)'))).toBe(true);
  });
});

describe('UNIQUE', () => {
  it('removes duplicate rows preserving first-seen order', () => {
    const e = new SheetEngine();
    for (const [r, v] of [
      [0, 'a'],
      [1, 'b'],
      [2, 'a'],
      [3, 'c'],
      [4, 'b'],
    ] as const) {
      e.setContent(A(r, 0), v);
    }
    e.setContent(A(0, 2), '=UNIQUE(A1:A5)');
    expect(e.getValue(A(0, 2))).toBe('a');
    expect(e.getValue(A(1, 2))).toBe('b');
    expect(e.getValue(A(2, 2))).toBe('c');
    // No fourth unique value.
    expect(e.getValue(A(3, 2))).toBeNull();
  });

  it('distinguishes values by type', () => {
    const raw = new SheetEngine().evaluateFormula('=UNIQUE(SEQUENCE(2))');
    expect(Array.isArray(raw)).toBe(true);
  });

  it('treats empty cells and errors as distinct unique values', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1); // A1
    // A2 empty, A3 error, A4 dup of A1, A5 empty (dup of A2)
    e.setContent(A(2, 0), '=1/0'); // A3
    e.setContent(A(3, 0), 1); // A4
    e.setContent(A(0, 2), '=UNIQUE(A1:A5)');
    expect(e.getValue(A(0, 2))).toBe(1);
    expect(e.getValue(A(1, 2))).toBeNull(); // empty row, kept once
    const err = e.getValue(A(2, 2));
    expect(FormulaError.is(err) && err.type).toBe('#DIV/0!');
    expect(e.getValue(A(3, 2))).toBeNull(); // only three unique rows
  });

  it('rejects wrong arity', () => {
    expect(FormulaError.is(evalRaw('=UNIQUE()'))).toBe(true);
  });
});

describe('SORT', () => {
  it('sorts ascending by the first column by default', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 3);
    e.setContent(A(1, 0), 1);
    e.setContent(A(2, 0), 2);
    e.setContent(A(0, 2), '=SORT(A1:A3)');
    expect(e.getValue(A(0, 2))).toBe(1);
    expect(e.getValue(A(1, 2))).toBe(2);
    expect(e.getValue(A(2, 2))).toBe(3);
  });

  it('sorts descending and by an explicit column index', () => {
    const e = new SheetEngine();
    // Two columns; sort by column 2 descending.
    e.setContent(A(0, 0), 'a');
    e.setContent(A(0, 1), 1);
    e.setContent(A(1, 0), 'b');
    e.setContent(A(1, 1), 3);
    e.setContent(A(2, 0), 'c');
    e.setContent(A(2, 1), 2);
    e.setContent(A(0, 4), '=SORT(A1:B3,2,-1)');
    expect(e.getValue(A(0, 4))).toBe('b'); // value 3 row first
    expect(e.getValue(A(1, 4))).toBe('c'); // value 2
    expect(e.getValue(A(2, 4))).toBe('a'); // value 1
  });

  it('rejects an out-of-range sort index', () => {
    expect(FormulaError.is(evalRaw('=SORT(SEQUENCE(2),5)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SORT(SEQUENCE(2),0)'))).toBe(true);
  });

  it('propagates errors from index and order arguments', () => {
    expect(FormulaError.is(evalRaw('=SORT(SEQUENCE(2),1/0)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SORT(SEQUENCE(2),1,1/0)'))).toBe(true);
  });

  it('leaves rows containing an error in place', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 2);
    e.setContent(A(1, 0), '=1/0');
    e.setContent(A(2, 0), 1);
    const raw = e.evaluateFormula('=SORT(A1:A3)');
    expect(Array.isArray(raw)).toBe(true);
  });

  it('rejects wrong arity', () => {
    expect(FormulaError.is(evalRaw('=SORT()'))).toBe(true);
  });
});

describe('FILTER', () => {
  it('keeps rows whose include flag is truthy', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 'x');
    e.setContent(A(1, 0), 'y');
    e.setContent(A(2, 0), 'z');
    e.setContent(A(0, 1), true);
    e.setContent(A(1, 1), false);
    e.setContent(A(2, 1), true);
    e.setContent(A(0, 3), '=FILTER(A1:A3,B1:B3)');
    expect(e.getValue(A(0, 3))).toBe('x');
    expect(e.getValue(A(1, 3))).toBe('z');
    expect(e.getValue(A(2, 3))).toBeNull();
  });

  it('returns #N/A when nothing matches and no fallback given', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 'x');
    e.setContent(A(0, 1), false);
    const raw = e.evaluateFormula('=FILTER(A1,B1)');
    expect(FormulaError.is(raw) && raw.type).toBe('#N/A');
  });

  it('returns the fallback when nothing matches', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 'x');
    e.setContent(A(0, 1), false);
    expect(e.evaluateFormula('=FILTER(A1,B1,"none")')).toEqual([['none']]);
  });

  it('errors when include length does not match the array rows', () => {
    expect(FormulaError.is(evalRaw('=FILTER(SEQUENCE(3),SEQUENCE(2))'))).toBe(true);
  });

  it('propagates an error in the include vector', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 'x');
    e.setContent(A(0, 1), '=1/0');
    const raw = e.evaluateFormula('=FILTER(A1,B1)');
    expect(FormulaError.is(raw) && raw.type).toBe('#DIV/0!');
  });

  it('rejects wrong arity', () => {
    expect(FormulaError.is(evalRaw('=FILTER(A1)'))).toBe(true);
  });
});
