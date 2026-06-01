import { describe, it, expect } from 'vitest';
import { evalFormula } from './test-helpers.js';
import { FormulaError } from './errors.js';

/** Formulas that must propagate a #DIV/0! supplied via `1/0`. */
const ERROR_PROPAGATION = [
  'PRODUCT(1/0)',
  'SQRT(1/0)',
  'EXP(1/0)',
  'LN(1/0)',
  'LOG10(1/0)',
  'INT(1/0)',
  'SIGN(1/0)',
  'LOG(1/0)',
  'LOG(8,1/0)',
  'POWER(1/0,2)',
  'POWER(2,1/0)',
  'MOD(1/0,2)',
  'MOD(2,1/0)',
  'ROUND(1/0,1)',
  'ROUND(2,1/0)',
  'ROUNDUP(2,1/0)',
  'ROUNDDOWN(2,1/0)',
  'TRUNC(1/0)',
  'TRUNC(2,1/0)',
  'CEILING(1/0,1)',
  'CEILING(2,1/0)',
  'FLOOR(1/0,1)',
  'FLOOR(2,1/0)',
  'AVERAGE(1/0)',
  'MIN(1/0)',
  'MAX(1/0)',
  'MEDIAN(1/0)',
  'AND(1/0)',
  'OR(1/0)',
  'NOT(1/0)',
  'CONCAT(1/0)',
  'LEN(1/0)',
  'UPPER(1/0)',
  'LOWER(1/0)',
  'TRIM(1/0)',
  'PROPER(1/0)',
  'LEFT(1/0,2)',
  'LEFT("x",1/0)',
  'RIGHT(1/0,2)',
  'RIGHT("x",1/0)',
  'MID(1/0,1,1)',
  'MID("x",1/0,1)',
  'MID("x",1,1/0)',
  'REPT(1/0,2)',
  'REPT("x",1/0)',
  'FIND(1/0,"x")',
  'FIND("x",1/0)',
  'FIND("x","xyz",1/0)',
  'SUBSTITUTE(1/0,"a","b")',
  'SUBSTITUTE("x",1/0,"b")',
  'SUBSTITUTE("x","a",1/0)',
  'SUBSTITUTE("x","a","b",1/0)',
  'TEXTJOIN(1/0,TRUE,"a")',
  'TEXTJOIN("-",1/0,"a")',
  'TEXTJOIN("-",TRUE,1/0)',
  'VALUE(1/0)',
  'T(1/0)',
  'N(1/0)',
  'ISBLANK(1/0)' /* ISBLANK(error) -> false, not error; handled separately */,
];

describe('error propagation sweep', () => {
  for (const formula of ERROR_PROPAGATION.filter((f) => !f.startsWith('ISBLANK'))) {
    it(`${formula} propagates #DIV/0!`, () => {
      expect(evalFormula(formula)).toMatchObject({ type: '#DIV/0!' });
    });
  }
});

/** Formulas whose argument count is invalid -> #VALUE!. */
const ARITY_ERRORS = [
  'SQRT(1,2)',
  'LOG(1,2,3)',
  'POWER(1)',
  'POWER(1,2,3)',
  'MOD(1)',
  'ROUND(1,2,3)',
  'ROUNDUP(1,2,3)',
  'TRUNC(1,2,3)',
  'CEILING(1,2,3)',
  'FLOOR(1,2,3)',
  'LEN()',
  'LEN(1,2)',
  'LEFT()',
  'LEFT(1,2,3)',
  'RIGHT(1,2,3)',
  'MID(1,2)',
  'REPT(1)',
  'FIND(1)',
  'SUBSTITUTE(1,2)',
  'IFERROR(1)',
  'IFNA(1)',
  'NOT(1,2)',
  'ISBLANK()',
  'ISNUMBER(1,2)',
  'IF(1)',
];

describe('arity error sweep', () => {
  for (const formula of ARITY_ERRORS) {
    it(`${formula} returns #VALUE!`, () => {
      expect(evalFormula(formula)).toMatchObject({ type: '#VALUE!' });
    });
  }
});

