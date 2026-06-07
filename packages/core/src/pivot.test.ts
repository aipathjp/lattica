import { describe, it, expect } from 'vitest';
import { pivot, pivotToMatrix, matrixToRecordsForPivot } from './pivot.js';
import type { CellValue } from './types.js';

const records: Record<string, CellValue>[] = [
  { region: 'East', product: 'A', units: 10 },
  { region: 'East', product: 'B', units: 20 },
  { region: 'West', product: 'A', units: 5 },
  { region: 'West', product: 'B', units: 7 },
  { region: 'East', product: 'A', units: 3 },
];

describe('pivot', () => {
  it('cross-tabulates rows × columns with sums and totals', () => {
    const r = pivot(records, { rows: ['region'], columns: ['product'], value: 'units', agg: 'sum' });
    expect(r.rowKeys).toEqual([['East'], ['West']]);
    expect(r.colKeys).toEqual([['A'], ['B']]);
    // East: A=10+3=13, B=20 ; West: A=5, B=7
    expect(r.cells).toEqual([
      [13, 20],
      [5, 7],
    ]);
    expect(r.rowTotals).toEqual([33, 12]);
    expect(r.colTotals).toEqual([18, 27]);
    expect(r.grandTotal).toBe(45);
  });

  it('sorts row/column keys regardless of input order', () => {
    const data: Record<string, CellValue>[] = [
      { r: 'West', c: 'Z', v: 1 },
      { r: 'East', c: 'A', v: 2 },
    ];
    const res = pivot(data, { rows: ['r'], columns: ['c'], value: 'v', agg: 'sum' });
    expect(res.rowKeys).toEqual([['East'], ['West']]);
    expect(res.colKeys).toEqual([['A'], ['Z']]);
  });

  it('supports count and rows-only (no column fields)', () => {
    const r = pivot(records, { rows: ['region'], columns: [], value: 'units', agg: 'count' });
    expect(r.colKeys).toEqual([[]]); // single empty column group
    expect(r.cells).toEqual([[3], [2]]);
    expect(r.grandTotal).toBe(5);
  });

  it('handles missing fields as blank keys', () => {
    const r = pivot([{ a: 1 }], { rows: ['missing'], columns: [], value: 'a', agg: 'sum' });
    expect(r.rowKeys).toEqual([['']]);
    expect(r.cells).toEqual([[1]]);
  });

  it('treats a missing value field as null (no numeric data)', () => {
    const r = pivot([{ r: 'x' }], { rows: ['r'], columns: [], value: 'v', agg: 'sum' });
    expect(r.cells).toEqual([[null]]);
    expect(r.grandTotal).toBeNull();
  });

  it('averages and yields null cells where a combination has no numeric data', () => {
    const data: Record<string, CellValue>[] = [
      { r: 'x', c: 'p', v: 4 },
      { r: 'x', c: 'q', v: 'na' },
      { r: 'y', c: 'p', v: 8 },
    ];
    const res = pivot(data, { rows: ['r'], columns: ['c'], value: 'v', agg: 'avg' });
    // rows x,y ; cols p,q. (x,q) has only non-numeric -> null; (y,q) absent -> null.
    expect(res.cells).toEqual([
      [4, null],
      [8, null],
    ]);
  });
});

describe('matrixToRecordsForPivot', () => {
  it('keys rows by header names, filling missing cells with null', () => {
    const recs = matrixToRecordsForPivot(['a', 'b'], [
      [1, 2],
      [3],
    ]);
    expect(recs).toEqual([
      { a: 1, b: 2 },
      { a: 3, b: null },
    ]);
  });
});

describe('pivotToMatrix', () => {
  it('renders headers, body rows, and a totals row', () => {
    const r = pivot(records, { rows: ['region'], columns: ['product'], value: 'units', agg: 'sum' });
    const m = pivotToMatrix(r);
    expect(m[0]).toEqual(['region', 'A', 'B', 'Total']);
    expect(m[1]).toEqual(['East', 13, 20, 33]);
    expect(m[2]).toEqual(['West', 5, 7, 12]);
    expect(m[3]).toEqual(['Total', 18, 27, 45]);
  });

  it('pads multi-field row headers in the totals row', () => {
    const data: Record<string, CellValue>[] = [{ a: 'x', b: 'y', v: 2 }];
    const r = pivot(data, { rows: ['a', 'b'], columns: [], value: 'v', agg: 'sum' });
    const m = pivotToMatrix(r);
    expect(m[0]).toEqual(['a', 'b', '', 'Total']); // empty col-key tuple -> '' label
    // totals row: 'Total' then one blank for the second row field
    const last = m[m.length - 1]!;
    expect(last[0]).toBe('Total');
    expect(last[1]).toBe('');
  });
});
