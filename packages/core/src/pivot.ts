/**
 * Pivot tables — a pure, headless cross-tabulation of record data. Group rows by
 * one or more fields, columns by zero or more fields, and aggregate a value
 * field into each cell, with row/column/grand totals. Reuses {@link aggregate}.
 *
 * Operates on an array of records (`Record<string, CellValue>`); the
 * {@link matrixToRecordsForPivot}/{@link pivotToMatrix} helpers bridge to/from
 * the header+matrix shape the grid uses.
 */

import type { CellValue } from './types.js';
import { aggregate, type AggregateFn } from './aggregate.js';

export interface PivotConfig {
  /** Field names to group on rows (outer→inner). */
  rows: readonly string[];
  /** Field names to group on columns (outer→inner). May be empty. */
  columns: readonly string[];
  /** Field whose values are aggregated. */
  value: string;
  /** Aggregation function. */
  agg: AggregateFn;
}

export interface PivotResult {
  rowHeaders: readonly string[];
  colHeaders: readonly string[];
  /** Distinct row-group key tuples, sorted. */
  rowKeys: string[][];
  /** Distinct column-group key tuples, sorted. */
  colKeys: string[][];
  /** `rowKeys.length × colKeys.length` aggregated values. */
  cells: (number | null)[][];
  rowTotals: (number | null)[];
  colTotals: (number | null)[];
  grandTotal: number | null;
}

/** Join a key tuple into a stable map key (unit separator avoids collisions). */
function joinKey(tuple: readonly string[]): string {
  return tuple.join('');
}

/**
 * Order two distinct key tuples by their joined form. Keys come from de-duped
 * maps, so they are never equal — a two-way split suffices.
 */
function compareTuples(a: readonly string[], b: readonly string[]): number {
  return joinKey(a) < joinKey(b) ? -1 : 1;
}

function keyTuple(record: Record<string, CellValue>, fields: readonly string[]): string[] {
  return fields.map((f) => {
    const v = record[f];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Cross-tabulate `records` per `config`. */
export function pivot(records: ReadonlyArray<Record<string, CellValue>>, config: PivotConfig): PivotResult {
  const rowKeyMap = new Map<string, string[]>();
  const colKeyMap = new Map<string, string[]>();
  // bucket[rowKey][colKey] -> values
  const buckets = new Map<string, Map<string, CellValue[]>>();

  for (const record of records) {
    const rTuple = keyTuple(record, config.rows);
    const cTuple = keyTuple(record, config.columns);
    const rKey = joinKey(rTuple);
    const cKey = joinKey(cTuple);
    rowKeyMap.set(rKey, rTuple);
    colKeyMap.set(cKey, cTuple);
    let row = buckets.get(rKey);
    if (row === undefined) {
      row = new Map<string, CellValue[]>();
      buckets.set(rKey, row);
    }
    let list = row.get(cKey);
    if (list === undefined) {
      list = [];
      row.set(cKey, list);
    }
    list.push(record[config.value] ?? null);
  }

  const rowKeys = [...rowKeyMap.values()].sort(compareTuples);
  const colKeys = [...colKeyMap.values()].sort(compareTuples);

  const cells: (number | null)[][] = [];
  const rowTotals: (number | null)[] = [];
  const colAccum: CellValue[][] = colKeys.map(() => []);
  const allValues: CellValue[] = [];

  for (const rTuple of rowKeys) {
    const rKey = joinKey(rTuple);
    const bucketRow = buckets.get(rKey);
    const rowValues: CellValue[] = [];
    const line: (number | null)[] = [];
    colKeys.forEach((cTuple, j) => {
      const vals = bucketRow?.get(joinKey(cTuple)) ?? [];
      line.push(aggregate(vals, config.agg));
      rowValues.push(...vals);
      colAccum[j]!.push(...vals);
      allValues.push(...vals);
    });
    cells.push(line);
    rowTotals.push(aggregate(rowValues, config.agg));
  }

  return {
    rowHeaders: [...config.rows],
    colHeaders: [...config.columns],
    rowKeys,
    colKeys,
    cells,
    rowTotals,
    colTotals: colAccum.map((vals) => aggregate(vals, config.agg)),
    grandTotal: aggregate(allValues, config.agg),
  };
}

/** Convert a header + row matrix into records keyed by header name. */
export function matrixToRecordsForPivot(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<CellValue>>,
): Record<string, CellValue>[] {
  return rows.map((row) => {
    const rec: Record<string, CellValue> = {};
    header.forEach((h, i) => {
      rec[h] = row[i] ?? null;
    });
    return rec;
  });
}

/**
 * Render a {@link PivotResult} as a display matrix: a header row of column-key
 * labels (+ "Total"), one body row per row-key (label cells + values + row
 * total), and a trailing totals row.
 */
export function pivotToMatrix(result: PivotResult): CellValue[][] {
  const rowDepth = result.rowHeaders.length;
  const header: CellValue[] = [
    ...result.rowHeaders,
    ...result.colKeys.map((t) => t.join(' / ')),
    'Total',
  ];
  const out: CellValue[][] = [header];

  result.rowKeys.forEach((rTuple, i) => {
    const line: CellValue[] = [...rTuple, ...result.cells[i]!, result.rowTotals[i]!];
    out.push(line);
  });

  const totalRow: CellValue[] = [
    'Total',
    ...Array.from({ length: rowDepth - 1 }, () => ''),
    ...result.colTotals,
    result.grandTotal,
  ];
  out.push(totalRow);
  return out;
}