describe('makeCriterion branches', () => {
  it('matches a null criterion against blank cells', () => {
    const cells = { '0,0': 1, '0,2': null };
    // C1 is blank -> criterion null -> counts blank cells in A1:A3
    expect(evalFormula('COUNTIF(A1:A3,C1)', cells)).toBe(2);
  });
  it('matches a boolean criterion', () => {
    const cells = { '0,0': true, '1,0': false, '2,0': true };
    expect(evalFormula('COUNTIF(A1:A3,TRUE)', cells)).toBe(2);
  });
  it('handles <> with text', () => {
    const cells = { '0,0': 'apple', '1,0': 'pear', '2,0': 'apple' };
    expect(evalFormula('COUNTIF(A1:A3,"<>apple")', cells)).toBe(1);
  });
  it('returns 0 when a numeric comparison has a non-numeric threshold', () => {
    const cells = { '0,0': 1, '1,0': 2, '2,0': 3 };
    expect(evalFormula('COUNTIF(A1:A3,">abc")', cells)).toBe(0);
  });
  it('skips non-numeric cells in a numeric comparison', () => {
    const cells = { '0,0': 'x', '1,0': 5, '2,0': 'y' };
    expect(evalFormula('COUNTIF(A1:A3,">3")', cells)).toBe(1);
  });
  it('=criterion with numeric string matches by number', () => {
    const cells = { '0,0': 5, '1,0': 5, '2,0': 6 };
    expect(evalFormula('COUNTIF(A1:A3,"5")', cells)).toBe(2);
  });
  it('handles <= and >= numeric comparisons', () => {
    const cells = { '0,0': 1, '1,0': 2, '2,0': 3 };
    expect(evalFormula('COUNTIF(A1:A3,"<=2")', cells)).toBe(2);
    expect(evalFormula('COUNTIF(A1:A3,">=2")', cells)).toBe(2);
    expect(evalFormula('COUNTIF(A1:A3,"<2")', cells)).toBe(1);
  });
});

describe('text functions with missing optional/required args', () => {
  it('UPPER/LOWER/TRIM/PROPER with no argument coerce to empty string', () => {
    expect(evalFormula('UPPER()')).toBe('');
    expect(evalFormula('LOWER()')).toBe('');
    expect(evalFormula('TRIM()')).toBe('');
    expect(evalFormula('PROPER()')).toBe('');
  });
});

describe('aggregation edge cases', () => {
  it('SUM skips booleans that come from a range', () => {
    const cells = { '0,0': true, '1,0': 5 };
    expect(evalFormula('SUM(A1:A2)', cells)).toBe(5);
  });
  it('COUNT over a range counts only numbers', () => {
    const cells = { '0,0': 1, '1,0': 'x', '2,0': 3 };
    expect(evalFormula('COUNT(A1:A3)', cells)).toBe(2);
  });
  it('ISBLANK(error) is false', () => {
    expect(evalFormula('ISBLANK(1/0)')).toBe(false);
  });
});

describe('additional branch edges', () => {
  it('SUM coerces a direct FALSE to 0', () => {
    expect(evalFormula('SUM(FALSE,5)')).toBe(5);
  });
  it('LOG10 of a non-positive number is #NUM!', () => {
    expect(evalFormula('LOG10(0)')).toMatchObject({ type: '#NUM!' });
  });
  it('ROUNDUP of a negative number rounds away from zero', () => {
    expect(evalFormula('ROUNDUP(-2.1,0)')).toBe(-3);
  });
  it('CEILING/FLOOR default significance to 1', () => {
    expect(evalFormula('CEILING(2.1)')).toBe(3);
    expect(evalFormula('FLOOR(2.9)')).toBe(2);
  });
  it('COUNTBLANK counts empty-string cells', () => {
    expect(evalFormula('COUNTBLANK(A1:A2)', { '0,0': '', '1,0': 'x' })).toBe(1);
  });
  it('RIGHT defaults to one character', () => {
    expect(evalFormula('RIGHT("hello")')).toBe('o');
  });
  it('N(FALSE) is 0', () => {
    expect(evalFormula('N(FALSE)')).toBe(0);
  });
  it('AND/OR/XOR skip blank cells and error when all blank', () => {
    expect(evalFormula('AND(A1:A2,TRUE)', { '0,0': null })).toBe(true);
    expect(evalFormula('AND(Z1:Z2)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('XOR(A1:A2,TRUE)', { '0,0': null })).toBe(true);
    expect(evalFormula('XOR(Z1:Z2)')).toMatchObject({ type: '#VALUE!' });
    expect(evalFormula('XOR("maybe")')).toMatchObject({ type: '#VALUE!' });
  });
  it('SUMIF with a scalar sum range and error cells', () => {
    const cells = { '0,0': 5, '0,1': 100 };
    expect(evalFormula('SUMIF(A1,">0",B1)', cells)).toBe(100);
  });
  it('SUMIF skips error cells in the criterion range', () => {
    const cells = { '0,0': 1, '1,0': new FormulaError('#DIV/0!'), '2,0': 3 };
    expect(evalFormula('SUMIF(A1:A3,">0")', cells)).toBe(4);
  });
  it('SUMIF treats a missing sum-range cell as zero', () => {
    // criterion range A1:A3 has 3 cells; sum range B1:B2 has only 2.
    const cells = { '0,0': 1, '1,0': 2, '2,0': 3, '0,1': 10, '1,1': 20 };
    expect(evalFormula('SUMIF(A1:A3,">0",B1:B2)', cells)).toBe(30);
  });
});

describe('error literal evaluation', () => {
  it('evaluates an unknown #ERROR! literal to #ERROR!', () => {
    expect(evalFormula('#ERROR!')).toMatchObject({ type: '#ERROR!' });
  });
});
