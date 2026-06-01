import { describe, it, expect } from 'vitest';
import { extractReferences } from './references.js';
import { parseFormula } from './parser.js';

const refs = (formula: string, opts?: { maxRangeCells?: number }) =>
  [...extractReferences(parseFormula(formula), opts)].sort();

describe('extractReferences', () => {
  it('collects single references', () => {
    expect(refs('A1+B2')).toEqual(['0,0', '1,1']);
  });

  it('expands ranges into individual cells', () => {
    expect(refs('SUM(A1:B2)')).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('deduplicates repeated references', () => {
    expect(refs('A1+A1')).toEqual(['0,0']);
  });

  it('walks nested calls, unary, and binary nodes', () => {
    expect(refs('IF(-A1>0,SUM(B1:B2),C1)')).toEqual(['0,0', '0,1', '0,2', '1,1']);
  });

  it('returns nothing for literal-only formulas', () => {
    expect(refs('1+2*3')).toEqual([]);
  });

  it('skips ranges that exceed maxRangeCells', () => {
    // A1:B2 is 4 cells; cap at 3 -> skipped entirely.
    expect(refs('SUM(A1:B2)', { maxRangeCells: 3 })).toEqual([]);
  });
});
