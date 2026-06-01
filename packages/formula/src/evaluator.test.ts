import { describe, it, expect } from 'vitest';
import { evalFormula } from './test-helpers.js';
import { scalarize } from './evaluator.js';
import { FormulaError } from './errors.js';

describe('arithmetic', () => {
  it('evaluates the four operations', () => {
    expect(evalFormula('1+2')).toBe(3);
    expect(evalFormula('5-3')).toBe(2);
    expect(evalFormula('4*3')).toBe(12);
    expect(evalFormula('10/4')).toBe(2.5);
  });
  it('handles exponent and percent', () => {
    expect(evalFormula('2^10')).toBe(1024);
    expect(evalFormula('50%')).toBe(0.5);
  });
  it('returns #DIV/0! on division by zero', () => {
    expect(evalFormula('1/0')).toMatchObject({ type: '#DIV/0!' });
  });
  it('returns #NUM! when exponent overflows or is invalid', () => {
    expect(evalFormula('(-1)^0.5')).toMatchObject({ type: '#NUM!' });
  });
  it('evaluates unary minus and plus', () => {
    expect(evalFormula('-5')).toBe(-5);
    expect(evalFormula('+5')).toBe(5);
    expect(evalFormula('--5')).toBe(5);
  });
});

describe('concatenation and comparison', () => {
  it('concatenates with &', () => {
    expect(evalFormula('"a"&"b"')).toBe('ab');
    expect(evalFormula('1&2')).toBe('12');
  });
  it('compares values', () => {
    expect(evalFormula('1<2')).toBe(true);
    expect(evalFormula('2<=2')).toBe(true);
    expect(evalFormula('3<>3')).toBe(false);
    expect(evalFormula('"a"="A"')).toBe(true);
    expect(evalFormula('5>10')).toBe(false);
    expect(evalFormula('5>=5')).toBe(true);
  });
});

describe('error propagation', () => {
  it('propagates errors through arithmetic', () => {
    expect(evalFormula('1/0+1')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('1+1/0')).toMatchObject({ type: '#DIV/0!' });
  });
  it('propagates errors through unary', () => {
    expect(evalFormula('-(1/0)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('coerces non-numeric text to #VALUE! in arithmetic', () => {
    expect(evalFormula('"x"+1')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('1+"x"')).toMatchObject({ type: '#VALUE!' });
  });
  it('parses and surfaces error literals', () => {
    expect(evalFormula('#N/A')).toMatchObject({ type: '#N/A' });
    expect(evalFormula('#REF!')).toMatchObject({ type: '#REF!' });
  });
});

describe('references and ranges', () => {
  it('reads cell values', () => {
    expect(evalFormula('A1+B1', { '0,0': 10, '0,1': 5 })).toBe(15);
  });
  it('treats empty cells as zero', () => {
    expect(evalFormula('A1+1', {})).toBe(1);
  });
  it('reduces a range to its top-left when scalarized', () => {
    expect(evalFormula('A1:B2+0', { '0,0': 7 })).toBe(7);
  });
  it('propagates an error stored in a referenced cell', () => {
    expect(evalFormula('A1+1', { '0,0': new FormulaError('#REF!') })).toMatchObject({
      type: '#REF!',
    });
  });
});

describe('named values', () => {
  it('resolves a defined name', () => {
    expect(evalFormula('tax*100', {}, { tax: 0.08 })).toBeCloseTo(8);
  });
  it('returns #NAME? for an unknown name', () => {
    expect(evalFormula('mystery+1')).toMatchObject({ type: '#NAME?' });
  });
});

describe('unknown function', () => {
  it('returns #NAME? for an unregistered function', () => {
    expect(evalFormula('FROBNICATE(1)')).toMatchObject({ type: '#NAME?' });
  });
});

describe('scalarize', () => {
  it('returns scalars unchanged', () => {
    expect(scalarize(5)).toBe(5);
  });
  it('takes the top-left of a matrix', () => {
    expect(scalarize([[1, 2], [3, 4]])).toBe(1);
  });
  it('returns null for an empty matrix', () => {
    expect(scalarize([])).toBeNull();
    expect(scalarize([[]])).toBeNull();
  });
});
