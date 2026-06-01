import { describe, it, expect } from 'vitest';
import { toNumber, toText, toBoolean, compareScalars, isNumeric } from './values.js';
import { FormulaError, VALUE } from './errors.js';

describe('toNumber', () => {
  it('passes through numbers and errors', () => {
    expect(toNumber(5)).toBe(5);
    expect(toNumber(VALUE)).toBe(VALUE);
  });
  it('coerces null, booleans, and numeric strings', () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(true)).toBe(1);
    expect(toNumber(false)).toBe(0);
    expect(toNumber('  3.5 ')).toBe(3.5);
    expect(toNumber('')).toBe(0);
  });
  it('returns #VALUE! for non-numeric strings', () => {
    expect(toNumber('abc')).toBe(VALUE);
  });
});

describe('toText', () => {
  it('formats every scalar type', () => {
    expect(toText(null)).toBe('');
    expect(toText(true)).toBe('TRUE');
    expect(toText(false)).toBe('FALSE');
    expect(toText(3)).toBe('3');
    expect(toText('x')).toBe('x');
    expect(toText(new FormulaError('#REF!'))).toBe('#REF!');
  });
});

describe('toBoolean', () => {
  it('coerces values', () => {
    expect(toBoolean(null)).toBe(false);
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(2)).toBe(true);
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean('TRUE')).toBe(true);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean(VALUE)).toBe(VALUE);
  });
  it('errors on non-boolean text', () => {
    expect(toBoolean('maybe')).toBe(VALUE);
  });
});

describe('compareScalars', () => {
  it('orders within numbers', () => {
    expect(compareScalars(1, 2)).toBe(-1);
    expect(compareScalars(2, 2)).toBe(0);
    expect(compareScalars(3, 2)).toBe(1);
  });
  it('treats null as number 0 within numeric comparison', () => {
    expect(compareScalars(null, 0)).toBe(0);
    expect(compareScalars(null, 1)).toBe(-1);
    expect(compareScalars(5, null)).toBe(1);
    expect(compareScalars(0, null)).toBe(0);
  });
  it('compares text case-insensitively', () => {
    expect(compareScalars('abc', 'ABC')).toBe(0);
    expect(compareScalars('a', 'b')).toBe(-1);
    expect(compareScalars('b', 'a')).toBe(1);
  });
  it('compares booleans', () => {
    expect(compareScalars(false, true)).toBe(-1);
    expect(compareScalars(true, true)).toBe(0);
    expect(compareScalars(true, false)).toBe(1);
  });
  it('ranks types: number < text < boolean', () => {
    expect(compareScalars(5, 'a')).toBe(-1);
    expect(compareScalars('a', true)).toBe(-1);
    expect(compareScalars(true, 5)).toBe(1);
  });
});

describe('isNumeric', () => {
  it('detects numbers and booleans', () => {
    expect(isNumeric(5)).toBe(true);
    expect(isNumeric(true)).toBe(true);
    expect(isNumeric('5')).toBe(false);
    expect(isNumeric(null)).toBe(false);
  });
});
