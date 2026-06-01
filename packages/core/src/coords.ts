/**
 * Coordinate utilities for the Lattica grid.
 *
 * Cells are addressed internally by zero-based `{ row, col }` integer pairs.
 * Spreadsheet-style A1 notation (e.g. `A1`, `$B$2`, `AA10`) is supported for
 * import/export and the formula engine. This module is a clean-room
 * implementation: the conversion is a straightforward bijective base-26
 * (bijective hexavigesimal) encoding for columns plus a 1-based row index.
 */

/** A zero-based cell address. */
export interface CellAddress {
  readonly row: number;
  readonly col: number;
}

/** Maximum column index Lattica addresses with A1 notation (Excel parity: XFD = 16383). */
export const MAX_COLUMN_INDEX = 16383;

const A_CHAR_CODE = 65; // 'A'

/**
 * Convert a zero-based column index to its A1 letter label.
 * 0 -> "A", 25 -> "Z", 26 -> "AA", 701 -> "ZZ", 702 -> "AAA".
 */
export function columnIndexToLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`column index must be a non-negative integer, got ${index}`);
  }
  let label = '';
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(A_CHAR_CODE + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Convert an A1 column label to its zero-based index.
 * "A" -> 0, "Z" -> 25, "AA" -> 26. Case-insensitive.
 */
export function columnLabelToIndex(label: string): number {
  if (label.length === 0) {
    throw new SyntaxError('column label must not be empty');
  }
  let index = 0;
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    let value: number;
    if (code >= 65 && code <= 90) {
      value = code - 64; // 'A' -> 1
    } else if (code >= 97 && code <= 122) {
      value = code - 96; // 'a' -> 1
    } else {
      throw new SyntaxError(`invalid column label character: "${label[i]}"`);
    }
    index = index * 26 + value;
  }
  return index - 1;
}

const A1_PATTERN = /^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/;

/** A parsed A1 reference with absolute/relative flags preserved. */
export interface A1Reference extends CellAddress {
  readonly colAbsolute: boolean;
  readonly rowAbsolute: boolean;
}

/**
 * Parse an A1 reference such as "A1", "$B$2", "c10".
 * Returns a zero-based address plus the absolute-reference flags.
 */
export function parseA1(ref: string): A1Reference {
  const match = A1_PATTERN.exec(ref.trim());
  if (match === null) {
    throw new SyntaxError(`invalid A1 reference: "${ref}"`);
  }
  const [, colDollar, colLetters, rowDollar, rowDigits] = match;
  const col = columnLabelToIndex(colLetters!);
  const row = Number.parseInt(rowDigits!, 10) - 1;
  if (row < 0) {
    throw new SyntaxError(`row number must be >= 1 in "${ref}"`);
  }
  return {
    row,
    col,
    colAbsolute: colDollar === '$',
    rowAbsolute: rowDollar === '$',
  };
}

/** Serialize a zero-based address back to A1 notation. */
export function toA1(
  address: CellAddress,
  options: { colAbsolute?: boolean; rowAbsolute?: boolean } = {},
): string {
  const colPrefix = options.colAbsolute ? '$' : '';
  const rowPrefix = options.rowAbsolute ? '$' : '';
  return `${colPrefix}${columnIndexToLabel(address.col)}${rowPrefix}${address.row + 1}`;
}

/** Structural equality for two addresses. */
export function addressEquals(a: CellAddress, b: CellAddress): boolean {
  return a.row === b.row && a.col === b.col;
}

/** Stable string key for a cell address, suitable for Map/Set usage. */
export function addressKey(address: CellAddress): string {
  return `${address.row},${address.col}`;
}
