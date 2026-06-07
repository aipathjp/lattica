/**
 * JSON import/export for Lattica matrices.
 *
 * Two interchange shapes are supported:
 *  - A plain 2D array (row-major) of {@link CellValue}, round-tripped via
 *    {@link matrixToJson} / {@link jsonToMatrix}.
 *  - An array of record objects (one per row, keyed by column name),
 *    converted to/from a header + matrix pair via {@link recordsToMatrix} /
 *    {@link matrixToRecords}.
 *
 * {@link jsonToMatrix} validates structure and cell types and throws a plain
 * `Error` on malformed JSON or an unexpected shape, so callers can surface a
 * single failure mode regardless of how the input was wrong.
 */

import type { CellValue } from '@lattica/core';

/** True when `value` is a valid {@link CellValue} (string, number, boolean, or null). */
function isCellValue(value: unknown): value is CellValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/** Serialize a row-major matrix to a JSON string (a 2D array). */
export function matrixToJson(rows: ReadonlyArray<ReadonlyArray<CellValue>>): string {
  return JSON.stringify(rows);
}

/**
 * Parse a JSON string into a row-major matrix, validating that it is a 2D
 * array whose cells are all {@link CellValue}. Throws an `Error` on malformed
 * JSON or any shape/type mismatch.
 */
export function jsonToMatrix(json: string): CellValue[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('jsonToMatrix: malformed JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('jsonToMatrix: expected a 2D array (top level is not an array)');
  }

  const matrix: CellValue[][] = [];
  for (const row of parsed) {
    if (!Array.isArray(row)) {
      throw new Error('jsonToMatrix: expected a 2D array (row is not an array)');
    }
    const cells: CellValue[] = [];
    for (const cell of row) {
      if (!isCellValue(cell)) {
        throw new Error('jsonToMatrix: invalid cell type (expected string, number, boolean, or null)');
      }
      cells.push(cell);
    }
    matrix.push(cells);
  }
  return matrix;
}

/** Result of {@link recordsToMatrix}: resolved column headers and the row matrix. */
export interface RecordsResult {
  headers: string[];
  rows: CellValue[][];
}

/**
 * Convert an array of record objects into a header + matrix pair.
 *
 * When `columns` is omitted, the headers are the union of all record keys in
 * first-seen order. Each record is mapped to a row following the header order;
 * keys absent from a record become `null`.
 */
export function recordsToMatrix(
  records: ReadonlyArray<Record<string, CellValue>>,
  columns?: readonly string[],
): RecordsResult {
  let headers: string[];
  if (columns !== undefined) {
    headers = [...columns];
  } else {
    const seen = new Set<string>();
    headers = [];
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (!seen.has(key)) {
          seen.add(key);
          headers.push(key);
        }
      }
    }
  }

  const rows: CellValue[][] = records.map((record) =>
    // An own key with an `undefined` value is normalized to null, same as a
    // missing key (undefined is not a valid CellValue).
    headers.map((header) => record[header] ?? null),
  );

  return { headers, rows };
}

/**
 * Convert a header + matrix pair back into record objects (the inverse of
 * {@link recordsToMatrix}). Cells beyond the header count are ignored; headers
 * with no corresponding cell in a row map to `null`.
 */
export function matrixToRecords(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<CellValue>>,
): Record<string, CellValue>[] {
  return rows.map((row) => {
    const record: Record<string, CellValue> = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      const cell = row[i];
      record[header] = cell === undefined ? null : cell;
    }
    return record;
  });
}
