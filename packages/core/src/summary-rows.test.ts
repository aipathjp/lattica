import { describe, it, expect } from 'vitest';
import { computeSummaryCell } from './summary-rows.js';
import type { CellValue } from './types.js';

describe('computeSummaryCell', () => {
  const values: CellValue[] = [10, 20, 'x', null, 30];

  it('computes built-in aggregates over the numeric subset', () => {
    expect(computeSummaryCell(values, 'sum')).toBe('60');
    expect(computeSummaryCell(values, 'avg')).toBe('20');
    expect(computeSummaryCell(values, 'min')).toBe('10');
    expect(computeSummaryCell(values, 'max')).toBe('30');
  });

  it('count tallies non-empty cells (text included)', () => {
    expect(computeSummaryCell(values, 'count')).toBe('4');
  });

  it('applies an Excel-style number format to aggregate results', () => {
    expect(computeSummaryCell([1000, 234], 'sum', '#,##0')).toBe('1,234');
    expect(computeSummaryCell([1.5, 2.25], 'sum', '0.00')).toBe('3.75');
  });

  it('renders an empty string when no numeric values exist', () => {
    expect(computeSummaryCell(['a', null, ''], 'sum')).toBe('');
    expect(computeSummaryCell(['a'], 'min', '#,##0')).toBe('');
  });

  it('calls a custom rule with a copy of the values and uses its text verbatim', () => {
    let received: unknown[] = [];
    const rule = (vals: unknown[]): string => {
      received = vals;
      return `n=${vals.length}`;
    };
    // A format pattern is ignored for custom rules (they return final text).
    expect(computeSummaryCell(values, rule, '#,##0')).toBe('n=5');
    expect(received).toEqual([10, 20, 'x', null, 30]);
    expect(received).not.toBe(values); // defensive copy
  });
});
