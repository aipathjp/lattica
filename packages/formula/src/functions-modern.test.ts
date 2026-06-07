/**
 * Modern lookup / text / array functions (Phase D-1): XLOOKUP, XMATCH, SORTBY,
 * TEXTSPLIT, TEXTBEFORE, TEXTAFTER, VSTACK, HSTACK, LET.
 */

import { describe, it, expect } from 'vitest';
import { SheetEngine } from './engine.js';
import { FormulaError } from './errors.js';
import { evaluate } from './evaluator.js';
import { parseFormula } from './parser.js';
import { createDefaultFunctions } from './functions.js';
import type { CellScalar } from './values.js';

const A = (row: number, col: number) => ({ row, col });
const evalRaw = (f: string) => new SheetEngine().evaluateFormula(f);

/** Seed a column of values starting at (0, col). */
function seedCol(e: SheetEngine, col: number, vals: CellScalar[]): void {
  vals.forEach((v, r) => e.setContent(A(r, col), v));
}

/** Seed A1:B3 = key/value pairs (text keys, numeric values). */
function seedLookup(e: SheetEngine): void {
  seedCol(e, 0, ['apple', 'banana', 'cherry']);
  seedCol(e, 1, [10, 20, 30]);
}

describe('XLOOKUP', () => {
  it('returns the matching value (exact, default)', () => {
    const e = new SheetEngine();
    seedLookup(e);
    expect(e.evaluateFormula('=XLOOKUP("banana",A1:A3,B1:B3)')).toBe(20);
  });

  it('returns if_not_found when missing', () => {
    const e = new SheetEngine();
    seedLookup(e);
    expect(e.evaluateFormula('=XLOOKUP("grape",A1:A3,B1:B3,"none")')).toBe('none');
  });

  it('returns #N/A when missing and no fallback', () => {
    const e = new SheetEngine();
    seedLookup(e);
    const r = e.evaluateFormula('=XLOOKUP("grape",A1:A3,B1:B3)');
    expect(FormulaError.is(r) && r.type).toBe('#N/A');
  });

  it('next-smaller and next-larger match modes', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [10, 20, 30]);
    seedCol(e, 1, ['a', 'b', 'c']);
    expect(e.evaluateFormula('=XLOOKUP(25,A1:A3,B1:B3,"x",-1)')).toBe('b'); // <=25 largest=20 -> b
    expect(e.evaluateFormula('=XLOOKUP(25,A1:A3,B1:B3,"x",1)')).toBe('c'); // >=25 smallest=30 -> c
  });

  it('errors when arrays differ in length', () => {
    const e = new SheetEngine();
    seedLookup(e);
    expect(FormulaError.is(e.evaluateFormula('=XLOOKUP("a",A1:A3,B1:B2)'))).toBe(true);
  });

  it('propagates errors from the lookup and match-mode arguments', () => {
    const e = new SheetEngine();
    seedLookup(e);
    expect(FormulaError.is(e.evaluateFormula('=XLOOKUP(1/0,A1:A3,B1:B3)'))).toBe(true);
    expect(FormulaError.is(e.evaluateFormula('=XLOOKUP("a",A1:A3,B1:B3,"x",1/0)'))).toBe(true);
  });

  it('rejects bad arity', () => {
    expect(FormulaError.is(evalRaw('=XLOOKUP("a")'))).toBe(true);
  });

  it('skips error cells while matching (both exact and approximate passes)', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 10);
    e.setContent(A(1, 0), '=1/0'); // an error in the lookup array
    e.setContent(A(2, 0), 30);
    // mode 1 (next-larger): no exact 15, error skipped, 30 chosen at row 3.
    expect(e.evaluateFormula('=XMATCH(15,A1:A3,1)')).toBe(3);
  });
});

describe('XMATCH', () => {
  it('returns the 1-based position', () => {
    const e = new SheetEngine();
    seedLookup(e);
    expect(e.evaluateFormula('=XMATCH("cherry",A1:A3)')).toBe(3);
  });
  it('returns #N/A when not found, and rejects bad arity', () => {
    const e = new SheetEngine();
    seedLookup(e);
    expect(FormulaError.is(e.evaluateFormula('=XMATCH("x",A1:A3)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=XMATCH("a")'))).toBe(true);
  });
  it('honours next-larger mode', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [10, 20, 30]);
    expect(e.evaluateFormula('=XMATCH(15,A1:A3,1)')).toBe(2);
  });
  it('propagates errors from the lookup and mode arguments', () => {
    const e = new SheetEngine();
    seedCol(e, 0, [10, 20, 30]);
    expect(FormulaError.is(e.evaluateFormula('=XMATCH(1/0,A1:A3)'))).toBe(true);
    expect(FormulaError.is(e.evaluateFormula('=XMATCH(20,A1:A3,1/0)'))).toBe(true);
  });
});

