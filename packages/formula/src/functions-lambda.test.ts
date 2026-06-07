/**
 * LAMBDA & higher-order array functions (Phase E-6): LAMBDA, MAP, REDUCE,
 * SCAN, BYROW, BYCOL. Lambdas are read from the call AST (no value-type or
 * parser changes), so they are only valid as the last argument of these.
 */

import { describe, it, expect } from 'vitest';
import { SheetEngine } from './engine.js';
import { FormulaError } from './errors.js';
import type { CellScalar } from './values.js';

const A = (row: number, col: number) => ({ row, col });
const evalRaw = (f: string) => new SheetEngine().evaluateFormula(f);
const seedCol = (e: SheetEngine, col: number, vals: CellScalar[]) =>
  vals.forEach((v, r) => e.setContent(A(r, col), v));

describe('LAMBDA (bare)', () => {
  it('is an error when not consumed by a higher-order function', () => {
    expect(FormulaError.is(evalRaw('=LAMBDA(x,x+1)'))).toBe(true);
  });
});

describe('MAP', () => {
  it('applies a 1-param lambda over an array (spills)', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [1, 2, 3]);
    e.setContent(A(0, 2), '=MAP(A1:A3,LAMBDA(x,x*10))');
    expect(e.getValue(A(0, 2))).toBe(10);
    expect(e.getValue(A(1, 2))).toBe(20);
    expect(e.getValue(A(2, 2))).toBe(30);
  });

  it('applies a 2-array, 2-param lambda elementwise', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [1, 2]);
    seedCol(e, 1, [10, 20]);
    expect(e.evaluateFormula('=MAP(A1:A2,B1:B2,LAMBDA(a,b,a+b))')).toEqual([[11], [22]]);
  });

  it('pads cells missing from a smaller array with null', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [1, 2, 3]);
    seedCol(e, 1, [10]); // only B1
    // r=0 -> 1+10=11; r=1 -> 2 + (missing -> null -> 0) = 2; r=2 -> 3
    expect(e.evaluateFormula('=MAP(A1:A3,B1:B1,LAMBDA(a,b,a+b))')).toEqual([[11], [2], [3]]);
  });

  it('rejects a missing lambda, too few args, or a param-count mismatch', () => {
    expect(FormulaError.is(evalRaw('=MAP(1)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=MAP(1,2)'))).toBe(true); // last arg not a LAMBDA
    expect(FormulaError.is(evalRaw('=MAP(1,LAMBDA(a,b,a+b))'))).toBe(true); // 1 array, 2 params
  });

  it('rejects a LAMBDA whose params are not plain names', () => {
    expect(FormulaError.is(evalRaw('=MAP(1,LAMBDA(1,2))'))).toBe(true);
  });
});

describe('REDUCE', () => {
  it('folds an array with an accumulator', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [1, 2, 3, 4]);
    expect(e.evaluateFormula('=REDUCE(0,A1:A4,LAMBDA(acc,v,acc+v))')).toBe(10);
  });
  it('rejects wrong arity or a non-2-param lambda', () => {
    expect(FormulaError.is(evalRaw('=REDUCE(0,1)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=REDUCE(0,1,LAMBDA(x,x))'))).toBe(true);
  });
});

describe('SCAN', () => {
  it('returns the running accumulation as a row', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [1, 2, 3]);
    expect(e.evaluateFormula('=SCAN(0,A1:A3,LAMBDA(acc,v,acc+v))')).toEqual([[1, 3, 6]]);
  });
  it('rejects wrong arity or a non-2-param lambda', () => {
    expect(FormulaError.is(evalRaw('=SCAN(0,1)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=SCAN(0,1,LAMBDA(x,x))'))).toBe(true);
  });
});

describe('BYROW / BYCOL', () => {
  it('BYROW reduces each row to a value (column vector)', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(0, 1), 2);
    e.setContent(A(1, 0), 3);
    e.setContent(A(1, 1), 4);
    expect(e.evaluateFormula('=BYROW(A1:B2,LAMBDA(r,SUM(r)))')).toEqual([[3], [7]]);
  });
  it('BYCOL reduces each column to a value (row vector)', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(0, 1), 2);
    e.setContent(A(1, 0), 3);
    e.setContent(A(1, 1), 4);
    expect(e.evaluateFormula('=BYCOL(A1:B2,LAMBDA(c,SUM(c)))')).toEqual([[4, 6]]);
  });
  it('reject wrong arity or non-1-param lambdas', () => {
    expect(FormulaError.is(evalRaw('=BYROW(1)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=BYCOL(1)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=BYROW(1,LAMBDA(a,b,a))'))).toBe(true);
    expect(FormulaError.is(evalRaw('=BYCOL(1,LAMBDA(a,b,a))'))).toBe(true);
  });
});

describe('LAMBDA composition with LET', () => {
  it('a LET-bound name resolves inside a lambda body', () => {
    // k=100 from LET; REDUCE over [1] computes acc(0) + k.
    expect(evalRaw('=LET(k,100,REDUCE(0,1,LAMBDA(a,v,a+k)))')).toBe(100);
  });
});
