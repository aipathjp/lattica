import { describe, it, expect } from 'vitest';
import { expandStructuredRefs } from './structured-refs.js';
import { SheetEngine } from './engine.js';
import { FormulaError } from './errors.js';

const A = (row: number, col: number) => ({ row, col });

describe('expandStructuredRefs (pure)', () => {
  const resolve = (t: string, c: string) => (t === 'Sales' && c === 'Amount' ? 'B2:B4' : null);

  it('expands a plain column reference', () => {
    expect(expandStructuredRefs('SUM(Sales[Amount])', resolve)).toBe('SUM(B2:B4)');
  });

  it('expands the [[Column]] and [@Column] forms', () => {
    expect(expandStructuredRefs('Sales[[Amount]]', resolve)).toBe('B2:B4');
    expect(expandStructuredRefs('Sales[@Amount]', resolve)).toBe('B2:B4');
    expect(expandStructuredRefs('Sales[@[Amount]]', resolve)).toBe('B2:B4');
  });

  it('expands unknown tables/columns and special items to #REF!', () => {
    expect(expandStructuredRefs('Sales[Missing]', resolve)).toBe('#REF!');
    expect(expandStructuredRefs('Other[Amount]', resolve)).toBe('#REF!');
    expect(expandStructuredRefs('Sales[#Headers]', resolve)).toBe('#REF!');
    expect(expandStructuredRefs('Sales[]', resolve)).toBe('#REF!');
  });

  it('leaves a formula without structured refs unchanged', () => {
    expect(expandStructuredRefs('SUM(A1:A10)+1', resolve)).toBe('SUM(A1:A10)+1');
  });
});

describe('SheetEngine structured references', () => {
  /** Seed a 2-column table at A1 (headers) with 3 data rows. */
  function seedTable(e: SheetEngine): void {
    e.setContent(A(0, 0), 'Item');
    e.setContent(A(0, 1), 'Amount');
    e.setContent(A(1, 0), 'a');
    e.setContent(A(1, 1), 10);
    e.setContent(A(2, 0), 'b');
    e.setContent(A(2, 1), 20);
    e.setContent(A(3, 0), 'c');
    e.setContent(A(3, 1), 30);
    // Data starts at row index 1 (B2), 3 rows, columns Item/Amount at col 0/1.
    e.defineTable('Sales', { row: 1, col: 0, rowCount: 3, headers: ['Item', 'Amount'] });
  }

  it('uses a table column in a formula and recalculates on edits', () => {
    const e = new SheetEngine();
    seedTable(e);
    e.setContent(A(0, 3), '=SUM(Sales[Amount])');
    expect(e.getValue(A(0, 3))).toBe(60);
    // The structured ref expanded to a real range, so dependency tracking works.
    e.setContent(A(2, 1), 200); // change B3 (was 20)
    expect(e.getValue(A(0, 3))).toBe(240);
  });

  it('round-trips the original structured-ref source', () => {
    const e = new SheetEngine();
    seedTable(e);
    e.setContent(A(0, 3), '=AVERAGE(Sales[Amount])');
    expect(e.getValue(A(0, 3))).toBe(20);
    expect(e.getContent(A(0, 3))).toBe('=AVERAGE(Sales[Amount])');
  });

  it('an unknown table/column yields #REF!', () => {
    const e = new SheetEngine();
    seedTable(e);
    expect(FormulaError.is(e.evaluateFormula('=SUM(Sales[Nope])'))).toBe(true);
    expect(FormulaError.is(e.evaluateFormula('=SUM(Ghost[Amount])'))).toBe(true);
  });

  it('lists and removes tables; removed tables no longer resolve', () => {
    const e = new SheetEngine();
    seedTable(e);
    expect(e.getTables()).toContain('SALES');
    expect(e.removeTable('Sales')).toBe(true);
    expect(e.removeTable('Sales')).toBe(false);
    expect(FormulaError.is(e.evaluateFormula('=SUM(Sales[Amount])'))).toBe(true);
  });

  it('treats a zero-row table column as #REF!', () => {
    const e = new SheetEngine();
    e.defineTable('Empty', { row: 0, col: 0, rowCount: 0, headers: ['X'] });
    expect(FormulaError.is(e.evaluateFormula('=SUM(Empty[X])'))).toBe(true);
  });
});
