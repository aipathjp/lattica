import { describe, it, expect } from 'vitest';
import { evalFormula } from './test-helpers.js';
import { builtinFunctionNames } from './functions.js';
import { FormulaError } from './errors.js';

const cells = {
  '0,0': 1,
  '1,0': 2,
  '2,0': 3,
  '0,1': 10,
  '1,1': 20,
  '2,1': 30,
};

describe('math functions', () => {
  it('SUM', () => {
    expect(evalFormula('SUM(1,2,3)')).toBe(6);
    expect(evalFormula('SUM(A1:A3)', cells)).toBe(6);
    expect(evalFormula('SUM(A1:A3,B1:B3)', cells)).toBe(66);
    expect(evalFormula('SUM("x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('SUM("3",2)')).toBe(5); // direct numeric string is coerced
    expect(evalFormula('SUM(TRUE,2)')).toBe(3);
  });
  it('PRODUCT', () => {
    expect(evalFormula('PRODUCT(2,3,4)')).toBe(24);
    expect(evalFormula('PRODUCT()')).toBe(0);
  });
  it('ABS/SIGN/INT', () => {
    expect(evalFormula('ABS(-5)')).toBe(5);
    expect(evalFormula('SIGN(-3)')).toBe(-1);
    expect(evalFormula('INT(3.9)')).toBe(3);
    expect(evalFormula('ABS()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('ABS("x")')).toMatchObject({ type: '#VALUE!' });
  });
  it('SQRT/EXP/LN/LOG10/LOG/POWER', () => {
    expect(evalFormula('SQRT(9)')).toBe(3);
    expect(evalFormula('SQRT(-1)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('EXP(0)')).toBe(1);
    expect(evalFormula('LN(1)')).toBe(0);
    expect(evalFormula('LN(0)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('LOG10(1000)')).toBeCloseTo(3);
    expect(evalFormula('LOG(8,2)')).toBeCloseTo(3);
    expect(evalFormula('LOG(100)')).toBeCloseTo(2);
    expect(evalFormula('LOG(0)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('LOG(8,1)')).toMatchObject({ type: '#NUM!' });
    expect(evalFormula('POWER(2,3)')).toBe(8);
    expect(evalFormula('POWER(-1,0.5)')).toMatchObject({ type: '#NUM!' });
  });
  it('MOD', () => {
    expect(evalFormula('MOD(10,3)')).toBe(1);
    expect(evalFormula('MOD(-10,3)')).toBe(2); // sign of divisor
    expect(evalFormula('MOD(5,0)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('ROUND/ROUNDUP/ROUNDDOWN/TRUNC', () => {
    expect(evalFormula('ROUND(2.5,0)')).toBe(3);
    expect(evalFormula('ROUND(-2.5,0)')).toBe(-3);
    expect(evalFormula('ROUND(3.14159,2)')).toBe(3.14);
    expect(evalFormula('ROUNDUP(2.1,0)')).toBe(3);
    expect(evalFormula('ROUNDDOWN(2.9,0)')).toBe(2);
    expect(evalFormula('ROUNDDOWN(-2.9,0)')).toBe(-2);
    expect(evalFormula('TRUNC(3.99)')).toBe(3);
    expect(evalFormula('ROUND(5)')).toBe(5);
  });
  it('CEILING/FLOOR', () => {
    expect(evalFormula('CEILING(2.1,1)')).toBe(3);
    expect(evalFormula('CEILING(2.1,0)')).toBe(0);
    expect(evalFormula('FLOOR(2.9,1)')).toBe(2);
    expect(evalFormula('FLOOR(2.9,0)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('propagates argument errors', () => {
    expect(evalFormula('ROUND(1/0,2)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('POWER(1/0,2)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('MOD(1/0,2)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('CEILING(1,1/0)')).toMatchObject({ type: '#DIV/0!' });
  });
});

describe('statistics', () => {
  it('AVERAGE', () => {
    expect(evalFormula('AVERAGE(2,4,6)')).toBe(4);
    expect(evalFormula('AVERAGE(A1:A3)', cells)).toBe(2);
    expect(evalFormula('AVERAGE("x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('AVERAGE(B5:B6)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('MIN/MAX', () => {
    expect(evalFormula('MIN(3,1,2)')).toBe(1);
    expect(evalFormula('MAX(3,1,2)')).toBe(3);
    expect(evalFormula('MIN(Z1:Z2)')).toBe(0);
    expect(evalFormula('MAX(Z1:Z2)')).toBe(0);
  });
  it('MEDIAN', () => {
    expect(evalFormula('MEDIAN(1,2,3)')).toBe(2);
    expect(evalFormula('MEDIAN(1,2,3,4)')).toBe(2.5);
    expect(evalFormula('MEDIAN(Z1:Z2)')).toMatchObject({ type: '#NUM!' });
  });
  it('COUNT/COUNTA/COUNTBLANK', () => {
    expect(evalFormula('COUNT(1,"x",2,TRUE)')).toBe(2);
    expect(evalFormula('COUNTA(1,"x",2,"")', {})).toBe(3);
    expect(evalFormula('COUNTBLANK(A1:A3)', { '0,0': 1 })).toBe(2);
  });
  it('propagates errors in aggregation', () => {
    expect(evalFormula('SUM(A1)', { '0,0': new FormulaError('#DIV/0!') })).toMatchObject({
      type: '#DIV/0!',
    });
  });
});

describe('logical', () => {
  it('IF is lazy in the untaken branch', () => {
    expect(evalFormula('IF(TRUE,1,1/0)')).toBe(1);
    expect(evalFormula('IF(FALSE,1/0,2)')).toBe(2);
    expect(evalFormula('IF(FALSE,1)')).toBe(false);
    expect(evalFormula('IF(1/0,1,2)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('IFERROR/IFNA', () => {
    expect(evalFormula('IFERROR(1/0,"oops")')).toBe('oops');
    expect(evalFormula('IFERROR(5,"oops")')).toBe(5);
    expect(evalFormula('IFNA(#N/A,"na")')).toBe('na');
    expect(evalFormula('IFNA(1/0,"na")')).toMatchObject({ type: '#DIV/0!' });
  });
  it('AND/OR/XOR/NOT', () => {
    expect(evalFormula('AND(TRUE,TRUE)')).toBe(true);
    expect(evalFormula('AND(TRUE,FALSE)')).toBe(false);
    expect(evalFormula('OR(FALSE,TRUE)')).toBe(true);
    expect(evalFormula('OR(FALSE,FALSE)')).toBe(false);
    expect(evalFormula('XOR(TRUE,TRUE,TRUE)')).toBe(true);
    expect(evalFormula('XOR(TRUE,TRUE)')).toBe(false);
    expect(evalFormula('NOT(FALSE)')).toBe(true);
  });
  it('logical arity and error handling', () => {
    expect(evalFormula('AND()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('OR()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('XOR()')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('AND(1/0)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('XOR(1/0)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('NOT(1/0)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('AND("x")')).toMatchObject({ type: '#VALUE!' });
  });
  it('TRUE/FALSE constants', () => {
    expect(evalFormula('TRUE()')).toBe(true);
    expect(evalFormula('FALSE()')).toBe(false);
    expect(evalFormula('TRUE(1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FALSE(1)')).toMatchObject({ type: '#VALUE!' });
  });
});

describe('text', () => {
  it('CONCAT/CONCATENATE', () => {
    expect(evalFormula('CONCATENATE("a","b","c")')).toBe('abc');
    expect(evalFormula('CONCAT(1,2,3)')).toBe('123');
    expect(evalFormula('CONCAT(1/0)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('LEN/UPPER/LOWER/TRIM/PROPER', () => {
    expect(evalFormula('LEN("hello")')).toBe(5);
    expect(evalFormula('UPPER("aB")')).toBe('AB');
    expect(evalFormula('LOWER("aB")')).toBe('ab');
    expect(evalFormula('TRIM("  a   b  ")')).toBe('a b');
    expect(evalFormula('PROPER("hello WORLD")')).toBe('Hello World');
    expect(evalFormula('LEN(1/0)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('LEFT/RIGHT/MID', () => {
    expect(evalFormula('LEFT("hello",2)')).toBe('he');
    expect(evalFormula('LEFT("hello")')).toBe('h');
    expect(evalFormula('RIGHT("hello",2)')).toBe('lo');
    expect(evalFormula('RIGHT("hello",0)')).toBe('');
    expect(evalFormula('MID("hello",2,3)')).toBe('ell');
    expect(evalFormula('LEFT("x",-1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('RIGHT("x",-1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('MID("x",0,1)')).toMatchObject({ type: '#VALUE!' });
  });
  it('REPT/FIND/SUBSTITUTE/TEXTJOIN', () => {
    expect(evalFormula('REPT("ab",3)')).toBe('ababab');
    expect(evalFormula('REPT("ab",-1)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FIND("l","hello")')).toBe(3);
    expect(evalFormula('FIND("z","hello")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('FIND("l","hello",4)')).toBe(4);
    expect(evalFormula('FIND("l","hello",0)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('SUBSTITUTE("a-b-c","-","+")')).toBe('a+b+c');
    expect(evalFormula('SUBSTITUTE("a-b-c","-","+",2)')).toBe('a-b+c');
    expect(evalFormula('SUBSTITUTE("abc","","X")')).toBe('abc');
    expect(evalFormula('SUBSTITUTE("a-b","-","+",5)')).toBe('a-b');
    expect(evalFormula('SUBSTITUTE("x","y","z",0)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('TEXTJOIN("-",TRUE,"a","","b")')).toBe('a-b');
    expect(evalFormula('TEXTJOIN("-",FALSE,"a","","b")')).toBe('a--b');
    expect(evalFormula('TEXTJOIN("-")')).toMatchObject({ type: '#VALUE!' });
  });
  it('VALUE/T/N', () => {
    expect(evalFormula('VALUE("3.5")')).toBe(3.5);
    expect(evalFormula('VALUE("x")')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('VALUE()')).toMatchObject({ type: '#VALUE!' }); // arity
    expect(evalFormula('VALUE(1,2)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('T("hi")')).toBe('hi');
    expect(evalFormula('T(5)')).toBe('');
    expect(evalFormula('N(5)')).toBe(5);
    expect(evalFormula('N(TRUE)')).toBe(1);
    expect(evalFormula('N("x")')).toBe(0);
    expect(evalFormula('T(1/0)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('N(1/0)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('text error propagation', () => {
    expect(evalFormula('LEFT(1/0,2)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('MID(1/0,1,1)')).toMatchObject({ type: '#DIV/0!' });
    expect(evalFormula('SUBSTITUTE(1/0,"a","b")')).toMatchObject({ type: '#DIV/0!' });
  });
});

describe('information', () => {
  it('IS* predicates', () => {
    expect(evalFormula('ISBLANK(A9)', {})).toBe(true);
    expect(evalFormula('ISNUMBER(5)')).toBe(true);
    expect(evalFormula('ISTEXT("x")')).toBe(true);
    expect(evalFormula('ISLOGICAL(TRUE)')).toBe(true);
    expect(evalFormula('ISERROR(1/0)')).toBe(true);
    expect(evalFormula('ISERR(1/0)')).toBe(true);
    expect(evalFormula('ISERR(#N/A)')).toBe(false);
    expect(evalFormula('ISNA(#N/A)')).toBe(true);
    expect(evalFormula('ISNUMBER("x")')).toBe(false);
    expect(evalFormula('ISBLANK()')).toMatchObject({ type: '#VALUE!' });
  });
  it('NA', () => {
    expect(evalFormula('NA()')).toMatchObject({ type: '#N/A' });
    expect(evalFormula('NA(1)')).toMatchObject({ type: '#VALUE!' });
  });
});

describe('conditional aggregation', () => {
  it('COUNTIF', () => {
    expect(evalFormula('COUNTIF(A1:A3,">1")', cells)).toBe(2);
    expect(evalFormula('COUNTIF(A1:A3,2)', cells)).toBe(1);
    expect(evalFormula('COUNTIF(A1:A3,"<>2")', cells)).toBe(2);
  });
  it('SUMIF', () => {
    expect(evalFormula('SUMIF(A1:A3,">1")', cells)).toBe(5);
    expect(evalFormula('SUMIF(A1:A3,">1",B1:B3)', cells)).toBe(50);
    expect(evalFormula('SUMIF(A1:A3,">=2")', cells)).toBe(5);
    expect(evalFormula('SUMIF(A1:A3,"<=2")', cells)).toBe(3);
  });
  it('matches text criteria', () => {
    const c = { '0,0': 'apple', '1,0': 'banana', '2,0': 'apple' };
    expect(evalFormula('COUNTIF(A1:A3,"apple")', c)).toBe(2);
    expect(evalFormula('COUNTIF(A1:A3,"APPLE")', c)).toBe(2);
  });
  it('handles single-cell and error inputs', () => {
    expect(evalFormula('COUNTIF(A1,">0")', { '0,0': 5 })).toBe(1);
    expect(evalFormula('SUMIF(A1,">0")', { '0,0': 5 })).toBe(5);
    expect(evalFormula('COUNTIF(A1:A2,1/0)')).toMatchObject({ type: '#DIV/0!' });
  });
  it('SUMIF/COUNTIF arity', () => {
    expect(evalFormula('SUMIF(A1:A3)', cells)).toMatchObject({ type: '#VALUE!' });
  });
});

describe('registry', () => {
  it('lists builtin function names sorted', () => {
    const names = builtinFunctionNames();
    expect(names).toContain('SUM');
    expect(names).toContain('IF');
    expect([...names]).toEqual([...names].sort());
    expect(names.length).toBeGreaterThan(40);
  });
});
