import { describe, it, expect } from 'vitest';
import { SheetEngine } from './engine.js';
import { FormulaError } from './errors.js';
import { NameRegistry } from './names.js';

const A = (row: number, col: number) => ({ row, col });

describe('named ranges in SheetEngine', () => {
  it('defines a range name usable in SUM', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(1, 0), 2);
    e.setContent(A(2, 0), 3);
    e.defineName('Sales', 'A1:A3');
    expect(e.evaluateFormula('=SUM(Sales)')).toBe(6);
  });

  it('defines a scalar literal name', () => {
    const e = new SheetEngine();
    e.defineName('TaxRate', '0.08');
    expect(e.evaluateFormula('=TaxRate*100')).toBeCloseTo(8);
  });

  it('defines an expression name referencing cells', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 21);
    e.defineName('Doubled', '=A1*2');
    expect(e.evaluateFormula('=Doubled+0')).toBe(42);
  });

  it('resolves names case-insensitively', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 5);
    e.setContent(A(1, 0), 5);
    e.defineName('Sales', 'A1:A2');
    expect(e.evaluateFormula('=SUM(sales)')).toBe(10);
    expect(e.evaluateFormula('=SUM(SALES)')).toBe(10);
    expect(e.evaluateFormula('=SUM(SaLeS)')).toBe(10);
  });

  it('lets a name reference another name', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 4);
    e.defineName('Base', '=A1');
    e.defineName('Quad', '=Base*4');
    expect(e.evaluateFormula('=Quad')).toBe(16);
  });

  it('redefines an existing name', () => {
    const e = new SheetEngine();
    e.defineName('K', '1');
    expect(e.evaluateFormula('=K')).toBe(1);
    e.defineName('K', '99');
    expect(e.evaluateFormula('=K')).toBe(99);
    expect(e.getNames()).toEqual(['K']);
  });

  it('removeName returns true for an existing name and false otherwise', () => {
    const e = new SheetEngine();
    e.defineName('Temp', '1');
    expect(e.removeName('temp')).toBe(true);
    expect(e.removeName('temp')).toBe(false);
    expect(e.evaluateFormula('=Temp')).toEqual(new FormulaError('#NAME?'));
  });

  it('lists defined names normalised to upper case', () => {
    const e = new SheetEngine();
    e.defineName('alpha', '1');
    e.defineName('Beta', '2');
    expect(e.getNames().sort()).toEqual(['ALPHA', 'BETA']);
  });

  it('yields #NAME? for an unknown name', () => {
    const e = new SheetEngine();
    const result = e.evaluateFormula('=Unknown');
    expect(FormulaError.is(result)).toBe(true);
    expect((result as FormulaError).type).toBe('#NAME?');
  });

  it('propagates an error from a name whose formula errors', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 0);
    e.defineName('Bad', '=1/A1');
    const result = e.evaluateFormula('=Bad+1');
    expect(FormulaError.is(result)).toBe(true);
    expect((result as FormulaError).type).toBe('#DIV/0!');
  });

  it('surfaces a parse error stored for a malformed name formula', () => {
    const e = new SheetEngine();
    e.defineName('Broken', '=1 +');
    const result = e.evaluateFormula('=Broken');
    expect(FormulaError.is(result)).toBe(true);
    expect((result as FormulaError).type).toBe('#ERROR!');
  });
});

describe('NameRegistry', () => {
  it('stores and looks up by upper-cased key', () => {
    const r = new NameRegistry();
    r.define('foo', '=1+1');
    expect(r.lookup('FOO')).not.toBeUndefined();
    expect(r.lookup('Foo')).toBe(r.lookup('foo'));
  });

  it('returns undefined for an unknown name', () => {
    const r = new NameRegistry();
    expect(r.lookup('missing')).toBeUndefined();
  });

  it('strips an optional leading = before parsing', () => {
    const r = new NameRegistry();
    r.define('withEq', '=2');
    r.define('noEq', '2');
    const withEq = r.lookup('WITHEQ');
    const noEq = r.lookup('NOEQ');
    expect(withEq).toEqual(noEq);
  });

  it('stores a FormulaError for an unparseable formula', () => {
    const r = new NameRegistry();
    r.define('bad', ')(');
    const entry = r.lookup('BAD');
    expect(FormulaError.is(entry)).toBe(true);
    expect((entry as FormulaError).type).toBe('#ERROR!');
  });

  it('remove returns true then false', () => {
    const r = new NameRegistry();
    r.define('x', '1');
    expect(r.remove('X')).toBe(true);
    expect(r.remove('X')).toBe(false);
  });

  it('lists normalised keys', () => {
    const r = new NameRegistry();
    r.define('a', '1');
    r.define('B', '2');
    expect(r.list().sort()).toEqual(['A', 'B']);
  });
});
