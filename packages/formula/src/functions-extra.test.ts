/**
 * Tests for the Phase 12 function library expansion (lookup/ref, math,
 * statistics, text). Covers every new function plus every error/edge branch
 * for 100% coverage. Existing tests are untouched.
 */

import { describe, it, expect } from 'vitest';
import { evalFormula } from './test-helpers.js';
import { FormulaError } from './errors.js';

/** Stand-in error cell used to exercise error-skipping range branches. */
class FakeErr extends FormulaError {
  constructor() {
    super('#VALUE!');
  }
}

// A small grid used across lookup/aggregation tests.
//   col 0   col 1   col 2
//   1       "a"     10
//   2       "b"     20
//   3       "c"     30
const grid = {
  '0,0': 1,
  '1,0': 2,
  '2,0': 3,
  '0,1': 'a',
  '1,1': 'b',
  '2,1': 'c',
  '0,2': 10,
  '1,2': 20,
  '2,2': 30,
} as const;

const err = (type: string) => ({ type });

describe('lookup / reference', () => {
  it('IFS picks the first true branch', () => {
    expect(evalFormula('IFS(FALSE,1,TRUE,2)')).toBe(2);
    expect(evalFormula('IFS(TRUE,"x",TRUE,"y")')).toBe('x');
  });
  it('IFS returns #N/A when nothing matches', () => {
    expect(evalFormula('IFS(FALSE,1,FALSE,2)')).toMatchObject(err('#N/A'));
  });
  it('IFS arity / parity errors', () => {
    expect(evalFormula('IFS(TRUE)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('IFS(TRUE,1,FALSE)')).toMatchObject(err('#VALUE!'));
  });
  it('IFS propagates a condition error', () => {
    expect(evalFormula('IFS(1/0,1,TRUE,2)')).toMatchObject(err('#DIV/0!'));
  });

  it('SWITCH matches a case', () => {
    expect(evalFormula('SWITCH(2,1,"one",2,"two")')).toBe('two');
  });
  it('SWITCH uses the trailing default', () => {
    expect(evalFormula('SWITCH(9,1,"one",2,"two","def")')).toBe('def');
  });
  it('SWITCH with no match and no default is #N/A', () => {
    expect(evalFormula('SWITCH(9,1,"one",2,"two")')).toMatchObject(err('#N/A'));
  });
  it('SWITCH arity error', () => {
    expect(evalFormula('SWITCH(1,2)')).toMatchObject(err('#VALUE!'));
  });
  it('SWITCH propagates target / candidate errors', () => {
    expect(evalFormula('SWITCH(1/0,1,"a")')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('SWITCH(1,1/0,"a")')).toMatchObject(err('#DIV/0!'));
  });

  it('CHOOSE selects the indexed value', () => {
    expect(evalFormula('CHOOSE(2,"a","b","c")')).toBe('b');
  });
  it('CHOOSE arity / range / error', () => {
    expect(evalFormula('CHOOSE(1)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CHOOSE(0,"a")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CHOOSE(3,"a")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CHOOSE(1/0,"a")')).toMatchObject(err('#DIV/0!'));
  });

  it('INDEX 3-arg form', () => {
    expect(evalFormula('INDEX(A1:C3,2,3)', grid)).toBe(20);
  });
  it('INDEX 2-arg on a column range indexes rows', () => {
    expect(evalFormula('INDEX(A1:A3,3)', grid)).toBe(3);
  });
  it('INDEX 2-arg on a single-row range indexes columns', () => {
    expect(evalFormula('INDEX(A1:C1,3)', grid)).toBe(10);
  });
  it('INDEX out of range -> #REF!', () => {
    expect(evalFormula('INDEX(A1:C3,4,1)', grid)).toMatchObject(err('#REF!'));
    expect(evalFormula('INDEX(A1:C3,1,4)', grid)).toMatchObject(err('#REF!'));
    expect(evalFormula('INDEX(A1:C3,0,1)', grid)).toMatchObject(err('#REF!'));
  });
  it('INDEX arity / numeric errors', () => {
    expect(evalFormula('INDEX(A1:C3)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('INDEX(A1:C3,"x",1)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('INDEX(A1:C3,1,"x")', grid)).toMatchObject(err('#VALUE!'));
  });
  it('INDEX on a scalar arg works as a 1x1 grid', () => {
    expect(evalFormula('INDEX(5,1,1)')).toBe(5);
  });

  it('MATCH exact', () => {
    expect(evalFormula('MATCH("b",A1:A3,0)', { '0,0': 'a', '1,0': 'b', '2,0': 'c' })).toBe(2);
  });
  it('MATCH exact not found -> #N/A', () => {
    expect(evalFormula('MATCH("z",A1:A3,0)', { '0,0': 'a', '1,0': 'b', '2,0': 'c' })).toMatchObject(
      err('#N/A'),
    );
  });
  it('MATCH approximate ascending (default type 1)', () => {
    expect(evalFormula('MATCH(25,A1:A3)', grid)).toBe(3); // 1,2,3 -> largest <=25 is 3rd
    expect(evalFormula('MATCH(2,A1:A3)', { '0,0': 1, '1,0': 2, '2,0': 3 })).toBe(2);
  });
  it('MATCH approximate not found -> #N/A', () => {
    expect(evalFormula('MATCH(0,A1:A3)', { '0,0': 1, '1,0': 2, '2,0': 3 })).toMatchObject(
      err('#N/A'),
    );
  });
  it('MATCH descending type -1', () => {
    expect(evalFormula('MATCH(2,A1:A3,-1)', { '0,0': 3, '1,0': 2, '2,0': 1 })).toBe(2);
  });
  it('MATCH skips error cells (exact and approximate)', () => {
    expect(evalFormula('MATCH("b",A1:A2,0)', { '0,0': new FakeErr(), '1,0': 'b' })).toBe(2);
    expect(evalFormula('MATCH(5,A1:A2)', { '0,0': new FakeErr(), '1,0': 3 })).toBe(2);
  });
  it('MATCH lookup / type errors and arity', () => {
    expect(evalFormula('MATCH(A1)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('MATCH(1/0,A1:A3,0)', grid)).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('MATCH(1,A1:A3,"x")', grid)).toMatchObject(err('#VALUE!'));
  });

  it('VLOOKUP exact and approximate', () => {
    expect(evalFormula('VLOOKUP(2,A1:C3,3,FALSE)', grid)).toBe(20);
    expect(evalFormula('VLOOKUP(2,A1:C3,2)', grid)).toBe('b');
  });
  it('VLOOKUP not found -> #N/A', () => {
    expect(evalFormula('VLOOKUP(99,A1:C3,2,FALSE)', grid)).toMatchObject(err('#N/A'));
  });
  it('VLOOKUP column out of range -> #REF!', () => {
    expect(evalFormula('VLOOKUP(2,A1:C3,9)', grid)).toMatchObject(err('#REF!'));
  });
  it('VLOOKUP arity / index / error branches', () => {
    expect(evalFormula('VLOOKUP(2,A1:C3)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('VLOOKUP(2,A1:C3,0)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('VLOOKUP(1/0,A1:C3,2)', grid)).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('VLOOKUP(2,A1:C3,"x")', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('VLOOKUP(2,A1:C3,2,1/0)', grid)).toMatchObject(err('#DIV/0!'));
  });

  it('HLOOKUP exact and approximate', () => {
    const h = { '0,0': 1, '0,1': 2, '0,2': 3, '1,0': 'x', '1,1': 'y', '1,2': 'z' };
    expect(evalFormula('HLOOKUP(2,A1:C2,2,FALSE)', h)).toBe('y');
    expect(evalFormula('HLOOKUP(2,A1:C2,2)', h)).toBe('y');
  });
  it('HLOOKUP not found / row out of range', () => {
    const h = { '0,0': 1, '0,1': 2, '0,2': 3, '1,0': 'x', '1,1': 'y', '1,2': 'z' };
    expect(evalFormula('HLOOKUP(99,A1:C2,2,FALSE)', h)).toMatchObject(err('#N/A'));
    expect(evalFormula('HLOOKUP(2,A1:C2,9)', h)).toMatchObject(err('#REF!'));
  });
});

describe('math', () => {
  it('SUMPRODUCT multiplies and sums', () => {
    const m = { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 4, '1,1': 5, '2,1': 6 };
    expect(evalFormula('SUMPRODUCT(A1:A3,B1:B3)', m)).toBe(1 * 4 + 2 * 5 + 3 * 6);
  });
  it('SUMPRODUCT single range = SUM', () => {
    expect(evalFormula('SUMPRODUCT(A1:A3)', { '0,0': 1, '1,0': 2, '2,0': 3 })).toBe(6);
  });
  it('SUMPRODUCT treats text/bool as 0/1', () => {
    expect(evalFormula('SUMPRODUCT(A1:A3)', { '0,0': true, '1,0': false, '2,0': 'x' })).toBe(1);
  });
  it('SUMPRODUCT arity / mismatch / error', () => {
    expect(evalFormula('SUMPRODUCT()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SUMPRODUCT(A1:A3,B1:B2)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SUMPRODUCT(A1:A2)', { '0,0': new FakeErr() })).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SUMPRODUCT(1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('GCD / LCM', () => {
    expect(evalFormula('GCD(24,36)')).toBe(12);
    expect(evalFormula('LCM(4,6)')).toBe(12);
    expect(evalFormula('GCD(0,0)')).toBe(0);
    expect(evalFormula('LCM(0,5)')).toBe(0);
  });
  it('GCD / LCM errors', () => {
    expect(evalFormula('GCD()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('LCM()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('GCD(-1)')).toMatchObject(err('#NUM!'));
    expect(evalFormula('LCM(-1)')).toMatchObject(err('#NUM!'));
    expect(evalFormula('GCD("x")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('LCM("x")')).toMatchObject(err('#VALUE!'));
  });

  it('FACT', () => {
    expect(evalFormula('FACT(5)')).toBe(120);
    expect(evalFormula('FACT(0)')).toBe(1);
    expect(evalFormula('FACT(-1)')).toMatchObject(err('#NUM!'));
    expect(evalFormula('FACT()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('FACT("x")')).toMatchObject(err('#VALUE!'));
  });

  it('COMBIN', () => {
    expect(evalFormula('COMBIN(5,2)')).toBe(10);
    expect(evalFormula('COMBIN(5,0)')).toBe(1);
    expect(evalFormula('COMBIN(5,6)')).toMatchObject(err('#NUM!'));
    expect(evalFormula('COMBIN(5)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('COMBIN("x",1)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('COMBIN(5,"x")')).toMatchObject(err('#VALUE!'));
  });

  it('QUOTIENT', () => {
    expect(evalFormula('QUOTIENT(7,2)')).toBe(3);
    expect(evalFormula('QUOTIENT(-7,2)')).toBe(-3);
    expect(evalFormula('QUOTIENT(5,0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('QUOTIENT(5)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('QUOTIENT("x",1)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('QUOTIENT(5,"x")')).toMatchObject(err('#VALUE!'));
  });

  it('trig + constants', () => {
    expect(evalFormula('PI()')).toBeCloseTo(Math.PI);
    expect(evalFormula('PI(1)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('RADIANS(180)')).toBeCloseTo(Math.PI);
    expect(evalFormula('DEGREES(PI())')).toBeCloseTo(180);
    expect(evalFormula('SIN(0)')).toBe(0);
    expect(evalFormula('COS(0)')).toBe(1);
    expect(evalFormula('TAN(0)')).toBe(0);
    expect(evalFormula('ATAN(0)')).toBe(0);
    expect(evalFormula('SIN("x")')).toMatchObject(err('#VALUE!'));
  });

  it('ATAN2', () => {
    expect(evalFormula('ATAN2(1,1)')).toBeCloseTo(Math.PI / 4);
    expect(evalFormula('ATAN2(0,0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('ATAN2(1)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('ATAN2("x",1)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('ATAN2(1,"x")')).toMatchObject(err('#VALUE!'));
  });
});

describe('statistics', () => {
  const nums = { '0,0': 2, '1,0': 4, '2,0': 4, '3,0': 4, '4,0': 5, '5,0': 5, '6,0': 7, '7,0': 9 };
  it('STDEV / VAR (sample)', () => {
    expect(evalFormula('VAR(A1:A8)', nums)).toBeCloseTo(32 / 7);
    expect(evalFormula('STDEV(A1:A8)', nums)).toBeCloseTo(Math.sqrt(32 / 7));
  });
  it('STDEV / VAR need >=2 numbers', () => {
    expect(evalFormula('VAR(A1:A1)', { '0,0': 1 })).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('STDEV(A1:A1)', { '0,0': 1 })).toMatchObject(err('#DIV/0!'));
  });
  it('STDEV propagates error', () => {
    expect(evalFormula('STDEV(1/0,2)')).toMatchObject(err('#DIV/0!'));
  });

  it('LARGE / SMALL', () => {
    expect(evalFormula('LARGE(A1:A3,1)', { '0,0': 3, '1,0': 1, '2,0': 2 })).toBe(3);
    expect(evalFormula('SMALL(A1:A3,1)', { '0,0': 3, '1,0': 1, '2,0': 2 })).toBe(1);
  });
  it('LARGE / SMALL errors', () => {
    expect(evalFormula('LARGE(A1:A3,0)', { '0,0': 1, '1,0': 2, '2,0': 3 })).toMatchObject(
      err('#NUM!'),
    );
    expect(evalFormula('SMALL(A1:A3,9)', { '0,0': 1, '1,0': 2, '2,0': 3 })).toMatchObject(
      err('#NUM!'),
    );
    expect(evalFormula('LARGE(A1:A3)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('LARGE(A1:A3,"x")', { '0,0': 1 })).toMatchObject(err('#VALUE!'));
    expect(evalFormula('LARGE(1/0,1)')).toMatchObject(err('#DIV/0!'));
  });

  it('RANK descending and ascending', () => {
    const r = { '0,0': 10, '1,0': 20, '2,0': 30 };
    expect(evalFormula('RANK(20,A1:A3)', r)).toBe(2); // default desc: 30,20,10
    expect(evalFormula('RANK(20,A1:A3,1)', r)).toBe(2); // asc: 10,20,30
    expect(evalFormula('RANK(30,A1:A3,1)', r)).toBe(3);
  });
  it('RANK not present -> #N/A', () => {
    expect(evalFormula('RANK(99,A1:A3)', { '0,0': 1, '1,0': 2, '2,0': 3 })).toMatchObject(
      err('#N/A'),
    );
  });
  it('RANK errors', () => {
    expect(evalFormula('RANK(1)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('RANK("x",A1:A3)', { '0,0': 1 })).toMatchObject(err('#VALUE!'));
    expect(evalFormula('RANK(1,1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('RANK(1,A1:A3,"x")', { '0,0': 1 })).toMatchObject(err('#VALUE!'));
  });

  it('COUNTIFS multiple criteria', () => {
    const m = { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 'x', '1,1': 'x', '2,1': 'y' };
    expect(evalFormula('COUNTIFS(A1:A3,">1",B1:B3,"x")', m)).toBe(1);
  });
  it('COUNTIFS arity / mismatch / error', () => {
    expect(evalFormula('COUNTIFS(A1:A3)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('COUNTIFS(A1:A3,">1",B1:B2,"x")', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('COUNTIFS(A1:A3,1/0)', grid)).toMatchObject(err('#DIV/0!'));
  });

  it('SUMIFS sums where criteria match', () => {
    const m = { '0,0': 10, '1,0': 20, '2,0': 30, '0,1': 'x', '1,1': 'x', '2,1': 'y' };
    expect(evalFormula('SUMIFS(A1:A3,B1:B3,"x")', m)).toBe(30);
  });
  it('SUMIFS arity / mismatched sum range / criteria mismatch / error', () => {
    expect(evalFormula('SUMIFS(A1:A3)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SUMIFS(A1:A3,B1:B3)', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SUMIFS(A1:A2,B1:B3,"x")', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SUMIFS(A1:A3,B1:B2,"x")', grid)).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SUMIFS(A1:A3,B1:B3,1/0)', grid)).toMatchObject(err('#DIV/0!'));
  });
  it('SUMIFS skips error cells in sum range', () => {
    const m = { '0,0': 5, '1,0': new FakeErr(), '0,1': 'x', '1,1': 'x' };
    expect(evalFormula('SUMIFS(A1:A2,B1:B2,"x")', m)).toBe(5);
  });

  it('AVERAGEIF self-range and separate avg range', () => {
    const m = { '0,0': 1, '1,0': 5, '2,0': 9 };
    expect(evalFormula('AVERAGEIF(A1:A3,">2")', m)).toBe(7);
    const m2 = { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 10, '1,1': 20, '2,1': 30 };
    expect(evalFormula('AVERAGEIF(A1:A3,">1",B1:B3)', m2)).toBe(25);
  });
  it('AVERAGEIF no matches / error / arity', () => {
    expect(evalFormula('AVERAGEIF(A1:A3,">99")', { '0,0': 1, '1,0': 2, '2,0': 3 })).toMatchObject(
      err('#DIV/0!'),
    );
    expect(evalFormula('AVERAGEIF(A1:A3,1/0)', grid)).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('AVERAGEIF(A1:A3)', grid)).toMatchObject(err('#VALUE!'));
  });
  it('AVERAGEIF skips error cells in the criteria range', () => {
    const m = { '0,0': new FakeErr(), '1,0': 5, '2,0': 9 };
    expect(evalFormula('AVERAGEIF(A1:A3,">2")', m)).toBe(7);
  });
  it('AVERAGEIF tolerates a shorter avg range (missing cells skipped)', () => {
    // criteria range A1:A3 matches all rows, but the avg range B1:B2 has no
    // third row, so that match contributes nothing.
    const m = { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 10, '1,1': 20 };
    expect(evalFormula('AVERAGEIF(A1:A3,">0",B1:B2)', m)).toBe(15);
  });
});

describe('text', () => {
  it('CLEAN strips control characters', () => {
    expect(evalFormula('CLEAN("a")', { '0,0': 'xy' })).toBe('a');
    expect(evalFormula('CLEAN(A1)', { '0,0': 'xy' })).toBe('xy');
    expect(evalFormula('CLEAN()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CLEAN(1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('CHAR / CODE', () => {
    expect(evalFormula('CHAR(65)')).toBe('A');
    expect(evalFormula('CODE("A")')).toBe(65);
    expect(evalFormula('CHAR(0)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CHAR(256)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CHAR()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CHAR(1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('CODE("")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CODE()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('CODE(1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('EXACT is case-sensitive', () => {
    expect(evalFormula('EXACT("a","a")')).toBe(true);
    expect(evalFormula('EXACT("a","A")')).toBe(false);
    expect(evalFormula('EXACT("a")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('EXACT(1/0,"a")')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('EXACT("a",1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('SEARCH is case-insensitive', () => {
    expect(evalFormula('SEARCH("B","aBc")')).toBe(2);
    expect(evalFormula('SEARCH("b","aBc")')).toBe(2);
    expect(evalFormula('SEARCH("X","aBc")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SEARCH("c","abcabc",4)')).toBe(6);
    expect(evalFormula('SEARCH("a","abc",0)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SEARCH("a")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('SEARCH(1/0,"a")')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('SEARCH("a",1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('SEARCH("a","abc",1/0)')).toMatchObject(err('#DIV/0!'));
  });

  it('NUMBERVALUE parses formatted numbers', () => {
    expect(evalFormula('NUMBERVALUE("1,234.5")')).toBe(1234.5);
    expect(evalFormula('NUMBERVALUE("1.234,5",",",".")')).toBe(1234.5);
    expect(evalFormula('NUMBERVALUE("  12 ")')).toBe(12);
    expect(evalFormula('NUMBERVALUE("")')).toBe(0);
    expect(evalFormula('NUMBERVALUE("abc")')).toMatchObject(err('#VALUE!'));
  });
  it('NUMBERVALUE separator / error / arity branches', () => {
    expect(evalFormula('NUMBERVALUE("3x5",".","")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('NUMBERVALUE("12")')).toBe(12);
    expect(evalFormula('NUMBERVALUE()')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('NUMBERVALUE(1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('NUMBERVALUE("1",1/0)')).toMatchObject(err('#DIV/0!'));
    expect(evalFormula('NUMBERVALUE("1",".",1/0)')).toMatchObject(err('#DIV/0!'));
  });
  it('NUMBERVALUE empty separator args fall back to defaults', () => {
    expect(evalFormula('NUMBERVALUE("1,234.5","","")')).toBe(1234.5);
  });

  it('TEXT numeric formatting', () => {
    expect(evalFormula('TEXT(5,"0")')).toBe('5');
    expect(evalFormula('TEXT(5,"0.00")')).toBe('5.00');
    expect(evalFormula('TEXT(1234567,"#,##0")')).toBe('1,234,567');
    expect(evalFormula('TEXT(1234.5,"#,##0.00")')).toBe('1,234.50');
    expect(evalFormula('TEXT(-1234.5,"#,##0.00")')).toBe('-1,234.50');
  });
  it('TEXT error / arity branches', () => {
    expect(evalFormula('TEXT(5)')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('TEXT("x","0")')).toMatchObject(err('#VALUE!'));
    expect(evalFormula('TEXT(5,1/0)')).toMatchObject(err('#DIV/0!'));
  });
});
