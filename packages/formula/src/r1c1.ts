/**
 * R1C1 <-> A1 reference conversion utilities.
 *
 * These are standalone string helpers for translating between the two
 * spreadsheet addressing styles. They do not touch the lexer/parser: each
 * function takes a single reference string and a base cell (the cell the
 * relative R1C1 offsets are measured from) and returns the converted string.
 *
 * A1 semantics (zero-based internally via `@lattica/core`):
 *  - `A1`     — both parts relative
 *  - `$A$1`   — both parts absolute
 *  - `$A1`    — absolute column, relative row (mixed)
 *  - `A$1`    — relative column, absolute row (mixed)
 *
 * R1C1 semantics:
 *  - absolute part: `R` + (row + 1)            e.g. `R1`, `C3`
 *  - relative part: `R` (delta 0) or `R[delta]` e.g. `R`, `R[-2]`, `C[1]`
 */

import { parseA1, toA1 } from '@lattica/core';

/**
 * Matches a full R1C1 reference. Each of the row (`R…`) and column (`C…`)
 * components is independently absolute (`R1`) or relative (`R` / `R[±n]`).
 */
const R1C1_PATTERN = /^R(\d+|\[-?\d+\])?C(\d+|\[-?\d+\])?$/i;

/** A single parsed R1C1 axis component. */
interface AxisPart {
  /** True when the component is an absolute position (`R1`), false for relative. */
  readonly absolute: boolean;
  /** For absolute parts: the zero-based position. For relative: the signed delta. */
  readonly value: number;
}

/**
 * Test whether a string is a syntactically valid R1C1 reference.
 * Case-insensitive on the `R`/`C` markers.
 */
export function isR1C1(ref: string): boolean {
  return R1C1_PATTERN.test(ref.trim());
}

/** Format one A1 axis (absolute position or relative delta) as an R1C1 component. */
function formatAxis(marker: 'R' | 'C', position: number, base: number, absolute: boolean): string {
  if (absolute) {
    return `${marker}${position + 1}`;
  }
  const delta = position - base;
  return delta === 0 ? marker : `${marker}[${delta}]`;
}

/**
 * Convert an A1 reference to R1C1 notation relative to a base cell.
 *
 * Relative A1 parts become relative R1C1 offsets from `baseRow`/`baseCol`;
 * absolute (`$`) parts become absolute 1-based R1C1 positions.
 *
 * @param a1 - The A1 reference (e.g. `A1`, `$B$2`, `$A1`).
 * @param baseRow - Zero-based row the relative offsets are measured from.
 * @param baseCol - Zero-based column the relative offsets are measured from.
 * @throws SyntaxError if `a1` is not a valid A1 reference (via `parseA1`).
 */
export function a1ToR1C1(a1: string, baseRow: number, baseCol: number): string {
  const ref = parseA1(a1);
  const rowPart = formatAxis('R', ref.row, baseRow, ref.rowAbsolute);
  const colPart = formatAxis('C', ref.col, baseCol, ref.colAbsolute);
  return `${rowPart}${colPart}`;
}

/** Parse a single R1C1 axis component (the part captured after `R` or `C`). */
function parseAxis(raw: string | undefined): AxisPart {
  if (raw === undefined || raw === '') {
    // Bare marker (`R` / `C`): a relative reference with zero delta.
    return { absolute: false, value: 0 };
  }
  if (raw.startsWith('[')) {
    // Relative offset `[±n]`.
    const delta = Number.parseInt(raw.slice(1, -1), 10);
    return { absolute: false, value: delta };
  }
  // Absolute 1-based position; convert to zero-based.
  return { absolute: true, value: Number.parseInt(raw, 10) - 1 };
}

/**
 * Convert an R1C1 reference back to A1 notation relative to a base cell.
 *
 * Relative R1C1 offsets are resolved against `baseRow`/`baseCol` and emitted as
 * relative A1 parts; absolute R1C1 positions become `$`-prefixed A1 parts.
 *
 * @param r1c1 - The R1C1 reference (e.g. `R1C1`, `R[-2]C[-1]`, `RC[1]`).
 * @param baseRow - Zero-based row the relative offsets are resolved against.
 * @param baseCol - Zero-based column the relative offsets are resolved against.
 * @throws SyntaxError if `r1c1` is not a valid R1C1 reference.
 * @throws RangeError if a resolved row/column position is negative.
 */
export function r1c1ToA1(r1c1: string, baseRow: number, baseCol: number): string {
  const trimmed = r1c1.trim();
  const match = R1C1_PATTERN.exec(trimmed);
  if (match === null) {
    throw new SyntaxError(`invalid R1C1 reference: "${r1c1}"`);
  }
  const rowAxis = parseAxis(match[1]);
  const colAxis = parseAxis(match[2]);

  const row = rowAxis.absolute ? rowAxis.value : baseRow + rowAxis.value;
  const col = colAxis.absolute ? colAxis.value : baseCol + colAxis.value;

  if (row < 0) {
    throw new RangeError(`R1C1 resolves to a negative row in "${r1c1}"`);
  }
  if (col < 0) {
    throw new RangeError(`R1C1 resolves to a negative column in "${r1c1}"`);
  }

  return toA1({ row, col }, { colAbsolute: colAxis.absolute, rowAbsolute: rowAxis.absolute });
}
