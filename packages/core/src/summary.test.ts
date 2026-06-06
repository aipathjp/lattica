import { describe, it, expect } from 'vitest';
import type { CellValue } from './types.js';
import { toNumberOrNull, summarize, summarizeColumn, type SummaryFn } from './summary.js';

describe('toNumberOrNull', () => {
  it('returns numbers as-is, including non-finite', () => {
    expect(toNumberOrNull(0)).toBe(0);
    expect(toNumberOrNull(42)).toBe(42);
    expect(toNumberOrNull(-3.5)).toBe(-3.5);
    expect(toNumberOrNull(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(toNumberOrNull(Number.NaN)).toBeNaN();
  });

  it('maps booleans to 1/0', () => {
    expect(toNumberOrNull(true)).toBe(1);
    expect(toNumberOrNull(false)).toBe(0);
  });

  it('parses numeric strings (with surrounding whitespace)', () => {
    expect(toNumberOrNull('123')).toBe(123);
    expect(toNumberOrNull('  -4.5 ')).toBe(-4.5);
    expect(toNumberOrNull('1e3')).toBe(1000);
  });

  it('returns null for blank or whitespace-only strings', () => {
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('   ')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(toNumberOrNull('abc')).toBeNull();
    expect(toNumberOrNull('12px')).toBeNull();
  });

  it('returns null for null', () => {
    expect(toNumberOrNull(null)).toBeNull();
  });
});

describe('summarize - count', () => {
  it('counts non-empty cells (excludes null and blank strings)', () => {
    const values: CellValue[] = [1, 'a', null, '', '  ', true, false, 0];
    expect(summarize(values, 'count')).toBe(5);
  });

  it('is 0 for empty input', () => {
    expect(summarize([], 'count')).toBe(0);
  });
});

describe('summarize - countNumbers', () => {
  it('counts numeric cells only', () => {
    const values: CellValue[] = [1, '2', 'x', null, true, '', 3.5];
    // 1, '2', true(=1), 3.5 are numeric => 4
    expect(summarize(values, 'countNumbers')).toBe(4);
  });

  it('is 0 when no numeric cells', () => {
    expect(summarize(['a', null, ''], 'countNumbers')).toBe(0);
  });
});

describe('summarize - sum', () => {
  it('sums numeric cells', () => {
    expect(summarize([1, 2, '3', true, 'x', null], 'sum')).toBe(7);
  });

  it('is 0 for no numeric cells', () => {
    expect(summarize(['x', null], 'sum')).toBe(0);
    expect(summarize([], 'sum')).toBe(0);
  });
});

describe('summarize - avg', () => {
  it('averages numeric cells', () => {
    expect(summarize([2, 4, '6'], 'avg')).toBe(4);
  });

  it('is 0 for no numeric cells', () => {
    expect(summarize(['x', null], 'avg')).toBe(0);
    expect(summarize([], 'avg')).toBe(0);
  });
});

describe('summarize - min', () => {
  it('finds the minimum numeric cell', () => {
    expect(summarize([5, 3, '1', 9, true], 'min')).toBe(1);
  });

  it('is 0 for no numeric cells', () => {
    expect(summarize(['x'], 'min')).toBe(0);
    expect(summarize([], 'min')).toBe(0);
  });
});

describe('summarize - max', () => {
  it('finds the maximum numeric cell', () => {
    expect(summarize([5, 3, '10', 9, false], 'max')).toBe(10);
  });

  it('is 0 for no numeric cells', () => {
    expect(summarize(['x'], 'max')).toBe(0);
    expect(summarize([], 'max')).toBe(0);
  });
});

describe('summarize - mixed numeric/text/blank', () => {
  it('agrees across functions on one dataset', () => {
    const values: CellValue[] = [10, '20', 'thirty', null, '', true, false, 30];
    // numeric: 10, 20, 1, 0, 30 => count 5, sum 61
    expect(summarize(values, 'countNumbers')).toBe(5);
    expect(summarize(values, 'sum')).toBe(61);
    expect(summarize(values, 'min')).toBe(0);
    expect(summarize(values, 'max')).toBe(30);
    expect(summarize(values, 'avg')).toBe(61 / 5);
    // non-empty: 10, '20', 'thirty', true, false, 30 => 6
    expect(summarize(values, 'count')).toBe(6);
  });
});

describe('summarizeColumn', () => {
  it('delegates to summarize via the row accessor', () => {
    const col: CellValue[] = [1, '2', null, 'x', 4];
    const get = (row: number): CellValue => col[row] ?? null;
    expect(summarizeColumn(col.length, get, 'sum')).toBe(7);
    expect(summarizeColumn(col.length, get, 'count')).toBe(4);
    expect(summarizeColumn(col.length, get, 'countNumbers')).toBe(3);
    expect(summarizeColumn(col.length, get, 'min')).toBe(1);
    expect(summarizeColumn(col.length, get, 'max')).toBe(4);
    expect(summarizeColumn(col.length, get, 'avg')).toBe(7 / 3);
  });

  it('handles a zero-row column without calling the accessor', () => {
    let calls = 0;
    const get = (): CellValue => {
      calls++;
      return null;
    };
    expect(summarizeColumn(0, get, 'sum')).toBe(0);
    expect(calls).toBe(0);
  });

  it('covers every SummaryFn member', () => {
    const fns: SummaryFn[] = ['sum', 'avg', 'min', 'max', 'count', 'countNumbers'];
    const get = (row: number): CellValue => row + 1;
    for (const fn of fns) {
      expect(typeof summarizeColumn(3, get, fn)).toBe('number');
    }
  });
});
