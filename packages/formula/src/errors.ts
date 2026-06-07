/**
 * Spreadsheet error values. These are first-class values that propagate through
 * evaluation exactly like Excel: any operation on an error yields that error.
 */

export const ERROR_TYPES = [
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#N/A',
  '#NUM!',
  '#CYCLE!',
  '#SPILL!',
  '#ERROR!',
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

/** A spreadsheet error value. */
export class FormulaError {
  constructor(
    readonly type: ErrorType,
    readonly message?: string,
  ) {}

  toString(): string {
    return this.type;
  }

  static is(value: unknown): value is FormulaError {
    return value instanceof FormulaError;
  }
}

export const DIV0 = new FormulaError('#DIV/0!');
export const VALUE = new FormulaError('#VALUE!');
export const REF = new FormulaError('#REF!');
export const NAME = new FormulaError('#NAME?');
export const NA = new FormulaError('#N/A');
export const NUM = new FormulaError('#NUM!');
export const CYCLE = new FormulaError('#CYCLE!');
export const SPILL = new FormulaError('#SPILL!');

/** Map a raw `#...!` token text to a FormulaError, or null if unrecognized. */
export function errorFromText(text: string): FormulaError | null {
  const upper = text.toUpperCase();
  const found = ERROR_TYPES.find((t) => t === upper);
  return found === undefined ? null : new FormulaError(found);
}
