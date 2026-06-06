/**
 * Pure (de)serialization of grid view state.
 *
 * A {@link GridStateSnapshot} is a plain, JSON-friendly description of the
 * user-customizable view configuration (column widths, hidden rows, sort, …).
 * This module only converts snapshots to/from JSON strings and validates the
 * shape on the way in — it performs no DOM or storage access, so callers are
 * free to persist the resulting string wherever they like (localStorage, a
 * file, a backend, …).
 *
 * On decode, the JSON must declare `version: 1` and every present field must
 * match its declared shape; otherwise {@link deserializeState} throws. Unknown
 * top-level fields are stripped (only the known schema survives a round-trip).
 */

/** A serializable snapshot of the grid's view configuration. */
export interface GridStateSnapshot {
  /** Schema version. Only `1` is currently understood. */
  version: 1;
  /** Per-column pixel widths keyed by column index. */
  columnWidths?: Record<number, number>;
  /** Per-row pixel heights keyed by row index. */
  rowHeights?: Record<number, number>;
  /** Indices of columns hidden from view. */
  hiddenColumns?: number[];
  /** Indices of rows hidden from view. */
  hiddenRows?: number[];
  /** Display order of columns as a permutation of indices. */
  columnOrder?: number[];
  /** Active multi-column sort, applied in array order. */
  sort?: { col: number; direction: 'asc' | 'desc' }[];
  /** Number of leading rows frozen in place. */
  frozenRows?: number;
  /** Number of leading columns frozen in place. */
  frozenCols?: number;
}

/** A fresh, empty snapshot at the current schema version. */
export function emptyState(): GridStateSnapshot {
  return { version: 1 };
}

/** Serialize a snapshot to a JSON string. */
export function serializeState(state: GridStateSnapshot): string {
  return JSON.stringify(state);
}

function fail(message: string): never {
  throw new Error(`Invalid grid state: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a non-negative-or-any finite integer (used for indices/counts). */
function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Validate a `Record<number, number>` map (numeric keys, numeric values). */
function readNumberMap(value: unknown, field: string): Record<number, number> {
  if (!isPlainObject(value)) {
    fail(`${field} must be an object`);
  }
  const out: Record<number, number> = {};
  for (const [key, val] of Object.entries(value)) {
    // Object keys are always strings; require them to be integer-like.
    const numKey = Number(key);
    if (!Number.isInteger(numKey) || String(numKey) !== key) {
      fail(`${field} has non-integer key "${key}"`);
    }
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      fail(`${field}["${key}"] must be a finite number`);
    }
    out[numKey] = val;
  }
  return out;
}

/** Validate an array of integers. */
function readIntArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array`);
  }
  for (const item of value) {
    if (!isInteger(item)) {
      fail(`${field} must contain only integers`);
    }
  }
  return value as number[];
}

/** Validate the sort descriptor array. */
function readSort(value: unknown): { col: number; direction: 'asc' | 'desc' }[] {
  if (!Array.isArray(value)) {
    fail('sort must be an array');
  }
  const out: { col: number; direction: 'asc' | 'desc' }[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) {
      fail('sort entries must be objects');
    }
    if (!isInteger(item.col)) {
      fail('sort entry col must be an integer');
    }
    if (item.direction !== 'asc' && item.direction !== 'desc') {
      fail('sort entry direction must be "asc" or "desc"');
    }
    out.push({ col: item.col, direction: item.direction });
  }
  return out;
}

/**
 * Parse and validate a JSON string into a {@link GridStateSnapshot}.
 *
 * Throws an {@link Error} on malformed JSON, a missing/incorrect `version`, or
 * any field whose shape does not match the schema. Unknown top-level fields are
 * ignored (stripped from the result).
 */
export function deserializeState(json: string): GridStateSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail('not valid JSON');
  }

  if (!isPlainObject(parsed)) {
    fail('root must be an object');
  }
  if (parsed.version !== 1) {
    fail('version must be 1');
  }

  const result: GridStateSnapshot = { version: 1 };

  if (parsed.columnWidths !== undefined) {
    result.columnWidths = readNumberMap(parsed.columnWidths, 'columnWidths');
  }
  if (parsed.rowHeights !== undefined) {
    result.rowHeights = readNumberMap(parsed.rowHeights, 'rowHeights');
  }
  if (parsed.hiddenColumns !== undefined) {
    result.hiddenColumns = readIntArray(parsed.hiddenColumns, 'hiddenColumns');
  }
  if (parsed.hiddenRows !== undefined) {
    result.hiddenRows = readIntArray(parsed.hiddenRows, 'hiddenRows');
  }
  if (parsed.columnOrder !== undefined) {
    result.columnOrder = readIntArray(parsed.columnOrder, 'columnOrder');
  }
  if (parsed.sort !== undefined) {
    result.sort = readSort(parsed.sort);
  }
  if (parsed.frozenRows !== undefined) {
    if (!isInteger(parsed.frozenRows)) {
      fail('frozenRows must be an integer');
    }
    result.frozenRows = parsed.frozenRows;
  }
  if (parsed.frozenCols !== undefined) {
    if (!isInteger(parsed.frozenCols)) {
      fail('frozenCols must be an integer');
    }
    result.frozenCols = parsed.frozenCols;
  }

  return result;
}