describe('SORTBY', () => {
  it('sorts an array by a key array (spills)', () => {
    const e = new SheetEngine();
    seedCol(e, 0, ['c', 'a', 'b']);
    seedCol(e, 1, [3, 1, 2]);
    e.setContent(A(0, 3), '=SORTBY(A1:A3,B1:B3)');
    expect(e.getValue(A(0, 3))).toBe('a');
    expect(e.getValue(A(1, 3))).toBe('b');
    expect(e.getValue(A(2, 3))).toBe('c');
  });
  it('descending order and length mismatch', () => {
    const e = new SheetEngine();
    seedCol(e, 0, ['a', 'b']);
    seedCol(e, 1, [1, 2]);
    expect(e.evaluateFormula('=SORTBY(A1:A2,B1:B2,-1)')).toEqual([['b'], ['a']]);
    expect(FormulaError.is(e.evaluateFormula('=SORTBY(A1:A2,B1:B3)'))).toBe(true);
  });
  it('treats error keys as equal (stable) and rejects bad arity', () => {
    const e = new SheetEngine();
    seedCol(e, 0, ['a', 'b']);
    e.setContent(A(0, 1), 1);
    e.setContent(A(1, 1), '=1/0'); // error key
    expect(e.evaluateFormula('=SORTBY(A1:A2,B1:B2)')).toEqual([['a'], ['b']]);
    expect(FormulaError.is(evalRaw('=SORTBY(A1:A1)'))).toBe(true);
    expect(FormulaError.is(e.evaluateFormula('=SORTBY(A1:A2,B1:B2,1/0)'))).toBe(true);
  });
});

describe('TEXTSPLIT / TEXTBEFORE / TEXTAFTER', () => {
  it('splits text into a row', () => {
    expect(evalRaw('=TEXTSPLIT("a,b,c",",")')).toEqual([['a', 'b', 'c']]);
  });
  it('rejects an empty delimiter for split', () => {
    expect(FormulaError.is(evalRaw('=TEXTSPLIT("abc","")'))).toBe(true);
  });
  it('propagates errors from the split text and delimiter', () => {
    expect(FormulaError.is(evalRaw('=TEXTSPLIT(1/0,",")'))).toBe(true);
    expect(FormulaError.is(evalRaw('=TEXTSPLIT("a",1/0)'))).toBe(true);
  });
  it('rejects bad arity for TEXTSPLIT / TEXTBEFORE', () => {
    expect(FormulaError.is(evalRaw('=TEXTSPLIT("a")'))).toBe(true);
    expect(FormulaError.is(evalRaw('=TEXTBEFORE("a")'))).toBe(true);
  });
  it('TEXTBEFORE / TEXTAFTER with instance', () => {
    expect(evalRaw('=TEXTBEFORE("a-b-c","-")')).toBe('a');
    expect(evalRaw('=TEXTAFTER("a-b-c","-")')).toBe('b-c');
    expect(evalRaw('=TEXTBEFORE("a-b-c","-",2)')).toBe('a-b');
    expect(evalRaw('=TEXTAFTER("a-b-c","-",2)')).toBe('c');
  });
  it('returns #N/A when the delimiter is absent or empty', () => {
    expect(FormulaError.is(evalRaw('=TEXTBEFORE("abc","-")'))).toBe(true);
    expect(FormulaError.is(evalRaw('=TEXTAFTER("abc","")'))).toBe(true);
  });
  it('propagates errors from the text, delimiter, and instance arguments', () => {
    expect(FormulaError.is(evalRaw('=TEXTBEFORE(1/0,"-")'))).toBe(true);
    expect(FormulaError.is(evalRaw('=TEXTBEFORE("a-b",1/0)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=TEXTAFTER("a-b","-",1/0)'))).toBe(true);
  });
});

describe('VSTACK / HSTACK', () => {
  it('stacks ranges vertically, padding short rows', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(0, 1), 2);
    e.setContent(A(1, 0), 3); // B2 empty
    expect(e.evaluateFormula('=VSTACK(A1:B1,A2:A2)')).toEqual([
      [1, 2],
      [3, null],
    ]);
  });
  it('stacks ranges horizontally, padding short columns', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(1, 0), 2);
    e.setContent(A(0, 1), 9);
    expect(e.evaluateFormula('=HSTACK(A1:A2,B1:B1)')).toEqual([
      [1, 9],
      [2, null],
    ]);
  });
  it('errors with no arguments', () => {
    expect(FormulaError.is(evalRaw('=VSTACK()'))).toBe(true);
    expect(FormulaError.is(evalRaw('=HSTACK()'))).toBe(true);
  });
});

describe('LET', () => {
  it('binds a single name and uses it', () => {
    expect(evalRaw('=LET(x,5,x+1)')).toBe(6);
  });
  it('binds multiple names, later seeing earlier ones', () => {
    expect(evalRaw('=LET(x,5,y,x*2,x+y)')).toBe(15);
  });
  it('rejects an even argument count and a non-name binding', () => {
    expect(FormulaError.is(evalRaw('=LET(x,5)'))).toBe(true);
    expect(FormulaError.is(evalRaw('=LET(1,5,x)'))).toBe(true);
  });

  it('falls through to the outer scope for a non-local name (#NAME?)', () => {
    const r = evalRaw('=LET(x,5,x+ZZZ)'); // ZZZ is not bound -> outer getName -> undefined
    expect(FormulaError.is(r) && r.type).toBe('#NAME?');
  });

  it('works when the eval context has no getName (direct evaluate)', () => {
    const ctx = { functions: createDefaultFunctions(), getCell: () => null };
    // Local name resolves; a non-local name yields #NAME? without an outer resolver.
    expect(evaluate(parseFormula('LET(x,5,x+1)'), ctx)).toBe(6);
    const r = evaluate(parseFormula('LET(x,5,x+y)'), ctx);
    expect(FormulaError.is(r) && r.type).toBe('#NAME?');
  });
});
