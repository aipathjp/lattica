import { describe, it, expect } from 'vitest';
import { SheetEngine } from './engine.js';
import { FormulaError } from './errors.js';
import type { FunctionImpl } from './evaluator.js';

const A = (row: number, col: number) => ({ row, col });

describe('literals', () => {
  it('stores and reads literal values', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 42);
    e.setContent(A(0, 1), 'hello');
    e.setContent(A(0, 2), true);
    expect(e.getValue(A(0, 0))).toBe(42);
    expect(e.getValue(A(0, 1))).toBe('hello');
    expect(e.getValue(A(0, 2))).toBe(true);
    expect(e.size).toBe(3);
  });

  it('clears a cell set to null', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(0, 0), null);
    expect(e.getValue(A(0, 0))).toBeNull();
    expect(e.size).toBe(0);
  });

  it('returns null for an unset cell', () => {
    expect(new SheetEngine().getValue(A(5, 5))).toBeNull();
  });
});

describe('formulas', () => {
  it('computes a formula referencing literals', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 10);
    e.setContent(A(0, 1), 20);
    e.setContent(A(0, 2), '=A1+B1');
    expect(e.getValue(A(0, 2))).toBe(30);
  });

  it('recomputes dependents when a precedent changes', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(0, 1), '=A1*2');
    e.setContent(A(0, 2), '=B1+1');
    expect(e.getValue(A(0, 2))).toBe(3);
    const changed = e.setContent(A(0, 0), 10);
    expect(e.getValue(A(0, 1))).toBe(20);
    expect(e.getValue(A(0, 2))).toBe(21);
    // The seed and both dependents changed.
    expect(changed.has('0,0')).toBe(true);
    expect(changed.has('0,1')).toBe(true);
    expect(changed.has('0,2')).toBe(true);
  });

  it('supports a chain of dependencies in topological order', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 2);
    e.setContent(A(1, 0), '=A1+1'); // A2 = 3
    e.setContent(A(2, 0), '=A2*A2'); // A3 = 9
    e.setContent(A(3, 0), '=A3-A1'); // A4 = 7
    expect(e.getValue(A(3, 0))).toBe(7);
    e.setContent(A(0, 0), 3);
    expect(e.getValue(A(1, 0))).toBe(4);
    expect(e.getValue(A(2, 0))).toBe(16);
    expect(e.getValue(A(3, 0))).toBe(13);
  });

  it('aggregates over a range that updates incrementally', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(1, 0), 2);
    e.setContent(A(2, 0), 3);
    e.setContent(A(3, 0), '=SUM(A1:A3)');
    expect(e.getValue(A(3, 0))).toBe(6);
    e.setContent(A(1, 0), 20);
    expect(e.getValue(A(3, 0))).toBe(24);
  });
});

describe('circular references', () => {
  it('marks a direct cycle as #CYCLE!', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=B1');
    e.setContent(A(0, 1), '=A1');
    expect(e.getValue(A(0, 0))).toMatchObject({ type: '#CYCLE!' });
    expect(e.getValue(A(0, 1))).toMatchObject({ type: '#CYCLE!' });
  });

  it('marks a self-reference as #CYCLE!', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=A1+1');
    expect(e.getValue(A(0, 0))).toMatchObject({ type: '#CYCLE!' });
  });

  it('recovers when the cycle is broken', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=B1');
    e.setContent(A(0, 1), '=A1');
    e.setContent(A(0, 1), 5);
    expect(e.getValue(A(0, 0))).toBe(5);
    expect(e.getValue(A(0, 1))).toBe(5);
  });

  it('leaves an already-#CYCLE! cell unchanged on re-evaluation', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=B1');
    e.setContent(A(0, 1), '=A1');
    // Re-assert the cycle; A1 is already #CYCLE! and stays so.
    e.setContent(A(0, 0), '=B1+0');
    expect(e.getValue(A(0, 0))).toMatchObject({ type: '#CYCLE!' });
  });
});

describe('content round-trip', () => {
  it('returns formula source with leading =', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=1+2');
    expect(e.getContent(A(0, 0))).toBe('=1+2');
    expect(e.getValue(A(0, 0))).toBe(3);
  });
  it('returns literal content unchanged', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 7);
    expect(e.getContent(A(0, 0))).toBe(7);
    expect(e.getContent(A(9, 9))).toBeNull();
  });
  it('treats a bare = or short string as a literal', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=');
    expect(e.getValue(A(0, 0))).toBe('=');
  });
});

describe('parse errors', () => {
  it('stores #ERROR! for an unparseable formula', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), '=1+');
    const v = e.getValue(A(0, 0));
    expect(FormulaError.is(v) && v.type).toBe('#ERROR!');
  });
  it('recomputes dependents of a now-broken formula', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 5);
    e.setContent(A(0, 1), '=A1');
    e.setContent(A(0, 1), '=@@@');
    const v = e.getValue(A(0, 1));
    expect(FormulaError.is(v)).toBe(true);
  });
});

describe('evaluateFormula (one-off)', () => {
  it('evaluates without storing', () => {
    const e = new SheetEngine();
    expect(e.evaluateFormula('=2*21')).toBe(42);
    expect(e.evaluateFormula('SUM(1,2,3)')).toBe(6);
    expect(e.size).toBe(0);
  });
  it('returns #ERROR! for invalid syntax (parse and lex)', () => {
    const e = new SheetEngine();
    expect(e.evaluateFormula('=1+')).toMatchObject({ type: '#ERROR!' });
    expect(e.evaluateFormula('=@')).toMatchObject({ type: '#ERROR!' });
  });
});

describe('value-equality short-circuiting', () => {
  it('reports no change when a dependent re-evaluates to the same value', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(0, 1), '=A1>0'); // TRUE
    const changed = e.setContent(A(0, 0), 2); // A1 changes, B1 stays TRUE
    expect(e.getValue(A(0, 1))).toBe(true);
    expect(changed.has('0,1')).toBe(false);
  });

  it('detects a change from an error value to a number', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 0);
    e.setContent(A(0, 1), '=10/A1'); // #DIV/0!
    expect(e.getValue(A(0, 1))).toMatchObject({ type: '#DIV/0!' });
    const changed = e.setContent(A(0, 0), 2); // now 5
    expect(e.getValue(A(0, 1))).toBe(5);
    expect(changed.has('0,1')).toBe(true);
  });
});

describe('custom function registry', () => {
  it('uses an injected registry', () => {
    const functions = new Map<string, FunctionImpl>([
      ['DOUBLE', (args, evaluate) => (evaluate(args[0]!) as number) * 2],
    ]);
    const e = new SheetEngine({ functions });
    e.setContent(A(0, 0), '=DOUBLE(21)');
    expect(e.getValue(A(0, 0))).toBe(42);
  });
});
