import { describe, it, expect } from 'vitest';
import { FormulaError, errorFromText, DIV0, ERROR_TYPES } from './errors.js';

describe('FormulaError', () => {
  it('stringifies to its type', () => {
    expect(String(DIV0)).toBe('#DIV/0!');
    expect(new FormulaError('#REF!').toString()).toBe('#REF!');
  });
  it('carries an optional message', () => {
    const e = new FormulaError('#ERROR!', 'bad');
    expect(e.message).toBe('bad');
  });
  it('type-guards values', () => {
    expect(FormulaError.is(DIV0)).toBe(true);
    expect(FormulaError.is(5)).toBe(false);
    expect(FormulaError.is(null)).toBe(false);
  });
});

describe('errorFromText', () => {
  it('maps known error text', () => {
    expect(errorFromText('#DIV/0!')?.type).toBe('#DIV/0!');
    expect(errorFromText('#n/a')?.type).toBe('#N/A');
  });
  it('returns null for unknown text', () => {
    expect(errorFromText('#WAT!')).toBeNull();
  });
  it('covers every declared error type', () => {
    for (const t of ERROR_TYPES) {
      expect(errorFromText(t)?.type).toBe(t);
    }
  });
});
