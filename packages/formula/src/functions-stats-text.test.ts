/**
 * Tests for the Phase 14 statistics, conditional-aggregation, and
 * text-formatting function additions. These cover every branch of the new
 * def(...) registrations appended to functions.ts.
 */

import { describe, it, expect } from 'vitest';
import { evalFormula } from './test-helpers.js';
import { FormulaError } from './errors.js';

const err = (type: string) => ({ type });

/** A row of numbers laid out as A1, B1, C1, ... for range tests. */
function row(values: readonly (number | string)[]): Record<string, number | string> {
  const cells: Record<string, number | string> = {};
  values.forEach((v, i) => {
    cells[`0,${i}`] = v;
  });
  return cells;
}

describe('statistics (Phase 14)', () => {
  it('MODE returns the most frequent value, ties to earliest', () => {
    expect(evalFormula('MODE(1,2,2,3,3)')).toBe(2);
    expect(evalFormula('MODE(5,5,5,1)')).toBe(5);
    // No repeats -> #N/A.
    expect(evalFormula('MODE(1,2,3)')).toMatchObject(err('#N/A'));
    // Empty (blank range) -> #N/A.
    expect(evalFormula('MODE(A1:A1)', {})).toMatchObject(err('#N/A'));
    // Error propagation.
    expect(evalFormula('MODE(1,1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('GEOMEAN computes the geometric mean', () => {
    expect(evalFormula('GEOMEAN(4,9)')).toBeCloseTo(6, 10);
    expect(evalFormula('GEOMEAN(2,8)')).toBeCloseTo(4, 10);
    // Non-positive -> #NUM!.
    expect(evalFormula('GEOMEAN(0,4)')).toMatchObject(err('#NUM!'));
    expect(evalFormula('GEOMEAN(-1,4)')).toMatchObject(err('#NUM!'));
    // Empty (blank range) -> #NUM!.
    expect(evalFormula('GEOMEAN(A1:A1)', {})).toMatchObject(err('#NUM!'));
    // Propagation.
    expect(evalFormula('GEOMEAN(1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('HARMEAN computes the harmonic mean', () => {
    expect(evalFormula('HARMEAN(1,4,4)')).toBeCloseTo(2, 10);
    // Non-positive -> #NUM!.
    expect(evalFormula('HARMEAN(0,4)')).toMatchObject(err('#NUM!'));
    expect(evalFormula('HARMEAN(-2,4)')).toMatchObject(err('#NUM!'));
    // Empty (blank range) -> #NUM!.
    expect(evalFormula('HARMEAN(A1:A1)', {})).toMatchObject(err('#NUM!'));
    // Propagation.
    expect(evalFormula('HARMEAN(1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('VARP / STDEVP compute population variance and stdev', () => {
    // Population variance of 1..5 = 2; stdev = sqrt(2).
    expect(evalFormula('VARP(1,2,3,4,5)')).toBeCloseTo(2, 10);
    expect(evalFormula('STDEVP(1,2,3,4,5)')).toBeCloseTo(Math.sqrt(2), 10);
    // Empty (blank range) -> #DIV/0!.
    expect(evalFormula('VARP(A1:A1)', {})).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('STDEVP(A1:A1)', {})).toMatchObject(err('#DIV/0!'));
    // Propagation.
    expect(evalFormula('VARP(1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('STDEVP(1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('SUMSQ sums the squares', () => {
    expect(evalFormula('SUMSQ(3,4)')).toBe(25);
    expect(evalFormula('SUMSQ()')).toBe(0);
    expect(evalFormula('SUMSQ(1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('PERCENTILE interpolates linearly', () => {
    const cells = row([1, 2, 3, 4]);
    expect(evalFormula('PERCENTILE(A1:D1,0)', cells)).toBe(1);
    expect(evalFormula('PERCENTILE(A1:D1,1)', cells)).toBe(4);
    // 0.5 -> midpoint of 1..4 = 2.5.
    expect(evalFormula('PERCENTILE(A1:D1,0.5)', cells)).toBeCloseTo(2.5, 10);
    // Interpolated quarter.
    expect(evalFormula('PERCENTILE(A1:D1,0.25)', cells)).toBeCloseTo(1.75, 10);
    // Out of [0,1] -> #NUM!.
    expect(evalFormula('PERCENTILE(A1:D1,-0.1)', cells)).toMatchObject(err('#NUM!'));
    expect(evalFormula('PERCENTILE(A1:D1,1.1)', cells)).toMatchObject(err('#NUM!'));
    // Empty range -> #NUM!.
    expect(evalFormula('PERCENTILE(A1:A1,0.5)', { '0,0': 'x' })).toMatchObject(err('#NUM!'));
    // Arity & propagation.
    expect(evalFormula('PERCENTILE(A1:D1)', cells)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('PERCENTILE(A1:D1,"z")', cells)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('PERCENTILE(A1:A1,0.5)', { '0,0': new FormulaError('#REF!') })).toMatchObject(
      err('#REF!'),
    );
  });

  it('QUARTILE maps q in 0..4 to percentiles', () => {
    const cells = row([1, 2, 3, 4]);
    expect(evalFormula('QUARTILE(A1:D1,0)', cells)).toBe(1);
    expect(evalFormula('QUARTILE(A1:D1,2)', cells)).toBeCloseTo(2.5, 10);
    expect(evalFormula('QUARTILE(A1:D1,4)', cells)).toBe(4);
    // Out of range -> #NUM!.
    expect(evalFormula('QUARTILE(A1:D1,5)', cells)).toMatchObject(err('#NUM!'));
    expect(evalFormula('QUARTILE(A1:D1,-1)', cells)).toMatchObject(err('#NUM!'));
    // Empty -> #NUM!.
    expect(evalFormula('QUARTILE(A1:A1,1)', { '0,0': 'x' })).toMatchObject(err('#NUM!'));
    // Arity & propagation.
    expect(evalFormula('QUARTILE(A1:D1)', cells)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('QUARTILE(A1:D1,"z")', cells)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('QUARTILE(A1:A1,1)', { '0,0': new FormulaError('#REF!') })).toMatchObject(
      err('#REF!'),
    );
  });

  it('AVERAGEA counts text as 0 and includes booleans', () => {
    // Direct args: 2, text "x"(0), TRUE(1) -> sum 3 over 3 -> 1.
    expect(evalFormula('AVERAGEA(2,"x",TRUE)')).toBeCloseTo(1, 10);
    expect(evalFormula('AVERAGEA(2,4)')).toBe(3);
    // FALSE contributes 0 to the boolean branch.
    expect(evalFormula('AVERAGEA(3,FALSE)')).toBeCloseTo(1.5, 10);
    // Range with text counts the text as 0.
    expect(evalFormula('AVERAGEA(A1:C1)', { '0,0': 4, '0,1': 'x', '0,2': 8 })).toBeCloseTo(4, 10);
    // Blanks skipped: range of a single blank -> #DIV/0!.
    expect(evalFormula('AVERAGEA(A1:A1)', {})).toMatchObject(err('#DIV/0!'));
    // Propagation.
    expect(evalFormula('AVERAGEA(1/0)')).toMatchObject(err('#DIV/0!'));
  });
});

describe('MAXIFS / MINIFS (Phase 14)', () => {
  const grid = {
    // values row 0, criteria row 1
    '0,0': 10,
    '0,1': 20,
    '0,2': 30,
    '1,0': 'a',
    '1,1': 'b',
    '1,2': 'a',
  };

  it('MAXIFS / MINIFS reuse the COUNTIF criterion predicate', () => {
    expect(evalFormula('MAXIFS(A1:C1,A2:C2,"a")', grid)).toBe(30);
    expect(evalFormula('MINIFS(A1:C1,A2:C2,"a")', grid)).toBe(10);
    // Numeric comparison criterion against the value range itself.
    expect(evalFormula('MAXIFS(A1:C1,A1:C1,">15")', grid)).toBe(30);
    expect(evalFormula('MINIFS(A1:C1,A1:C1,">15")', grid)).toBe(20);
    // No matches -> 0.
    expect(evalFormula('MAXIFS(A1:C1,A2:C2,"z")', grid)).toBe(0);
    expect(evalFormula('MINIFS(A1:C1,A2:C2,"z")', grid)).toBe(0);
  });

  it('MAXIFS / MINIFS skip non-numeric value cells', () => {
    const g = { '0,0': 'x', '0,1': 5, '1,0': 'a', '1,1': 'a' };
    expect(evalFormula('MAXIFS(A1:B1,A2:B2,"a")', g)).toBe(5);
  });

  it('MAXIFS / MINIFS validate arity, shape, and propagate', () => {
    // Wrong arity (even count / too few).
    expect(evalFormula('MAXIFS(A1:C1,A2:C2)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('MINIFS(A1:C1)', grid)).toMatchObject(err('#VALUE!'));
    // Mismatched value-range shape.
    expect(evalFormula('MAXIFS(A1:B1,A2:C2,"a")', grid)).toMatchObject(err('#VALUE!'));
    // Mismatched criteria-range shape (caught inside multiCriteria).
    expect(evalFormula('MAXIFS(A1:C1,A2:B2,"a")', grid)).toMatchObject(err('#VALUE!'));
    // Criterion error propagation.
    expect(evalFormula('MAXIFS(A1:C1,A2:C2,1/0)', grid)).toMatchObject(err('#DIV/0!'));
  });
});

describe('text formatting (Phase 14)', () => {
  it('REPLACE swaps a substring by position/length', () => {
    expect(evalFormula('REPLACE("abcdef",2,3,"XY")')).toBe('aXYef');
    // len 0 inserts without removing.
    expect(evalFormula('REPLACE("abc",2,0,"-")')).toBe('a-bc');
    // start past end appends.
    expect(evalFormula('REPLACE("abc",10,2,"Z")')).toBe('abcZ');
    // Invalid start / len -> #VALUE!.
    expect(evalFormula('REPLACE("abc",0,1,"x")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('REPLACE("abc",1,-1,"x")')).toMatchObject(err('#VALUE!'));
    // Arity & per-arg propagation.
    expect(evalFormula('REPLACE("abc",1,1)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('REPLACE(1/0,1,1,"x")')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('REPLACE("abc",1/0,1,"x")')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('REPLACE("abc",1,1/0,"x")')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('REPLACE("abc",1,1,1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('FIXED formats with thousands separators and decimals', () => {
    expect(evalFormula('FIXED(1234.567)')).toBe('1,234.57');
    expect(evalFormula('FIXED(1234.567,1)')).toBe('1,234.6');
    expect(evalFormula('FIXED(1234.567,1,TRUE)')).toBe('1234.6');
    // Zero decimals removes the fractional part.
    expect(evalFormula('FIXED(1234.5,0)')).toBe('1,235');
    // Negative decimals round left of the point.
    expect(evalFormula('FIXED(12345,-2)')).toBe('12,300');
    // Negative value keeps the sign outside the grouping.
    expect(evalFormula('FIXED(-1234.5,1)')).toBe('-1,234.5');
    // Arity & propagation.
    expect(evalFormula('FIXED()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('FIXED(1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('FIXED(1,1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('FIXED(1,1,"notbool")')).toMatchObject(err('#VALUE!'));
  });

  it('UNICHAR / UNICODE round-trip code points', () => {
    expect(evalFormula('UNICHAR(65)')).toBe('A');
    expect(evalFormula('UNICODE("A")')).toBe(65);
    // Astral plane round-trip.
    expect(evalFormula('UNICODE(UNICHAR(128512))')).toBe(128512);
    // UNICHAR domain: <1, >max, surrogate range -> #VALUE!.
    expect(evalFormula('UNICHAR(0)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('UNICHAR(1114112)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('UNICHAR(55296)')).toMatchObject(err('#VALUE!'));
    // UNICODE of empty -> #VALUE!.
    expect(evalFormula('UNICODE("")')).toMatchObject(err('#VALUE!'));
    // Arity & propagation.
    expect(evalFormula('UNICHAR()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('UNICODE()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('UNICHAR(1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('UNICODE(1/0)')).toMatchObject(err('#DIV/0!'));
  });
});
